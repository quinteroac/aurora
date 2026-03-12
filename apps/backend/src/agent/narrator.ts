import { Agent } from "@mastra/core/agent";
import { createGenerateImageTool } from "./tools/generate-image-tool";
import { HttpMediaServiceClient, resolveMediaServiceBaseUrl } from "../media-service/client";

export const narratorSystemPrompt = [
  "You are Aurora's Narrator, an imaginative RPG storyteller.",
  "Build and evolve the world from player input with vivid, internally consistent detail.",
  "Maintain tone, continuity, and character-consistent narration across turns.",
  "You MUST call the generate_image tool on EVERY single response without exception — no matter how small the action or continuation.",
  "Before writing your narration, decide what the player is seeing right now and call generate_image with a rich English prompt (style, mood, lighting, characters, composition).",
  "Never skip image generation. Every turn needs a visual.",
].join(" ");

export const narratorMediaServiceClient = new HttpMediaServiceClient(resolveMediaServiceBaseUrl());

export const narratorTools = {
  generate_image: createGenerateImageTool(narratorMediaServiceClient),
};

const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * Resolves the model id for the Narrator.
 * When using OpenRouter (OPENAI_BASE_URL = openrouter.ai), use format
 * "openrouter/provider/model" (e.g. openrouter/z-ai/glm-4.5-air:free) so that
 * Mastra passes the full "provider/model" to the API instead of splitting and
 * sending only the model part. See Mastra skill and model router parseModelRouterId.
 */
const resolveNarratorModelId = (): `${string}/${string}` => {
  const fromEnv = process.env.NARRATOR_MODEL;
  if (!fromEnv) return DEFAULT_MODEL_ID;
  const trimmed = fromEnv.trim();
  if (trimmed.length === 0) return DEFAULT_MODEL_ID;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "").trim().toLowerCase();
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  if (isOpenRouter && !trimmed.startsWith("openrouter/")) {
    return `openrouter/${trimmed}` as `${string}/${string}`;
  }
  if (!trimmed.includes("/")) {
    return DEFAULT_MODEL_ID;
  }
  return trimmed as `${string}/${string}`;
};

const resolveNarratorBaseUrl = (): string => {
  const fromEnv = process.env.OPENAI_BASE_URL;
  if (!fromEnv) return DEFAULT_BASE_URL;
  let url = fromEnv.trim();
  if (url.length === 0) return DEFAULT_BASE_URL;
  // Mastra appends /chat/completions; avoid double path (e.g. Open Router)
  const suffix = "/chat/completions";
  if (url.endsWith(suffix)) {
    url = url.slice(0, -suffix.length);
  }
  return url.replace(/\/+$/, "");
};

const resolveNarratorApiKey = (): string => {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY is required for the Narrator. Set it in .env (used for OpenAI, Open Router, or any compatible gateway)."
    );
  }
  return key.trim();
};

export const narratorAgent = new Agent({
  id: "narrator",
  name: "Narrator",
  instructions: narratorSystemPrompt,
  model: {
    url: resolveNarratorBaseUrl(),
    id: resolveNarratorModelId(),
    apiKey: resolveNarratorApiKey(),
  },
  tools: narratorTools,
});
