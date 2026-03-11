import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createApp, type RunNarratorStream } from "../src/index";

const repoRoot = path.resolve(import.meta.dir, "../../..");

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

    const handleOpen = () => {
      clearTimeout(timeout);
      resolve();
    };

    const handleError = () => {
      clearTimeout(timeout);
      reject(new Error("websocket open failed"));
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

const waitForJsonFrame = (socket: WebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket frame"));
    }, 2_000);

    const handleMessage = (event: MessageEvent) => {
      clearTimeout(timeout);

      const rawFrame = decodeFrameData(event.data);
      resolve(JSON.parse(rawFrame) as Record<string, unknown>);
    };

    const handleError = () => {
      clearTimeout(timeout);
      reject(new Error("websocket message error"));
    };

    socket.addEventListener("message", handleMessage, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

const startSocketServer = (runNarratorStream: RunNarratorStream) => {
  const app = createApp({
    runNarratorStream,
  });
  app.listen(0);
  const wsUrl = `ws://127.0.0.1:${app.server?.port}/ws`;

  return {
    wsUrl,
    stop: () => {
      app.stop();
    },
  };
};

describe("US-004 - WebSocket /ws streaming endpoint", () => {
  test("US-004-AC01: connecting to ws://localhost:<BACKEND_PORT>/ws establishes a session", async () => {
    const server = startSocketServer(async () => {});
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      expect(socket.readyState).toBe(WebSocket.OPEN);
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC02: sending { message } starts agent inference", async () => {
    const receivedMessages: string[] = [];
    const server = startSocketServer(async (message) => {
      receivedMessages.push(message);
    });
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Walk into the shrine." }));

      const doneFrame = await waitForJsonFrame(socket);

      expect(receivedMessages).toEqual(["Walk into the shrine."]);
      expect(doneFrame).toEqual({ type: "done" });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC03: each text token is sent as { type: token, content }", async () => {
    const server = startSocketServer(async (_message, handlers) => {
      handlers.onToken("The ");
      handlers.onToken("portal");
    });
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Describe the portal." }));

      const tokenA = await waitForJsonFrame(socket);
      const tokenB = await waitForJsonFrame(socket);
      const done = await waitForJsonFrame(socket);

      expect(tokenA).toEqual({ type: "token", content: "The " });
      expect(tokenB).toEqual({ type: "token", content: "portal" });
      expect(done).toEqual({ type: "done" });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC04: completed generate_image tool call emits an image frame", async () => {
    const server = startSocketServer(async (_message, handlers) => {
      handlers.onToolResult({
        payload: {
          toolName: "generate_image",
          result: "base64-image-data",
        },
      });
    });
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Show the ancient gate." }));

      const imageFrame = await waitForJsonFrame(socket);
      const doneFrame = await waitForJsonFrame(socket);

      expect(imageFrame).toEqual({
        type: "image",
        content: "base64-image-data",
      });
      expect(doneFrame).toEqual({ type: "done" });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC05: full response completion emits { type: done }", async () => {
    const server = startSocketServer(async () => {});
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Continue the tale." }));

      const doneFrame = await waitForJsonFrame(socket);
      expect(doneFrame).toEqual({ type: "done" });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC06: errors emit { type: error, message }", async () => {
    const server = startSocketServer(async () => {
      throw new Error("provider unavailable");
    });
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send(JSON.stringify({ message: "Continue the tale." }));

      const errorFrame = await waitForJsonFrame(socket);
      expect(errorFrame).toEqual({
        type: "error",
        message: "provider unavailable",
      });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC07: outgoing frames are valid JSON and malformed input gets error frame", async () => {
    const server = startSocketServer(async () => {});
    const socket = new WebSocket(server.wsUrl);

    try {
      await waitForSocketOpen(socket);
      socket.send("{ malformed json }");

      const errorFrame = await waitForJsonFrame(socket);
      expect(errorFrame).toEqual({
        type: "error",
        message: "malformed frame",
      });
    } finally {
      socket.close();
      server.stop();
    }
  });

  test("US-004-AC08: typecheck / lint passes", () => {
    const typecheck = Bun.spawnSync({
      cmd: ["bun", "run", "typecheck"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const lint = Bun.spawnSync({
      cmd: ["bun", "run", "lint"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(typecheck.exitCode).toBe(0);
    expect(lint.exitCode).toBe(0);
  });
});
