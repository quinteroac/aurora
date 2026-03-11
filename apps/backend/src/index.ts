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

export const createApp = () =>
  new Elysia().get("/health", () => ({
    status: "ok",
    service: backendServiceName,
  }));

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
