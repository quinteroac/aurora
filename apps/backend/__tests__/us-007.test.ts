import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");

type RootPackageJson = {
  scripts?: Record<string, string>;
};

const readRootPackageJson = () => {
  const packageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  return JSON.parse(packageJson) as RootPackageJson;
};

describe("US-007 - Unified run scripts", () => {
  test("US-007-AC01: root package.json includes a dev script", () => {
    const rootPackageJson = readRootPackageJson();

    expect(rootPackageJson.scripts?.dev).toBe("./scripts/dev-all.sh");
  });

  test(
    "US-007-AC02: bun run dev from repo root boots all three services",
    () => {
      const command = Bun.spawnSync({
        cmd: ["timeout", "6", "bun", "run", "dev"],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PORT: "3020",
          FRONTEND_PORT: "5220",
          MEDIA_PORT: "8020",
        },
      });

      const combinedOutput = `${command.stdout.toString()}\n${command.stderr.toString()}`;

      expect(combinedOutput).toContain("[backend] starting");
      expect(combinedOutput).toContain("[frontend] starting");
      expect(combinedOutput).toContain("[media] starting");
    },
    15_000
  );

  test("US-007-AC03: combined log output is identifiable per service", () => {
    const devScript = readFileSync(path.join(repoRoot, "scripts/dev-all.sh"), "utf8");

    expect(devScript).toContain("sed -u \"s/^/[$name] /\"");
    expect(devScript).toContain("start_service backend");
    expect(devScript).toContain("start_service frontend");
    expect(devScript).toContain("start_service media");
  });

  test("US-007-AC04: typecheck / lint passes", () => {
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
