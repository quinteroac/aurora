import { Elysia } from "elysia";
import { narratorAgent } from "./agent/narrator";
import { chatRoutes } from "./routes/chat";
import { wsRoutes } from "./routes/ws";
import { tokenizeNarration, type RunNarrator, type RunNarratorStream } from "./routes/shared";

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

export const runNarrator: RunNarrator = async (message) => {
  return narratorAgent.generate(message);
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

export type { RunNarrator, RunNarratorStream } from "./routes/shared";

export const createApp = ({
  runNarrator: executeNarrator = runNarrator,
  runNarratorStream: executeNarratorStream = runNarratorStream,
}: { runNarrator?: RunNarrator; runNarratorStream?: RunNarratorStream } = {}) =>
  new Elysia()
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
