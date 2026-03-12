import { createTool } from "@mastra/core/tools";
import type { MediaServiceClient, PollJobResult } from "../../media-service/client";

export const defaultGenerateImagePollIntervalMs = 2_000;
export const defaultGenerateImagePollTimeoutMs = 120_000;

type GenerateImageToolInput = {
  prompt: string;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

const formatFailedImageGenerationError = (reason: string): string => {
  return `Image generation failed: ${reason}`;
};

export const isGenerateImageToolInput = (value: unknown): value is GenerateImageToolInput => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const input = value as Record<string, unknown>;
  return typeof input.prompt === "string";
};

const resolvePollingConfig = (env = process.env) => {
  return {
    pollIntervalMs: parsePositiveInteger(env.GENERATE_IMAGE_POLL_INTERVAL_MS, defaultGenerateImagePollIntervalMs),
    timeoutMs: parsePositiveInteger(env.GENERATE_IMAGE_POLL_TIMEOUT_MS, defaultGenerateImagePollTimeoutMs),
  };
};

const readDoneResult = (jobStatus: PollJobResult): string | null => {
  return jobStatus.result?.image_b64 ?? null;
};

export const createGenerateImageTool = (client: MediaServiceClient) =>
  createTool({
    id: "generate_image",
    description: "Generate a scene image from a prompt using the Media Service.",
    execute: async (inputData: unknown) => {
      if (!isGenerateImageToolInput(inputData)) {
        return formatFailedImageGenerationError("prompt must be a string");
      }

      const { prompt } = inputData;
      const { pollIntervalMs, timeoutMs } = resolvePollingConfig();
      const deadline = Date.now() + timeoutMs;
      const { job_id: jobId } = await client.submitJob(prompt);

      while (Date.now() <= deadline) {
        const jobStatus = await client.pollJob(jobId);

        if (jobStatus.status === "done") {
          const imageB64 = readDoneResult(jobStatus);
          if (imageB64) {
            return imageB64;
          }

          return formatFailedImageGenerationError("missing image data");
        }

        if (jobStatus.status === "failed") {
          return formatFailedImageGenerationError(jobStatus.error ?? "unknown error");
        }

        await sleep(pollIntervalMs);
      }

      return formatFailedImageGenerationError("timed out while waiting for Media Service job completion");
    },
  });
