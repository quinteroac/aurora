import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp, defaultPort, resolvePort } from "../src/index";

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

describe("US-002 - Backend service scaffolded and healthy", () => {
  test("US-002-AC01: apps/backend has package.json with elysia dependency", () => {
    const backendPackageJson = JSON.parse(
      readFileSync(path.join(backendDir, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    expect(backendPackageJson.dependencies).toBeDefined();
    expect(backendPackageJson.dependencies?.elysia).toBeDefined();
  });

  test("US-002-AC02: GET /health returns expected status and payload", async () => {
    const app = createApp();
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "backend",
    });
  });

  test("US-002-AC03: service starts with bun run dev inside apps/backend", async () => {
    const port = "3015";
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
  });

  test("US-002-AC04: default port is 3000 and can be overridden with PORT", () => {
    expect(defaultPort).toBe(3000);
    expect(resolvePort(undefined)).toBe(3000);
    expect(resolvePort("4321")).toBe(4321);
  });

  test("US-002-AC05: typecheck and lint pass", () => {
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
