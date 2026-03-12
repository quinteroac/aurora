import { describe, expect, test } from "bun:test";
import { createApp, type RunNarratorStream } from "../index";

const decodeFrameData = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  return String(data);
};

const waitForSocketOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket open"));
    }, 2_000);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("websocket open failed"));
      },
      { once: true }
    );
  });

const waitForJsonFrame = (socket: WebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket frame"));
    }, 2_000);

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(decodeFrameData(event.data)) as Record<string, unknown>);
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("websocket message error"));
      },
      { once: true }
    );
  });

const startSocketServer = (runNarratorStream: RunNarratorStream) => {
  const app = createApp({
    runNarratorStream,
  });
  app.listen(0);

  return {
    wsUrl: `ws://127.0.0.1:${app.server?.port}/ws`,
    stop: () => app.stop(),
  };
};

describe("US-005 integration: websocket endpoint", () => {
  test("US-005-AC03: streams token frames and finishes with done frame", async () => {
    const server = startSocketServer(async (_message, handlers) => {
      handlers.onToken("A ");
      handlers.onToken("gate ");
      handlers.onToken("opens.");
    });
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Open the gate." }));

      const tokenA = await waitForJsonFrame(socket);
      const tokenB = await waitForJsonFrame(socket);
      const tokenC = await waitForJsonFrame(socket);
      const done = await waitForJsonFrame(socket);

      expect(tokenA).toEqual({ type: "token", content: "A " });
      expect(tokenB).toEqual({ type: "token", content: "gate " });
      expect(tokenC).toEqual({ type: "token", content: "opens." });
      expect(done).toEqual({ type: "done" });
    } finally {
      socket.close();
      server.stop();
    }
  });
});
