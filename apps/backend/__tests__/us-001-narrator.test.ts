import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Agent } from "@mastra/core/agent";
import { narratorAgent, narratorSystemPrompt } from "../src/agent/narrator";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const backendDir = path.resolve(import.meta.dir, "..");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (port: number, timeoutMs = 10_000) => {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/health`;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Server has not started yet.
    }

    await wait(150);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

describe("US-001 - Narrator agent registration", () => {
  test("US-001-AC01: narrator agent is a Mastra Agent with id narrator", () => {
    expect(narratorAgent).toBeInstanceOf(Agent);
    expect(narratorAgent.id).toBe("narrator");
  });

  test("US-001-AC02: system prompt defines imaginative RPG narrator world-building role", () => {
    expect(narratorSystemPrompt).toContain("imaginative RPG storyteller");
    expect(narratorSystemPrompt).toContain("Build and evolve the world");
  });

  test("US-001-AC03: narrator agent is exported as a singleton", async () => {
    const narratorModuleA = await import("../src/agent/narrator");
    const narratorModuleB = await import("../src/agent/narrator");

    expect(narratorModuleA.narratorAgent).toBe(narratorModuleB.narratorAgent);
  });

  test("US-001-AC04: bun run dev starts cleanly and logs narrator registration", async () => {
    const port = "3016";
    const childProcess = Bun.spawn({
      cmd: ["bun", "run", "dev"],
      cwd: backendDir,
      env: { ...process.env, PORT: port },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const response = await waitForHealth(Number(port));
      expect(response.status).toBe(200);
    } finally {
      childProcess.kill();
      await childProcess.exited;
    }

    const stdout = await new Response(childProcess.stdout).text();
    const stderr = await new Response(childProcess.stderr).text();
    const combinedOutput = `${stdout}\n${stderr}`;

    expect(combinedOutput).toContain("\"event\":\"agent_registered\"");
    expect(combinedOutput).toContain("\"agentId\":\"narrator\"");
  });

  test("US-001-AC05: typecheck / lint passes", () => {
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
