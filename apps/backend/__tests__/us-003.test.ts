import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveFrontendPort } from "../../frontend/vite.config";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const frontendDir = path.resolve(repoRoot, "apps/frontend");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPage = async (port: number, timeoutMs = 15_000): Promise<string> => {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}`;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.text();
      }
    } catch {
      // Dev server has not started yet.
    }

    await wait(150);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

describe("US-003 - Frontend service scaffolded and reachable", () => {
  test("US-003-AC01: apps/frontend is scaffolded with Vite + React + TypeScript", () => {
    const frontendPackageJson = JSON.parse(
      readFileSync(path.join(frontendDir, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(frontendPackageJson.dependencies?.react).toBeDefined();
    expect(frontendPackageJson.dependencies?.["react-dom"]).toBeDefined();
    expect(frontendPackageJson.devDependencies?.vite).toBeDefined();
    expect(frontendPackageJson.devDependencies?.["@vitejs/plugin-react"]).toBeDefined();
    expect(frontendPackageJson.scripts?.dev).toBe("vite");

    expect(existsSync(path.join(frontendDir, "index.html"))).toBe(true);
    expect(existsSync(path.join(frontendDir, "src/main.tsx"))).toBe(true);
    expect(existsSync(path.join(frontendDir, "src/App.tsx"))).toBe(true);
  });

  test("US-003-AC02: bun run dev starts Vite on port 5173 (configurable)", async () => {
    expect(resolveFrontendPort(undefined)).toBe(5173);
    expect(resolveFrontendPort("5211")).toBe(5211);

    const port = "5211";
    const childProcess = Bun.spawn({
      cmd: ["bun", "run", "dev"],
      cwd: frontendDir,
      env: { ...process.env, FRONTEND_PORT: port },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const page = await waitForPage(Number(port));
      expect(page).toContain("<div id=\"root\"></div>");
    } finally {
      childProcess.kill();
      await childProcess.exited;
    }
  });

  test("US-003-AC03: opening localhost renders default Vite/React placeholder page", async () => {
    const port = "5212";
    const childProcess = Bun.spawn({
      cmd: ["bun", "run", "dev"],
      cwd: frontendDir,
      env: { ...process.env, FRONTEND_PORT: port },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const page = await waitForPage(Number(port));
      expect(page).toContain("<div id=\"root\"></div>");
      expect(page).toContain("/src/main.tsx");
    } finally {
      childProcess.kill();
      await childProcess.exited;
    }

    const appSource = readFileSync(path.join(frontendDir, "src/App.tsx"), "utf8");
    const mainSource = readFileSync(path.join(frontendDir, "src/main.tsx"), "utf8");

    expect(appSource).toContain("Vite + React");
    expect(appSource.includes("console.error")).toBe(false);
    expect(mainSource.includes("console.error")).toBe(false);
  });

  test("US-003-AC04: typecheck and lint pass", () => {
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

  test("US-003-AC05: visual verification record exists for browser check", () => {
    const verificationFile = path.join(frontendDir, "visual-verification.md");
    const verification = readFileSync(verificationFile, "utf8");

    expect(existsSync(verificationFile)).toBe(true);
    expect(verification).toContain("March 11, 2026");
    expect(verification).toContain("http://localhost:5173");
    expect(verification).toContain("default Vite + React placeholder page renders");
  });
});
