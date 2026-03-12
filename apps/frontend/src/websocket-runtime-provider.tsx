"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { INTERNAL } from "@assistant-ui/react";
import { LocalRuntimeCore } from "@assistant-ui/core/internal";
import { createWebSocketChatModelAdapter, resolveBackendWsUrl } from "./websocket-runtime";

const { AssistantRuntimeImpl } = INTERNAL;

export type WebSocketRuntimeProviderProps = {
  initialMessages?: readonly ThreadMessageLike[];
  onSceneImage?: (imageSrc: string) => void;
  children: ReactNode;
};

export function WebSocketRuntimeProvider({
  initialMessages,
  onSceneImage,
  children,
}: WebSocketRuntimeProviderProps) {
  const onSceneImageRef = useRef(onSceneImage);
  onSceneImageRef.current = onSceneImage;

  const socketRef = useRef<WebSocket | null>(null);

  const getSocket = useCallback((): WebSocket => {
    if (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN) {
      socketRef.current = new WebSocket(resolveBackendWsUrl());
    }
    return socketRef.current;
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const chatModel = useMemo(
    () =>
      createWebSocketChatModelAdapter({
        getSocket,
        onSceneImage: (src) => onSceneImageRef.current?.(src),
      }),
    [getSocket]
  );

  const [core] = useState(
    () => new LocalRuntimeCore({ adapters: { chatModel } }, initialMessages)
  );

  const runtime = useMemo(() => new AssistantRuntimeImpl(core), [core]);

  useEffect(() => {
    const mainThread = core.threads.getMainThreadRuntimeCore();
    const mainCore = mainThread as {
      __internal_setOptions?: (opts: unknown) => void;
      __internal_load?: () => void;
      detach?: () => void;
    };
    mainCore.__internal_setOptions?.({ adapters: { chatModel } });
    mainCore.__internal_load?.();
    return () => {
      mainCore.detach?.();
    };
  }, [core, chatModel]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
