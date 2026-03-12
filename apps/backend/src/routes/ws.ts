import { Elysia } from "elysia";
import {
  type RunNarratorStream,
  parseIncomingWsFrame,
  sendWsFrame,
  readGeneratedImageFromToolResult,
} from "./shared";

export const wsRoutes = (deps: { runNarratorStream: RunNarratorStream }) =>
  new Elysia().ws("/ws", {
    message: async (ws, rawFrame) => {
      const message = parseIncomingWsFrame(rawFrame);
      if (!message) {
        sendWsFrame(ws, {
          type: "error",
          message: "malformed frame",
        });
        return;
      }

      try {
        await deps.runNarratorStream(message, {
          onToken: (token) => {
            sendWsFrame(ws, {
              type: "token",
              content: token,
            });
          },
          onToolResult: (toolResult) => {
            const image = readGeneratedImageFromToolResult(toolResult);
            if (!image) {
              return;
            }

            sendWsFrame(ws, {
              type: "image",
              image_b64: image,
            });
          },
        });

        sendWsFrame(ws, { type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "agent invocation failed";
        sendWsFrame(ws, {
          type: "error",
          message,
        });
      }
    },
  });
