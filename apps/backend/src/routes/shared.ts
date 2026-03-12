export type NarratorToolResult = {
  payload?: {
    toolName?: string;
    result?: unknown;
    isError?: boolean;
  };
};

export type NarratorOutput = {
  text: string;
  toolResults?: NarratorToolResult[];
};

export type RunNarrator = (message: string) => Promise<NarratorOutput>;

export type NarratorStreamHandlers = {
  onToken: (token: string) => void;
  onToolResult: (toolResult: NarratorToolResult) => void;
};

export type RunNarratorStream = (message: string, handlers: NarratorStreamHandlers) => Promise<void>;

const imageGenerationFailurePrefix = "Image generation failed:";

export const parseMessage = (body: unknown): string | null => {
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

export const collectGeneratedImages = (toolResults: NarratorToolResult[] = []): string[] => {
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

export const tokenizeNarration = (text: string): string[] => {
  return text.match(/\S+\s*/g) ?? [];
};

export type WebsocketFrame =
  | { type: "token"; content: string }
  | { type: "image"; image_b64: string }
  | { type: "done" }
  | { type: "error"; message: string };

export const sendWsFrame = (ws: { send(data: string): unknown }, frame: WebsocketFrame): void => {
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

export const parseIncomingWsFrame = (rawFrame: unknown): string | null => {
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

export const readGeneratedImageFromToolResult = (toolResult: NarratorToolResult): string | null => {
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
