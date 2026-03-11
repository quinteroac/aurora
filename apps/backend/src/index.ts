import { Elysia } from "elysia";
import { narratorAgent } from "./agent/narrator";

export const backendServiceName = "backend";
export const defaultPort = 3000;
export const registeredAgents = [narratorAgent];

type LogPayload = {
  event: string;
  service: string;
  [key: string]: unknown;
};

export const writeStructuredLog = (payload: LogPayload): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const resolvePort = (port = process.env.PORT): number => {
  if (!port) {
    return defaultPort;
  }

  const parsedPort = Number.parseInt(port, 10);
  return Number.isFinite(parsedPort) ? parsedPort : defaultPort;
};

type NarratorToolResult = {
  payload?: {
    toolName?: string;
    result?: unknown;
    isError?: boolean;
  };
};

type NarratorOutput = {
  text: string;
  toolResults?: NarratorToolResult[];
};

export type RunNarrator = (message: string) => Promise<NarratorOutput>;
type NarratorStreamHandlers = {
  onToken: (token: string) => void;
  onToolResult: (toolResult: NarratorToolResult) => void;
};
export type RunNarratorStream = (message: string, handlers: NarratorStreamHandlers) => Promise<void>;

const imageGenerationFailurePrefix = "Image generation failed:";

const collectGeneratedImages = (toolResults: NarratorToolResult[] = []): string[] => {
  const images: string[] = [];

  for (const toolResult of toolResults) {
    const payload = toolResult.payload;
    if (payload?.toolName !== "generate_image") {
      continue;
    }

    if (payload.isError) {
      throw new Error("generate_image tool execution failed");
    }

    if (typeof payload.result !== "string") {
      throw new Error("generate_image tool returned invalid image payload");
    }

    if (payload.result.startsWith(imageGenerationFailurePrefix)) {
      throw new Error(payload.result);
    }

    images.push(payload.result);
  }

  return images;
};

const parseMessage = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const rawMessage = (body as { message?: unknown }).message;
  if (typeof rawMessage !== "string") {
    return null;
  }

  const message = rawMessage.trim();
  return message.length > 0 ? message : null;
};

export const runNarrator: RunNarrator = async (message) => {
  return narratorAgent.generate(message);
};

const tokenizeNarration = (text: string): string[] => {
  return text.match(/\S+\s*/g) ?? [];
};

export const runNarratorStream: RunNarratorStream = async (message, handlers) => {
  const narratorOutput = await runNarrator(message);

  for (const token of tokenizeNarration(narratorOutput.text)) {
    handlers.onToken(token);
  }

  for (const toolResult of narratorOutput.toolResults ?? []) {
    handlers.onToolResult(toolResult);
  }
};

type WebsocketFrame =
  | { type: "token"; content: string }
  | { type: "image"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

const sendWsFrame = (ws: { send(data: string): unknown }, frame: WebsocketFrame): void => {
  ws.send(JSON.stringify(frame));
};

const decodeIncomingWsFrame = (rawFrame: unknown): string | null => {
  if (typeof rawFrame === "string") {
    return rawFrame;
  }

  if (rawFrame instanceof ArrayBuffer) {
    return new TextDecoder().decode(rawFrame);
  }

  if (ArrayBuffer.isView(rawFrame)) {
    return new TextDecoder().decode(rawFrame);
  }

  return null;
};

const parseIncomingWsFrame = (rawFrame: unknown): string | null => {
  if (typeof rawFrame === "object" && rawFrame !== null) {
    return parseMessage(rawFrame);
  }

  const frameText = decodeIncomingWsFrame(rawFrame);
  if (!frameText) {
    return null;
  }

  try {
    const parsedFrame = JSON.parse(frameText) as unknown;
    return parseMessage(parsedFrame);
  } catch {
    return null;
  }
};

const readGeneratedImageFromToolResult = (toolResult: NarratorToolResult): string | null => {
  const payload = toolResult.payload;
  if (payload?.toolName !== "generate_image") {
    return null;
  }

  if (payload.isError) {
    throw new Error("generate_image tool execution failed");
  }

  if (typeof payload.result !== "string") {
    throw new Error("generate_image tool returned invalid image payload");
  }

  if (payload.result.startsWith(imageGenerationFailurePrefix)) {
    throw new Error(payload.result);
  }

  return payload.result;
};

export const createApp = ({
  runNarrator: executeNarrator = runNarrator,
  runNarratorStream: executeNarratorStream = runNarratorStream,
}: { runNarrator?: RunNarrator; runNarratorStream?: RunNarratorStream } = {}) =>
  new Elysia()
    .get("/health", () => ({
      status: "ok",
      service: backendServiceName,
    }))
    .ws("/ws", {
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
          await executeNarratorStream(message, {
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
                content: image,
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
    })
    .post("/chat", async ({ body, set }) => {
      const message = parseMessage(body);
      if (!message) {
        set.status = 400;
        return { error: "message is required" };
      }

      try {
        const narratorOutput = await executeNarrator(message);
        const images = collectGeneratedImages(narratorOutput.toolResults);

        return {
          response: narratorOutput.text,
          images,
        };
      } catch {
        set.status = 500;
        return { error: "agent invocation failed" };
      }
    });

if (import.meta.main) {
  for (const agent of registeredAgents) {
    writeStructuredLog({
      event: "agent_registered",
      service: backendServiceName,
      agentId: agent.id,
    });
  }

  createApp().listen(resolvePort());
}
