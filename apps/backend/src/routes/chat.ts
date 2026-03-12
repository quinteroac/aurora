import { Elysia } from "elysia";
import {
  type RunNarrator,
  parseMessage,
  collectGeneratedImages,
} from "./shared";

export const chatRoutes = (deps: { runNarrator: RunNarrator }) =>
  new Elysia().post("/chat", async ({ body, set }) => {
    const message = parseMessage(body);
    if (!message) {
      set.status = 400;
      return { error: "message is required" };
    }

    try {
      const narratorOutput = await deps.runNarrator(message);
      const images = collectGeneratedImages(narratorOutput.toolResults);

      return {
        response: narratorOutput.text,
        images,
      };
    } catch (error) {
      set.status = 500;
      const message = error instanceof Error ? error.message : "agent invocation failed";
      return { error: message };
    }
  });
