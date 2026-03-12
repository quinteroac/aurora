import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatScreen } from "../src/App";
import { WebSocketRuntimeProvider } from "../src/websocket-runtime-provider";
import { streamNarratorResponse } from "../src/websocket-runtime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  public readyState = FakeWebSocket.CONNECTING;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(private readonly onSend: (socket: FakeWebSocket, payload: string) => void) {
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", { type: "open" });
    });
  }

  send(data: string): void {
    this.onSend(this, data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { type: "close" });
  }

  addEventListener(type: string, listener: Listener, options?: { once?: boolean }): void {
    const listeners = this.listeners.get(type) ?? [];

    if (options?.once) {
      const wrappedListener: Listener = (event) => {
        this.removeEventListener(type, wrappedListener);
        listener(event);
      };
      listeners.push(wrappedListener);
    } else {
      listeners.push(listener);
    }

    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener)
    );
  }

  emit(type: string, event: unknown): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }
}

describe("US-003 - Scene Image Display", () => {
  test("US-003-AC01: chat screen renders a dedicated scene image panel beside the chat panel", () => {
    const initialMessages = [
      {
        role: "user" as const,
        content: [{ type: "text", text: "Chart the obsidian coast" }],
      },
    ];
    const markup = renderToStaticMarkup(
      <WebSocketRuntimeProvider initialMessages={initialMessages}>
        <ChatScreen
          sceneImageSrc={null}
          previousSceneImageSrc={null}
          isCrossfading={false}
          isCurrentImageVisible={false}
        />
      </WebSocketRuntimeProvider>
    );

    expect(markup).toContain('class="chat-panel"');
    expect(markup).toContain('class="scene-image-panel"');
    expect(markup).toContain('aria-label="Scene image panel"');
  });

  test("US-003-AC02: scene_image websocket events normalize base64 and URL payloads for panel updates", async () => {
    const receivedSceneImages: string[] = [];
    const createSocket = (_url: string): WebSocket => {
      const socket = new FakeWebSocket((ws) => {
        setTimeout(() => {
          ws.emit("message", {
            data: JSON.stringify({ type: "scene_image", image_b64: "ZmFrZS1pbWFnZS1ieXRlcw==" }),
          });
        }, 0);
        setTimeout(() => {
          ws.emit("message", {
            data: JSON.stringify({ type: "scene_image", url: "https://cdn.example.com/scene-2.png" }),
          });
        }, 1);
        setTimeout(() => {
          ws.emit("message", { data: JSON.stringify({ type: "done" }) });
        }, 2);
      });

      return socket as unknown as WebSocket;
    };

    const stream = streamNarratorResponse("Describe the crystal cave", {
      createSocket,
      onSceneImage: (imageSrc) => {
        receivedSceneImages.push(imageSrc);
      },
    });

    for await (const _text of stream) {
      // consume the stream until done
    }

    expect(receivedSceneImages[0]).toBe("data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==");
    expect(receivedSceneImages[1]).toBe("https://cdn.example.com/scene-2.png");

    const appSource = readFileSync(path.join(repoRoot, "apps/frontend/src/App.tsx"), "utf8");
    expect(appSource).toContain("onSceneImage");
    expect(appSource).toContain("setSceneImageSrc");
  });

  test("US-003-AC03: placeholder renders with awaiting label and dark background styles", () => {
    const markup = renderToStaticMarkup(
      <WebSocketRuntimeProvider>
        <ChatScreen
          sceneImageSrc={null}
          previousSceneImageSrc={null}
          isCrossfading={false}
          isCurrentImageVisible={false}
        />
      </WebSocketRuntimeProvider>
    );
    const styles = readFileSync(path.join(repoRoot, "apps/frontend/src/App.css"), "utf8");

    expect(markup).toContain("Awaiting scene...");
    expect(styles).toContain(".scene-image-placeholder");
    expect(styles).toContain(".scene-image-viewport");
    expect(styles).toContain("linear-gradient(180deg");
  });

  test("US-003-AC04: crossfade is implemented with opacity transitions", () => {
    const styles = readFileSync(path.join(repoRoot, "apps/frontend/src/App.css"), "utf8");

    expect(styles).toContain("transition: opacity 360ms ease");
    expect(styles).toContain(".scene-image-layer-current.is-visible");
    expect(styles).toContain(".scene-image-layer-previous.is-hidden");
  });

  test("US-003-AC05: responsive rule collapses image panel below chat under 768px", () => {
    const styles = readFileSync(path.join(repoRoot, "apps/frontend/src/App.css"), "utf8");

    expect(styles).toContain("@media (width < 768px)");
    expect(styles).toContain("grid-template-columns: 1fr");
    expect(styles).toContain(".scene-image-panel");
    expect(styles).toContain("order: 2");
  });

  test("US-003-AC06: typecheck and lint pass with no errors", () => {
    const typecheck = Bun.spawnSync({
      cmd: ["bun", "x", "tsc", "--noEmit", "-p", "apps/frontend/tsconfig.app.json"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const lint = Bun.spawnSync({
      cmd: [
        "bun",
        "x",
        "eslint",
        "apps/frontend/src/**/*.ts",
        "apps/frontend/src/**/*.tsx",
        "--max-warnings=0",
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(typecheck.exitCode).toBe(0);
    expect(lint.exitCode).toBe(0);
  });

  test("US-003-AC07: visual verification checklist records placeholder, crossfade, and responsive layout", () => {
    const visualVerificationPath = path.join(repoRoot, "apps/frontend/visual-verification.md");
    const content = readFileSync(visualVerificationPath, "utf8");

    expect(content).toContain("US-003 Visual Verification");
    expect(content).toContain("placeholder renders on load");
    expect(content).toContain("new image replaces placeholder with crossfade");
    expect(content).toContain("responsive layout is correct");
  });
});
