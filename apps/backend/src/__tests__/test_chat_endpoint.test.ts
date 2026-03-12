import { describe, expect, test } from "bun:test";
import { createApp, type RunNarrator } from "../index";

const postChat = async (
  runNarrator: RunNarrator,
  body: unknown
): Promise<{ status: number; json: Record<string, unknown> }> => {
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
    json: (await response.json()) as Record<string, unknown>,
  };
};

describe("US-005 integration: chat endpoint", () => {
  test("US-005-AC02: missing or empty message returns HTTP 400", async () => {
    const runNarrator: RunNarrator = async () => ({ text: "unused", toolResults: [] });

    const missing = await postChat(runNarrator, {});
    expect(missing.status).toBe(400);
    expect(missing.json).toEqual({ error: "message is required" });

    const empty = await postChat(runNarrator, { message: "   " });
    expect(empty.status).toBe(400);
    expect(empty.json).toEqual({ error: "message is required" });
  });

  test("US-005-AC02: returns HTTP 200 with narrative response and generated images", async () => {
    const runNarrator: RunNarrator = async () => ({
      text: "The aurora bridge arches over the obsidian sea.",
      toolResults: [
        {
          payload: {
            toolName: "generate_image",
            result: "img-b64-1",
          },
        },
      ],
    });

    const result = await postChat(runNarrator, {
      message: "Describe what I see ahead.",
    });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      response: "The aurora bridge arches over the obsidian sea.",
      images: ["img-b64-1"],
    });
  });
});
