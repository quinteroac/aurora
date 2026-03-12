import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChatModelRunOptions } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatScreen } from "../src/App";
import { createWebSocketChatModelAdapter, streamNarratorResponse } from "../src/websocket-runtime";

const repoRoot = path.resolve(import.meta.dir, "../../..");

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  public readyState = FakeWebSocket.CONNECTING;
  public sentPayloads: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(private readonly onSend: (socket: FakeWebSocket, payload: string) => void) {
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", { type: "open" });
    });
  }

  send(data: string): void {
    this.sentPayloads.push(data);
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

const createStreamingSocketFactory = (
  tokens: string[],
  captureSocket: (socket: FakeWebSocket) => void
): ((url: string) => WebSocket) => {
  return (_url) => {
    const socket = new FakeWebSocket((ws) => {
      tokens.forEach((token, index) => {
        setTimeout(() => {
          ws.emit("message", { data: JSON.stringify({ type: "token", content: token }) });
        }, index);
      });

      setTimeout(() => {
        ws.emit("message", { data: JSON.stringify({ type: "done" }) });
      }, tokens.length);
    });

    captureSocket(socket);
    return socket as unknown as WebSocket;
  };
};

const createRunOptions = (messages: unknown): ChatModelRunOptions => {
  return {
    messages: messages as ChatModelRunOptions["messages"],
    runConfig: {},
    abortSignal: new AbortController().signal,
    context: {} as ChatModelRunOptions["context"],
    config: {} as ChatModelRunOptions["config"],
    unstable_getMessage: () => {
      throw new Error("Not needed for this test");
    },
  } as ChatModelRunOptions;
};

describe("US-002 - Streamed Narrative Chat", () => {
  test("US-002-AC01: assistant-ui chat component is mounted on chat app state", () => {
    const markup = renderToStaticMarkup(<ChatScreen firstPlayerMessage="A drifting city" />);

    expect(markup).toContain('aria-label="Adventure chat view"');
    expect(markup).toContain('data-testid="assistant-chat-thread"');
  });

  test("US-002-AC02: player message is sent to backend over websocket", async () => {
    let socket: FakeWebSocket | null = null;
    const createSocket = createStreamingSocketFactory(["A ", "path"], (createdSocket) => {
      socket = createdSocket;
    });

    const stream = streamNarratorResponse("Open the iron gate", { createSocket });

    for await (const _ of stream) {
      // consume full stream
    }

    expect(socket).not.toBeNull();
    expect(socket?.sentPayloads).toEqual([JSON.stringify({ message: "Open the iron gate" })]);
  });

  test("US-002-AC03: assistant responses stream incrementally via assistant-ui chat model adapter", async () => {
    let socket: FakeWebSocket | null = null;
    const adapter = createWebSocketChatModelAdapter({
      createSocket: createStreamingSocketFactory(["The ", "lantern ", "flares."], (createdSocket) => {
        socket = createdSocket;
      }),
    });

    const runResult = adapter.run(
      createRunOptions([
        {
          id: "msg-user-1",
          role: "user",
          content: [{ type: "text", text: "Light the lantern" }],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
        },
      ])
    );

    const streamedTexts: string[] = [];

    if (!(Symbol.asyncIterator in runResult)) {
      throw new Error("Expected streaming async generator result");
    }

    for await (const chunk of runResult) {
      const firstPart = chunk.content?.[0];
      if (firstPart?.type === "text") {
        streamedTexts.push(firstPart.text);
      }
    }

    expect(streamedTexts).toEqual(["The ", "The lantern ", "The lantern flares."]);
    expect(socket?.sentPayloads[0]).toBe(JSON.stringify({ message: "Light the lantern" }));
  });

  test("US-002-AC04: typing indicator is wired to thread running state", () => {
    const appSource = readFileSync(path.join(repoRoot, "apps/frontend/src/App.tsx"), "utf8");

    expect(appSource).toContain("<ThreadPrimitive.If running>");
    expect(appSource).toContain("Narrator is weaving the next scene");
  });

  test("US-002-AC05: session history is preserved by selecting the latest user turn for each run", async () => {
    let socket: FakeWebSocket | null = null;
    const adapter = createWebSocketChatModelAdapter({
      createSocket: createStreamingSocketFactory(["A "], (createdSocket) => {
        socket = createdSocket;
      }),
    });

    const runResult = adapter.run(
      createRunOptions([
        {
          id: "msg-user-1",
          role: "user",
          content: [{ type: "text", text: "First command" }],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "First reply" }],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
        },
        {
          id: "msg-user-2",
          role: "user",
          content: [{ type: "text", text: "Second command" }],
          status: { type: "running" },
          createdAt: new Date(),
        },
      ])
    );

    if (!(Symbol.asyncIterator in runResult)) {
      throw new Error("Expected streaming async generator result");
    }

    const firstChunk = await runResult.next();

    expect(firstChunk.value?.content?.[0]).toEqual({ type: "text", text: "A " });
    expect(socket?.sentPayloads[0]).toBe(JSON.stringify({ message: "Second command" }));
  });

  test("US-002-AC06: typecheck and lint pass with no errors", () => {
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

  test("US-002-AC07: visual verification checklist records streaming chat behavior", () => {
    const visualVerificationPath = path.join(repoRoot, "apps/frontend/visual-verification.md");
    const content = readFileSync(visualVerificationPath, "utf8");

    expect(content).toContain("US-002 Visual Verification");
    expect(content).toContain("message sends over websocket");
    expect(content).toContain("streaming text appears incrementally");
    expect(content).toContain("full response persists in the chat history");
  });
});
