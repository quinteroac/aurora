import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");

describe("US-006 - Environment variable convention", () => {
  test("US-006-AC01: .env.example exists and lists required variables", () => {
    const envExamplePath = path.join(repoRoot, ".env.example");
    const envExample = readFileSync(envExamplePath, "utf8");

    expect(envExample).toContain("BACKEND_PORT=");
    expect(envExample).toContain("FRONTEND_PORT=");
    expect(envExample).toContain("MEDIA_PORT=");
    expect(envExample).toContain("OPENAI_API_KEY=");
    expect(envExample).toContain("ANTHROPIC_API_KEY=");
  });

  test("US-006-AC02: each variable entry has an inline comment describing purpose", () => {
    const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
    const lines = envExample
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(lines.length).toBe(5);

    for (const line of lines) {
      expect(line.includes("#")).toBe(true);
      const [entry, comment] = line.split("#");
      expect(entry.trim().length).toBeGreaterThan(0);
      expect(comment?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  test("US-006-AC03: .env is listed in .gitignore", () => {
    const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");

    expect(gitignore).toContain(".env");
  });

  test("US-006-AC04: typecheck and lint pass", () => {
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
