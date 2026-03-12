import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";

type NarratorTokenFrame = {
  type: "token";
  content: string;
};

type NarratorDoneFrame = {
  type: "done";
};

type NarratorErrorFrame = {
  type: "error";
  message: string;
};

type NarratorImageFrame = {
  type: "image";
  image_b64: string;
};

type NarratorSceneImageFrame = {
  type: "scene_image";
  image_b64?: string;
  image_url?: string;
  url?: string;
  image?: string;
};

type NarratorFrame =
  | NarratorTokenFrame
  | NarratorDoneFrame
  | NarratorErrorFrame
  | NarratorImageFrame
  | NarratorSceneImageFrame;

type WebSocketFactory = (url: string) => WebSocket;

type StreamNarratorResponseDeps = {
  createSocket?: WebSocketFactory;
  wsUrl?: string;
  abortSignal?: AbortSignal;
  onSceneImage?: (imageSrc: string) => void;
};

const BACKEND_URL_FALLBACK = "http://localhost:3000";

const resolveBackendHttpUrl = (): string => {
  const configuredUrl = (import.meta as ImportMeta & { env?: { VITE_BACKEND_URL?: string } }).env
    ?.VITE_BACKEND_URL;

  return configuredUrl && configuredUrl.trim().length > 0
    ? configuredUrl.trim()
    : BACKEND_URL_FALLBACK;
};

export const resolveBackendWsUrl = (): string => {
  const backendUrl = new URL(resolveBackendHttpUrl());
  const wsProtocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${wsProtocol}//${backendUrl.host}/ws`;
};

const isNarratorFrame = (payload: unknown): payload is NarratorFrame => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as {
    type?: unknown;
    content?: unknown;
    message?: unknown;
    image_b64?: unknown;
    image_url?: unknown;
    url?: unknown;
    image?: unknown;
  };

  if (candidate.type === "done") {
    return true;
  }

  if (candidate.type === "image") {
    return typeof candidate.image_b64 === "string";
  }

  if (candidate.type === "scene_image") {
    return (
      typeof candidate.image_b64 === "string" ||
      typeof candidate.image_url === "string" ||
      typeof candidate.url === "string" ||
      typeof candidate.image === "string"
    );
  }

  if (candidate.type === "token") {
    return typeof candidate.content === "string";
  }

  if (candidate.type === "error") {
    return typeof candidate.message === "string";
  }

  return false;
};

const readLatestUserText = (messages: readonly ThreadMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  throw new Error("Cannot stream a response without a user message.");
};

const toTextContent = (text: string): ThreadAssistantMessagePart[] => {
  return [
    {
      type: "text",
      text,
    },
  ];
};

const toSceneImageSource = (frame: NarratorImageFrame | NarratorSceneImageFrame): string => {
  const rawImage =
    frame.type === "image"
      ? frame.image_b64
      : frame.image_url ?? frame.url ?? frame.image_b64 ?? frame.image ?? "";
  const image = rawImage.trim();

  if (image.startsWith("http://") || image.startsWith("https://") || image.startsWith("data:")) {
    return image;
  }

  return `data:image/png;base64,${image}`;
};

const waitForSocketEvent = (
  socket: WebSocket,
  abortSignal?: AbortSignal
): Promise<NarratorFrame> => {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<string>) => {
      cleanup();

      try {
        const decoded = JSON.parse(event.data) as unknown;
        if (!isNarratorFrame(decoded)) {
          reject(new Error("Received an unknown websocket frame."));
          return;
        }

        resolve(decoded);
      } catch {
        reject(new Error("Received malformed websocket JSON."));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("WebSocket connection failed."));
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket connection closed before completion."));
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("request aborted"));
    };

    const cleanup = () => {
      socket.removeEventListener("message", onMessage as EventListener);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    socket.addEventListener("message", onMessage as EventListener, { once: true });
    socket.addEventListener("error", onError, { once: true });
    socket.addEventListener("close", onClose, { once: true });
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    if (abortSignal?.aborted) {
      onAbort();
    }
  });
};

const waitForSocketOpen = (socket: WebSocket, abortSignal?: AbortSignal): Promise<void> => {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("WebSocket connection failed."));
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("request aborted"));
    };

    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    if (abortSignal?.aborted) {
      onAbort();
    }
  });
};

export const streamNarratorResponse = async function* (
  message: string,
  deps: StreamNarratorResponseDeps = {}
): AsyncGenerator<string, void> {
  const createSocket = deps.createSocket ?? ((url) => new WebSocket(url));
  const socket = createSocket(deps.wsUrl ?? resolveBackendWsUrl());

  await waitForSocketOpen(socket, deps.abortSignal);
  socket.send(JSON.stringify({ message }));

  let text = "";

  try {
    while (true) {
      const frame = await waitForSocketEvent(socket, deps.abortSignal);

      if (frame.type === "token") {
        text += frame.content;
        yield text;
        continue;
      }

      if (frame.type === "image") {
        deps.onSceneImage?.(toSceneImageSource(frame));
        continue;
      }

      if (frame.type === "scene_image") {
        deps.onSceneImage?.(toSceneImageSource(frame));
        continue;
      }

      if (frame.type === "error") {
        throw new Error(frame.message);
      }

      return;
    }
  } finally {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }
};

export const createWebSocketChatModelAdapter = (
  deps: Omit<StreamNarratorResponseDeps, "abortSignal"> = {}
): ChatModelAdapter => {
  return {
    run: async function* (options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const userMessage = readLatestUserText(options.messages);

      for await (const streamedText of streamNarratorResponse(userMessage, {
        ...deps,
        abortSignal: options.abortSignal,
      })) {
        yield {
          content: toTextContent(streamedText),
        };
      }
    },
  };
};
