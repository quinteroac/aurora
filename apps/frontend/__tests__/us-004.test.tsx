import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import { createWebSocketConnectionStatusController } from "../src/websocket-connection-status";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  public readyState = FakeWebSocket.CONNECTING;
  private readonly listeners = new Map<string, Listener[]>();

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

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", { type: "open" });
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { type: "close" });
  }
}

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

describe("US-004 - WebSocket Connection Status Indicator", () => {
  test("US-004-AC01: status badge is visible in the UI", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('class="connection-status-badge"');
    expect(markup).toContain('class="connection-status-dot"');
    expect(markup).toContain("Disconnected");
  });

  test("US-004-AC02: unexpected close updates status and shows a non-blocking notice", () => {
    const sockets: FakeWebSocket[] = [];
    const statuses: string[] = [];
    const notices: Array<string | null> = [];

    const controller = createWebSocketConnectionStatusController({
      wsUrl: "ws://example.com/ws",
      createSocket: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onStatusChange: (status) => {
        statuses.push(status);
      },
      onNoticeChange: (notice) => {
        notices.push(notice);
      },
      reconnectDelayMs: 5,
    });

    controller.start();
    sockets[0]?.open();
    sockets[0]?.close();

    expect(statuses).toContain("connected");
    expect(statuses.at(-1)).toBe("disconnected");
    expect(notices.at(-1)).toBe("Connection lost. Attempting to reconnect...");

    controller.stop();
  });

  test("US-004-AC03: client attempts a single reconnect after unexpected disconnect", async () => {
    const sockets: FakeWebSocket[] = [];

    const controller = createWebSocketConnectionStatusController({
      wsUrl: "ws://example.com/ws",
      createSocket: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      onStatusChange: () => {
        // status assertions are covered by AC02
      },
      onNoticeChange: () => {
        // notice assertions are covered by AC02
      },
      reconnectDelayMs: 10,
    });

    controller.start();
    sockets[0]?.open();
    sockets[0]?.close();

    await sleep(20);
    expect(sockets.length).toBe(2);

    sockets[1]?.open();
    sockets[1]?.close();
    await sleep(20);

    expect(sockets.length).toBe(2);

    controller.stop();
  });

  test("US-004-AC04: typecheck and lint pass with no errors", () => {
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

  test("US-004-AC05: visual verification checklist records disconnect simulation behavior", () => {
    const visualVerificationPath = path.join(repoRoot, "apps/frontend/visual-verification.md");
    const content = readFileSync(visualVerificationPath, "utf8");

    expect(content).toContain("US-004 Visual Verification");
    expect(content).toContain("DevTools offline toggles status from connected to disconnected");
    expect(content).toContain("single reconnect attempt fires after ~3 seconds");
  });
});
