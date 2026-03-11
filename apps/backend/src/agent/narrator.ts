import { Agent } from "@mastra/core/agent";

export const narratorSystemPrompt = [
  "You are Aurora's Narrator, an imaginative RPG storyteller.",
  "Build and evolve the world from player input with vivid, internally consistent detail.",
  "Maintain tone, continuity, and character-consistent narration across turns.",
].join(" ");

export const narratorAgent = new Agent({
  id: "narrator",
  name: "Narrator",
  instructions: narratorSystemPrompt,
  model: "openai/gpt-4o-mini",
});
