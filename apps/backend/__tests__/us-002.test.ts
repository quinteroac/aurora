import { beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { narratorAgent, narratorTools } from "../src/agent/narrator";
import {
  createGenerateImageTool,
  defaultGenerateImagePollIntervalMs,
  defaultGenerateImagePollTimeoutMs,
  isGenerateImageToolInput,
} from "../src/agent/tools/generate-image-tool";
import {
  HttpMediaServiceClient,
  resolveMediaServiceBaseUrl,
  type MediaServiceClient,
} from "../src/media-service/client";

const repoRoot = path.resolve(import.meta.dir, "../../..");

const restoreEnv = (name: string, previous: string | undefined): void => {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = previous;
};

describe("US-002 - generate_image tool wired to Media Service", () => {
  beforeEach(() => {
    delete process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    delete process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    delete process.env.MEDIA_SERVICE_URL;
  });

  test("US-002-AC01: generate_image tool is defined and registered on narrator agent", async () => {
    expect(narratorTools.generate_image.id).toBe("generate_image");

    const agentTools = await narratorAgent.listTools();

    expect(Object.keys(agentTools)).toContain("generate_image");
    expect(agentTools.generate_image.id).toBe("generate_image");
  });

  test("US-002-AC02: tool input accepts a single string parameter named prompt", () => {
    expect(isGenerateImageToolInput({ prompt: "Misty canyon" })).toBe(true);
    expect(isGenerateImageToolInput({ prompt: 10 })).toBe(false);
    expect(isGenerateImageToolInput({ prompt: "ok", style: "extra" })).toBe(true);
  });

  test("US-002-AC03: invocation uses POST /generate/image on Media Service URL from env", async () => {
    const previousUrl = process.env.MEDIA_SERVICE_URL;
    process.env.MEDIA_SERVICE_URL = "http://media.example:8010/";

    const fetchCalls: Array<{ url: string; method: string; body: string | null }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      fetchCalls.push({
        url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
        method: init?.method ?? "GET",
        body: (init?.body as string | null | undefined) ?? null,
      });

      return new Response(JSON.stringify({ job_id: "job-123" }), {
        status: 202,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    try {
      const baseUrl = resolveMediaServiceBaseUrl();
      const client = new HttpMediaServiceClient(baseUrl);

      await client.createImageJob("Vast floating citadel");

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0]).toEqual({
        url: "http://media.example:8010/generate/image",
        method: "POST",
        body: JSON.stringify({ prompt: "Vast floating citadel" }),
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv("MEDIA_SERVICE_URL", previousUrl);
    }
  });

  test("US-002-AC04: tool polls job status at configurable interval (default 2 seconds)", async () => {
    expect(defaultGenerateImagePollIntervalMs).toBe(2_000);

    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "50";

    let polls = 0;
    const client: MediaServiceClient = {
      createImageJob: async () => "job-456",
      getJobStatus: async () => {
        polls += 1;
        if (polls < 3) {
          return {
            status: "running",
            result: null,
            error: null,
          };
        }

        return {
          status: "done",
          result: {
            image_b64: "base64-image",
          },
          error: null,
        };
      },
    };

    try {
      const tool = createGenerateImageTool(client);
      const execute = tool.execute;
      expect(execute).toBeDefined();

      const result = await execute?.({ prompt: "Arcane observatory" }, undefined as never);

      expect(result).toBe("base64-image");
      expect(polls).toBe(3);
    } finally {
      restoreEnv("GENERATE_IMAGE_POLL_INTERVAL_MS", previousInterval);
      restoreEnv("GENERATE_IMAGE_POLL_TIMEOUT_MS", previousTimeout);
    }
  });

  test("US-002-AC05: done status returns image_b64 string", async () => {
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "20";

    const client: MediaServiceClient = {
      createImageJob: async () => "job-done",
      getJobStatus: async () => ({
        status: "done",
        result: {
          image_b64: "encoded-png",
        },
        error: null,
      }),
    };

    const tool = createGenerateImageTool(client);
    const result = await tool.execute?.({ prompt: "Icy fortress" }, undefined as never);

    expect(typeof result).toBe("string");
    expect(result).toBe("encoded-png");
  });

  test("US-002-AC06: failed status returns structured error string", async () => {
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "20";

    const client: MediaServiceClient = {
      createImageJob: async () => "job-fail",
      getJobStatus: async () => ({
        status: "failed",
        result: null,
        error: "pipeline_timeout",
      }),
    };

    const tool = createGenerateImageTool(client);
    const result = await tool.execute?.({ prompt: "Desert monolith" }, undefined as never);

    expect(result).toBe("Image generation failed: pipeline_timeout");
  });

  test("US-002-AC07: default timeout is 120s and timeout returns structured error", async () => {
    expect(defaultGenerateImagePollTimeoutMs).toBe(120_000);

    const previousInterval = process.env.GENERATE_IMAGE_POLL_INTERVAL_MS;
    const previousTimeout = process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS;
    process.env.GENERATE_IMAGE_POLL_INTERVAL_MS = "1";
    process.env.GENERATE_IMAGE_POLL_TIMEOUT_MS = "5";

    let polls = 0;
    const client: MediaServiceClient = {
      createImageJob: async () => "job-timeout",
      getJobStatus: async () => {
        polls += 1;
        return {
          status: "running",
          result: null,
          error: null,
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

  test("US-002-AC08: tool is created through createGenerateImageTool(client) factory", async () => {
    let createdWithPrompt: string | null = null;

    const client: MediaServiceClient = {
      createImageJob: async (prompt) => {
        createdWithPrompt = prompt;
        return "job-factory";
      },
      getJobStatus: async () => ({
        status: "done",
        result: {
          image_b64: "factory-image",
        },
        error: null,
      }),
    };

    const tool = createGenerateImageTool(client);

    expect(tool.id).toBe("generate_image");

    const result = await tool.execute?.({ prompt: "Factory prompt" }, undefined as never);

    expect(createdWithPrompt).toBe("Factory prompt");
    expect(result).toBe("factory-image");
  });

  test("US-002-AC09: typecheck / lint passes", () => {
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
