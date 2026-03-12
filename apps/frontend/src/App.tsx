import { FormEvent, RefObject, useEffect, useRef, useState } from "react";
import { sendFirstPlayerMessage } from "./chat-api";
import { submitUniverseSetting, type AppView } from "./onboarding-submit";
import "./App.css";

const SUBMISSION_ERROR_MESSAGE = "Unable to begin your adventure right now. Please try again.";

type OnboardingScreenProps = {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setting: string;
  setSetting: (nextValue: string) => void;
  settingTextareaRef: RefObject<HTMLTextAreaElement>;
  validationMessage: string | null;
  clearValidationMessage: () => void;
};

export const OnboardingScreen = ({
  isSubmitting,
  onSubmit,
  setting,
  setSetting,
  settingTextareaRef,
  validationMessage,
  clearValidationMessage,
}: OnboardingScreenProps) => {
  return (
    <main className="onboarding-screen" aria-label="Universe onboarding">
      <section className="onboarding-panel">
        <h1>Define Your Universe</h1>
        <p className="onboarding-copy">
          Describe the setting, tone, and rules of your world. This becomes the first message sent
          to the narrator.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="universe-setting" className="setting-label">
            Universe Description
          </label>
          <textarea
            id="universe-setting"
            ref={settingTextareaRef}
            className="setting-textarea"
            value={setting}
            autoFocus
            placeholder="Example: A storm-wrapped archipelago where sky-whales carry cities between islands."
            onChange={(event) => {
              setSetting(event.target.value);
              if (validationMessage) {
                clearValidationMessage();
              }
            }}
            rows={8}
          />
          {validationMessage && (
            <p className="validation-message" role="alert">
              {validationMessage}
            </p>
          )}
          <button type="submit" className="begin-button" disabled={isSubmitting}>
            {isSubmitting ? "Beginning..." : "Begin Adventure"}
          </button>
        </form>
      </section>
    </main>
  );
};

function App() {
  const [view, setView] = useState<AppView>("onboarding");
  const [setting, setSetting] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firstPlayerMessage, setFirstPlayerMessage] = useState<string>("");
  const settingTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (view === "onboarding") {
      settingTextareaRef.current?.focus();
    }
  }, [view]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await submitUniverseSetting(setting, {
        sendFirstPlayerMessage,
      });

      setValidationMessage(result.error);

      if (result.nextView === "chat" && result.firstMessage) {
        setFirstPlayerMessage(result.firstMessage);
        setView("chat");
      }
    } catch {
      setValidationMessage(SUBMISSION_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === "chat") {
    return (
      <main className="chat-screen" aria-label="Adventure chat view">
        <section className="chat-panel">
          <h1>Adventure Chat</h1>
          <p>Your universe has been sent to the narrator as your first message.</p>
          <article className="first-message" aria-label="First player message">
            {firstPlayerMessage}
          </article>
        </section>
      </main>
    );
  }

  return (
    <OnboardingScreen
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      setting={setting}
      setSetting={setSetting}
      settingTextareaRef={settingTextareaRef}
      validationMessage={validationMessage}
      clearValidationMessage={() => {
        setValidationMessage(null);
      }}
    />
  );
}

export default App;
