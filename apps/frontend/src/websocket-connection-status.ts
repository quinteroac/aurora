import { useEffect, useState } from "react";
import { resolveBackendWsUrl } from "./websocket-runtime";

export type WebSocketConnectionStatus = "connected" | "disconnected";

type WebSocketFactory = (url: string) => WebSocket;

type ConnectionStatusControllerDeps = {
  createSocket?: WebSocketFactory;
  wsUrl?: string;
  reconnectDelayMs?: number;
  onStatusChange: (status: WebSocketConnectionStatus) => void;
  onNoticeChange: (notice: string | null) => void;
};

type ConnectionStatusController = {
  start: () => void;
  stop: () => void;
};

const DEFAULT_RECONNECT_DELAY_MS = 3000;

export const createWebSocketConnectionStatusController = (
  deps: ConnectionStatusControllerDeps
): ConnectionStatusController => {
  const createSocket = deps.createSocket ?? ((url) => new WebSocket(url));
  const wsUrl = deps.wsUrl ?? resolveBackendWsUrl();
  const reconnectDelayMs = deps.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;

  let socket: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let hasAttemptedReconnect = false;
  let isStopped = false;
  let isIntentionalClose = false;

  const clearReconnectTimer = () => {
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  const connect = () => {
    if (isStopped) {
      return;
    }

    socket = createSocket(wsUrl);

    socket.addEventListener("open", () => {
      deps.onStatusChange("connected");
      deps.onNoticeChange(null);
    });

    socket.addEventListener("error", () => {
      deps.onStatusChange("disconnected");
    });

    socket.addEventListener("close", () => {
      socket = null;
      deps.onStatusChange("disconnected");

      if (isStopped || isIntentionalClose) {
        return;
      }

      deps.onNoticeChange("Connection lost. Attempting to reconnect...");

      if (hasAttemptedReconnect) {
        return;
      }

      hasAttemptedReconnect = true;
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, reconnectDelayMs);
    });
  };

  return {
    start: () => {
      deps.onStatusChange("disconnected");
      connect();
    },
    stop: () => {
      isStopped = true;
      isIntentionalClose = true;
      clearReconnectTimer();

      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
      ) {
        socket.close();
      }
    },
  };
};

export const useWebSocketConnectionStatus = () => {
  const [status, setStatus] = useState<WebSocketConnectionStatus>("disconnected");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = createWebSocketConnectionStatusController({
      onStatusChange: setStatus,
      onNoticeChange: setNotice,
    });

    controller.start();

    return () => {
      controller.stop();
    };
  }, []);

  return { status, notice };
};
