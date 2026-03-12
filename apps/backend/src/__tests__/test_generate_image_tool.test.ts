import { afterEach, describe, expect, test } from "bun:test";
import { createGenerateImageTool } from "../agent/tools/generate-image-tool";
import { HttpMediaServiceClient, type HttpFetcher, type MediaServiceClient } from "../media-service/client";

const restoreEnv = (name: string, previous: string | undefined): void => {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = previous;
};

afterEach(() => {
  delete process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
  delete process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
});

describe("US-005 integration: generate_image tool flow", () => {
  test("US-005-AC04: polls status until done and returns image payload", async () => {
    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "50";

    let polls = 0;
    const client: MediaServiceClient = {
      submitJob: async () => ({ job_id: "job-123" }),
      pollJob: async () => {
        polls += 1;
        if (polls < 3) {
          return { status: "running", result: undefined, error: undefined };
        }
        return {
          status: "done",
          result: { image_b64: "final-image-b64" },
          error: undefined,
        };
      },
    };

    try {
      const tool = createGenerateImageTool(client);
      const result = await tool.execute?.({ prompt: "An ancient throne room." }, undefined as never);

      expect(polls).toBe(3);
      expect(result).toBe("final-image-b64");
    } finally {
      restoreEnv("GENERATE_IMAGE_POLL_INTERVAL_MS", previousInterval);
      restoreEnv("GENERATE_IMAGE_POLL_TIMEOUT_MS", previousTimeout);
    }
  });

  test("US-005-AC04: failed status returns structured error string", async () => {
    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "50";

    const client: MediaServiceClient = {
      submitJob: async () => ({ job_id: "job-fail" }),
      pollJob: async () => ({
        status: "failed",
        result: undefined,
        error: "pipeline_timeout",
      }),
    };

    try {
      const tool = createGenerateImageTool(client);
      const result = await tool.execute?.({ prompt: "Desert monolith" }, undefined as never);

      expect(result).toBe("Image generation failed: pipeline_timeout");
    } finally {
      restoreEnv("GENERATE_IMAGE_POLL_INTERVAL_MS", previousInterval);
      restoreEnv("GENERATE_IMAGE_POLL_TIMEOUT_MS", previousTimeout);
    }
  });

  test("US-005-AC04: timeout returns structured error", async () => {
    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "30";

    let polls = 0;
    const client: MediaServiceClient = {
      submitJob: async () => ({ job_id: "job-timeout" }),
      pollJob: async () => {
        polls += 1;
        return {
          status: "running",
          result: undefined,
          error: undefined,
        };
      },
    };

    try {
      const tool = createGenerateImageTool(client);
      const result = await tool.execute?.({ prompt: "Singing marsh" }, undefined as never);

      expect(result?.startsWith("Image generation failed: ")).toBe(true);
      expect(result).toContain("timed out");
      expect(polls).toBeGreaterThan(0);
    } finally {
      restoreEnv("GENERATE_IMAGE_POLL_INTERVAL_MS", previousInterval);
      restoreEnv("GENERATE_IMAGE_POLL_TIMEOUT_MS", previousTimeout);
    }
  });

  test("US-005-AC05: media service calls are mocked via configurable HTTP client", async () => {
    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "50";

    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: HttpFetcher = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (url.endsWith("/generate/image")) {
        return new Response(JSON.stringify({ job_id: "job-http-1" }), { status: 202 });
      }

      if (calls.filter((call) => call.url.endsWith("/jobs/job-http-1")).length < 2) {
        return new Response(JSON.stringify({ status: "running", result: null, error: null }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          status: "done",
          result: { image_b64: "http-mocked-image" },
          error: null,
        }),
        { status: 200 }
      );
    };

    try {
      const client = new HttpMediaServiceClient("http://media.mock", fetchMock);
      const tool = createGenerateImageTool(client);
      const result = await tool.execute?.({ prompt: "Sky city at dawn." }, undefined as never);

      expect(result).toBe("http-mocked-image");
      expect(calls[0]).toEqual({
        url: "http://media.mock/generate/image",
        method: "POST",
      });
      expect(calls.some((call) => call.url === "http://media.mock/jobs/job-http-1" && call.method === "GET")).toBe(
        true
      );
    } finally {
      restoreEnv("GENERATE_IMAGE_POLL_INTERVAL_MS", previousInterval);
      restoreEnv("GENERATE_IMAGE_POLL_TIMEOUT_MS", previousTimeout);
    }
  });
});
