import { Elysia } from "elysia";
import {
  type RunNarratorStream,
  parseIncomingWsFrame,
  sendWsFrame,
  readGeneratedImageFromToolResult,
} from "./shared";
// NOTE: keep media service access server-side so large images never enter the LLM context.

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
        const socket = ws as unknown as {
          send(data: string): unknown;
          data?: { __auroraHistory?: { role: "user" | "assistant"; content: string }[] };
        };
        if (!socket.data) socket.data = {};
        if (!socket.data.__auroraHistory) socket.data.__auroraHistory = [];
        socket.data.__auroraHistory.push({ role: "user", content: message });

        let assistantText = "";

        await deps.runNarratorStream(socket.data.__auroraHistory, {
          onToken: (token) => {
            assistantText += token;
            sendWsFrame(ws, {
              type: "token",
              content: token,
            });
          },
          onToolResult: async (toolResult) => {
            const image = readGeneratedImageFromToolResult(toolResult);
            if (!image) return;

            // If tool returned a media-service URL, fetch bytes and forward as base64 to the frontend.
            if (image.startsWith("http")) {
              try {
                const response = await fetch(image);
                if (response.ok) {
                  const bytes = Buffer.from(await response.arrayBuffer());
                  sendWsFrame(ws, {
                    type: "scene_image",
                    image_b64: bytes.toString("base64"),
                  });
                  return;
                }
              } catch {
                // fall through to URL frame
              }
            }

            // Fallback: send URL (frontend can try to load it directly).
            sendWsFrame(ws, { type: "scene_image", url: image });
          },
        });

        // Persist assistant text into history so next user message has context.
        if (assistantText.trim().length > 0) {
          socket.data.__auroraHistory.push({ role: "assistant", content: assistantText });
        }

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
