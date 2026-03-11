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

export const createApp = ({ runNarrator: executeNarrator = runNarrator }: { runNarrator?: RunNarrator } = {}) =>
  new Elysia()
    .get("/health", () => ({
      status: "ok",
      service: backendServiceName,
    }))
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
