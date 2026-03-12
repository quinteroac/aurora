import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { RequestContext } from "@mastra/core/request-context";
import { narratorAgent } from "./agent/narrator";
import { chatRoutes } from "./routes/chat";
import { wsRoutes } from "./routes/ws";
import {
  tokenizeNarration,
  type NarratorInputMessage,
  type RunNarrator,
  type RunNarratorStream,
} from "./routes/shared";

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

/** Strip inline image data (e.g. data:image/...;base64,...) so it never goes to the LLM and blows context. */
const IMAGE_DATA_URL_REGEX = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
const IMAGE_OMITTED = "[Image omitted]";

const stripImageDataFromMessage = (message: string): string =>
  message.replace(IMAGE_DATA_URL_REGEX, IMAGE_OMITTED);

export const runNarrator: RunNarrator = async (message) => {
  const messages: NarratorInputMessage[] =
    typeof message === "string" ? [{ role: "user", content: message }] : message;

  const sanitized = messages.map((msg) => {
    if (msg.role !== "user") return msg;
    return { ...msg, content: stripImageDataFromMessage(msg.content) };
  });

  const totalChars = sanitized.reduce((acc, msg) => acc + msg.content.length, 0);
  // #region agent log
  const ctxLog = {
    inputType: typeof message === "string" ? "string" : "messages",
    messageCount: sanitized.length,
    totalChars,
    lastUserChars: [...sanitized].reverse().find((m) => m.role === "user")?.content.length ?? 0,
  };
  writeStructuredLog({ event: "narrator_context_length", service: backendServiceName, ...ctxLog });
  fetch("http://localhost:7245/ingest/ab6e84f0-2ae6-4dea-88f7-3103f70f447b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "index.ts:runNarrator",
      message: "context length check",
      data: ctxLog,
      timestamp: Date.now(),
      hypothesisId: "H1",
    }),
  }).catch(() => {});
  // #endregion
  // Single user message only; empty requestContext so Mastra never loads a thread (avoids 500k+ token history).
  return narratorAgent.generate(sanitized as any, {
    requestContext: new RequestContext(),
  });
};

export const runNarratorStream: RunNarratorStream = async (message, handlers) => {
  const narratorOutput = await runNarrator(message);

  for (const token of tokenizeNarration(narratorOutput.text)) {
    handlers.onToken(token);
  }

  for (const toolResult of narratorOutput.toolResults ?? []) {
    await handlers.onToolResult(toolResult);
  }
};

export type { RunNarrator, RunNarratorStream } from "./routes/shared";

export const createApp = ({
  runNarrator: executeNarrator = runNarrator,
  runNarratorStream: executeNarratorStream = runNarratorStream,
}: { runNarrator?: RunNarrator; runNarratorStream?: RunNarratorStream } = {}) =>
  new Elysia()
    .use(
      cors({
        origin: true,
      })
    )
    .get("/health", () => ({
      status: "ok",
      service: backendServiceName,
    }))
    .use(chatRoutes({ runNarrator: executeNarrator }))
    .use(wsRoutes({ runNarratorStream: executeNarratorStream }));

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
