import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import App, { OnboardingScreen } from "../src/App";
import { sendFirstPlayerMessage } from "../src/chat-api";
import {
  EMPTY_UNIVERSE_VALIDATION_MESSAGE,
  submitUniverseSetting,
} from "../src/onboarding-submit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("US-001 - Universe Onboarding Screen", () => {
  test("US-001-AC01: initial app state renders onboarding with textarea and Begin Adventure button", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Universe onboarding"');
    expect(markup).toContain("<textarea");
    expect(markup).toContain("Begin Adventure");
  });

  test("US-001-AC02: textarea is configured for focus on mount and multi-line input is preserved", async () => {
    const onboardingMarkup = renderToStaticMarkup(
      <OnboardingScreen
        isSubmitting={false}
        onSubmit={() => {}}
        setting=""
        setSetting={() => {}}
        settingTextareaRef={{ current: null }}
        validationMessage={null}
        clearValidationMessage={() => {}}
      />
    );

    expect(onboardingMarkup).toContain("autofocus");

    let sentMessage = "";
    const submission = await submitUniverseSetting("Sky port\nwith floating docks", {
      sendFirstPlayerMessage: async (message) => {
        sentMessage = message;
      },
    });

    expect(sentMessage).toBe("Sky port\nwith floating docks");
    expect(submission.nextView).toBe("chat");
  });

  test("US-001-AC03: empty submission is blocked and validation is visible", async () => {
    let wasCalled = false;

    const submission = await submitUniverseSetting("   ", {
      sendFirstPlayerMessage: async () => {
        wasCalled = true;
      },
    });

    expect(submission.nextView).toBe("onboarding");
    expect(submission.error).toBe(EMPTY_UNIVERSE_VALIDATION_MESSAGE);
    expect(wasCalled).toBe(false);

    const onboardingWithError = renderToStaticMarkup(
      <OnboardingScreen
        isSubmitting={false}
        onSubmit={() => {}}
        setting=""
        setSetting={() => {}}
        settingTextareaRef={{ current: null }}
        validationMessage={EMPTY_UNIVERSE_VALIDATION_MESSAGE}
        clearValidationMessage={() => {}}
      />
    );

    expect(onboardingWithError).toContain('role="alert"');
    expect(onboardingWithError).toContain(EMPTY_UNIVERSE_VALIDATION_MESSAGE);
  });

  test("US-001-AC04: submit sends first player message to backend and transitions to chat", async () => {
    let capturedInput = "";
    let capturedInitBody = "";

    await sendFirstPlayerMessage(
      "A moonlit desert kingdom",
      async (input, init) => {
        capturedInput = input;
        capturedInitBody = init?.body ?? "";
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      }
    );

    expect(capturedInput).toBe("http://localhost:3000/chat");
    expect(capturedInitBody).toBe(JSON.stringify({ message: "A moonlit desert kingdom" }));

    const submission = await submitUniverseSetting("A moonlit desert kingdom", {
      sendFirstPlayerMessage: async () => {},
    });

    expect(submission.nextView).toBe("chat");
    expect(submission.firstMessage).toBe("A moonlit desert kingdom");
  });

  test("US-001-AC05: typecheck and lint pass with no errors", () => {
    const typecheck = Bun.spawnSync({
      cmd: ["bun", "x", "tsc", "--noEmit", "-p", "apps/frontend/tsconfig.app.json"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const lint = Bun.spawnSync({
      cmd: [
        "bun",
        "x",
        "eslint",
        "apps/frontend/src/**/*.ts",
        "apps/frontend/src/**/*.tsx",
        "--max-warnings=0",
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(typecheck.exitCode).toBe(0);
    expect(lint.exitCode).toBe(0);
  });

  test("US-001-AC06: visual verification checklist records onboarding render and submit flow", () => {
    const visualVerificationPath = path.join(repoRoot, "apps/frontend/visual-verification.md");
    const content = readFileSync(visualVerificationPath, "utf8");

    expect(content).toContain("US-001 Visual Verification");
    expect(content).toContain("onboarding screen renders");
    expect(content).toContain("validation fires");
    expect(content).toContain("submission navigates to the chat view");
  });
});
