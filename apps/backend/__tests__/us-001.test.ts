import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");

const readJson = <T>(filePath: string): T => {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as T;
};

describe("US-001 - Monorepo workspace initialised", () => {
  test("US-001-AC01: root package.json declares required workspaces", () => {
    const rootPackage = readJson<{ workspaces?: string[] }>(
      path.join(repoRoot, "package.json")
    );

    expect(rootPackage.workspaces).toEqual([
      "apps/backend",
      "apps/frontend",
      "services/media",
      "packages/shared-types",
    ]);
  });

  test("US-001-AC02: bun install at repo root succeeds", () => {
    const command = Bun.spawnSync({
      cmd: ["bun", "install", "--frozen-lockfile"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(command.exitCode).toBe(0);
  });

  test("US-001-AC03: media service uses uv-managed Python dependencies", () => {
    const pyprojectPath = path.join(repoRoot, "services/media/pyproject.toml");
    const uvLockPath = path.join(repoRoot, "services/media/uv.lock");
    const pyproject = readFileSync(pyprojectPath, "utf8");

    expect(existsSync(pyprojectPath)).toBe(true);
    expect(existsSync(uvLockPath)).toBe(true);
    expect(pyproject).toContain("[project]");
    expect(pyproject).toContain("requires-python = \">=3.12\"");
  });

  test("US-001-AC04: typecheck and lint commands pass", () => {
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
