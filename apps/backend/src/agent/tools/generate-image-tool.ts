import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { MediaServiceClient, PollJobResult } from "../../media-service/client";
import { resolveMediaServiceBaseUrl } from "../../media-service/client";

export const defaultGenerateImagePollIntervalMs = 2_000;
export const defaultGenerateImagePollTimeoutMs = 120_000;

const generateImageInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe(
      "Detailed English image prompt describing the scene: style, mood, lighting, characters, and composition."
    ),
});

type GenerateImageToolInput = z.infer<typeof generateImageInputSchema>;

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
    description:
      "Generate a scene image for the current narrative moment. Call this for every response — always paint the scene the player is experiencing.",
    inputSchema: generateImageInputSchema,
    execute: async (inputData: GenerateImageToolInput) => {
      const { prompt } = inputData;
      const { pollIntervalMs, timeoutMs } = resolvePollingConfig();
      const deadline = Date.now() + timeoutMs;
      const { job_id: jobId } = await client.submitJob(prompt);
      const baseUrl = resolveMediaServiceBaseUrl();
      const imageUrl = `${baseUrl}/jobs/${jobId}/image`;

      while (Date.now() <= deadline) {
        const jobStatus = await client.pollJob(jobId);

        if (jobStatus.status === "done") {
          const imageB64 = readDoneResult(jobStatus);
          if (imageB64) {
            // Return a short URL to avoid sending base64 through the LLM context.
            // #region agent log
            process.stdout.write(
              `${JSON.stringify({
                event: "generate_image_result",
                service: "backend",
                jobId,
                resultType: "url",
                urlLen: imageUrl.length,
                b64Len: imageB64.length,
              })}\n`
            );
            // #endregion
            return imageUrl;
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
