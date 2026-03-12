import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createApp, type RunNarrator } from "../src/index";

const repoRoot = path.resolve(import.meta.dir, "../../..");

const postChat = async (
  runNarrator: RunNarrator,
  body: unknown
): Promise<{ status: number; json: unknown }> => {
  const app = createApp({ runNarrator });
  const response = await app.handle(
    new Request("http://localhost/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );

  return {
    status: response.status,
    json: await response.json(),
  };
};

describe("US-003 - POST /chat REST endpoint", () => {
  test("US-003-AC01: POST /chat accepts JSON body { message }", async () => {
    const calls: string[] = [];
    const runNarrator: RunNarrator = async (message) => {
      calls.push(message);
      return {
        text: "Narrative turn complete",
        toolResults: [],
      };
    };

    const result = await postChat(runNarrator, { message: "The wind carries whispers." });

    expect(result.status).toBe(200);
    expect(calls).toEqual(["The wind carries whispers."]);
  });

  test("US-003-AC02: successful response is HTTP 200 with { response, images }", async () => {
    const runNarrator: RunNarrator = async () => ({
      text: "Moonlight floods the ruined observatory.",
      toolResults: [],
    });

    const result = await postChat(runNarrator, { message: "Look around the observatory." });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      response: "Moonlight floods the ruined observatory.",
      images: [],
    });
  });

  test("US-003-AC03: missing or empty message returns HTTP 400", async () => {
    const runNarrator: RunNarrator = async () => ({
      text: "unused",
      toolResults: [],
    });

    const missingMessage = await postChat(runNarrator, {});
    expect(missingMessage.status).toBe(400);
    expect(missingMessage.json).toEqual({ error: "message is required" });

    const emptyMessage = await postChat(runNarrator, { message: "   " });
    expect(emptyMessage.status).toBe(400);
    expect(emptyMessage.json).toEqual({ error: "message is required" });
  });

  test("US-003-AC04: endpoint calls narrator agent and awaits full response", async () => {
    let resolved = false;
    const runNarrator: RunNarrator = async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      resolved = true;
      return {
        text: "A hidden vault unlocks beneath your feet.",
        toolResults: [],
      };
    };

    const result = await postChat(runNarrator, { message: "Search for secrets." });

    expect(resolved).toBe(true);
    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      response: "A hidden vault unlocks beneath your feet.",
      images: [],
    });
  });

  test("US-003-AC05: image_b64 from generate_image is included in images", async () => {
    const runNarrator: RunNarrator = async () => ({
      text: "A painted memory materializes.",
      toolResults: [
        {
          payload: {
            toolName: "generate_image",
            result: "b64-image-1",
          },
        },
        {
          payload: {
            toolName: "other_tool",
            result: "ignored",
          },
        },
        {
          payload: {
            toolName: "generate_image",
            result: "b64-image-2",
          },
        },
      ],
    });

    const result = await postChat(runNarrator, { message: "Show me a vision." });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      response: "A painted memory materializes.",
      images: ["b64-image-1", "b64-image-2"],
    });
  });

  test("US-003-AC06: agent errors (including tool failures) return HTTP 500 with error message", async () => {
    const agentFailure = await postChat(async () => Promise.reject(new Error("llm provider down")), {
      message: "Continue the story.",
    });
    expect(agentFailure.status).toBe(500);
    expect(agentFailure.json).toEqual({ error: "llm provider down" });

    const toolFailure = await postChat(
      async () => ({
        text: "This should not be returned.",
        toolResults: [
          {
            payload: {
              toolName: "generate_image",
              result: "Image generation failed: pipeline_timeout",
            },
          },
        ],
      }),
      { message: "Render the battlefield." }
    );
    expect(toolFailure.status).toBe(500);
    expect(toolFailure.json).toEqual({ error: "Image generation failed: pipeline_timeout" });
  });

  test("US-003-AC07: typecheck / lint passes", () => {
    const typecheck = Bun.spawnSync({
      cmd: ["bun", "run", "typecheck"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const lint = Bun.spawnSync({
      cmd: ["bun", "run", "lint"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(typecheck.exitCode).toBe(0);
    expect(lint.exitCode).toBe(0);
  });
});
