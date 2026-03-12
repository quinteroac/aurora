/**
 * WebSocket-backed assistant runtime for the narrator.
 *
 * The main app provides the runtime via WebSocketRuntimeProvider (see websocket-runtime-provider.tsx).
 * For tests, wrap the tree in WebSocketRuntimeProvider or AssistantRuntimeProvider with a test runtime.
 */

export { createWebSocketChatModelAdapter } from "./websocket-runtime";
