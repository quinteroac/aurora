import { FormEvent, RefObject, useEffect, useRef, useState } from "react";
import {
  ComposerPrimitive,
  MessagePrimitive,
  type ThreadMessageLike,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { sendFirstPlayerMessage } from "./chat-api";
import { submitUniverseSetting, type AppView } from "./onboarding-submit";
import { useWebSocketConnectionStatus } from "./websocket-connection-status";
import { WebSocketRuntimeProvider } from "./websocket-runtime-provider";
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

type ChatScreenProps = {
  sceneImageSrc: string | null;
  previousSceneImageSrc: string | null;
  isCrossfading: boolean;
  isCurrentImageVisible: boolean;
};

const ChatMessage = () => {
  return (
    <MessagePrimitive.Root className="chat-message">
      <MessagePrimitive.If user>
        <div className="message-bubble message-bubble-user">
          <MessagePrimitive.Parts />
        </div>
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <div className="message-bubble message-bubble-assistant">
          <MessagePrimitive.Parts />
        </div>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
};

export const ChatScreen = ({
  sceneImageSrc,
  previousSceneImageSrc,
  isCrossfading,
  isCurrentImageVisible,
}: ChatScreenProps) => {
  return (
    <main className="chat-screen" aria-label="Adventure chat view">
      <section className="chat-panel">
        <h1>Adventure Chat</h1>
        <ThreadPrimitive.Root className="assistant-thread" data-testid="assistant-chat-thread">
          <ThreadPrimitive.Viewport className="chat-viewport">
            <ThreadPrimitive.Empty>
              <p className="empty-chat-state">Start your adventure by describing your next move.</p>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
            <ThreadPrimitive.If running>
              <p className="typing-indicator" role="status" aria-live="polite">
                Narrator is weaving the next scene...
              </p>
            </ThreadPrimitive.If>
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root className="chat-composer">
            <ComposerPrimitive.Input
              className="chat-composer-input"
              placeholder="What do you do next?"
              aria-label="Send a message to the narrator"
            />
            <ComposerPrimitive.Send className="chat-send-button">Send</ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </section>
      <aside className="scene-image-panel" aria-label="Scene image panel">
        <h2>Latest Scene</h2>
        <div className="scene-image-viewport">
          {!sceneImageSrc && <p className="scene-image-placeholder">Awaiting scene...</p>}
          {previousSceneImageSrc && (
            <img
              src={previousSceneImageSrc}
              alt="Previous generated scene"
              className={`scene-image-layer scene-image-layer-previous${
                isCrossfading && isCurrentImageVisible ? " is-hidden" : ""
              }`}
            />
          )}
          {sceneImageSrc && (
            <img
              src={sceneImageSrc}
              alt="Latest generated scene"
              className={`scene-image-layer scene-image-layer-current${
                isCurrentImageVisible || !isCrossfading ? " is-visible" : ""
              }`}
            />
          )}
        </div>
      </aside>
    </main>
  );
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
  const { status: websocketStatus, notice: websocketNotice } = useWebSocketConnectionStatus();
  const [view, setView] = useState<AppView>("onboarding");
  const [setting, setSetting] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firstPlayerMessage, setFirstPlayerMessage] = useState<string>("");
  const settingTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [sceneImageSrc, setSceneImageSrc] = useState<string | null>(null);
  const [previousSceneImageSrc, setPreviousSceneImageSrc] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [isCurrentImageVisible, setIsCurrentImageVisible] = useState(false);
  const crossfadeTimeoutRef = useRef<number | null>(null);
  const crossfadeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (view === "onboarding") {
      settingTextareaRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    return () => {
      if (crossfadeTimeoutRef.current !== null) {
        window.clearTimeout(crossfadeTimeoutRef.current);
      }
      if (crossfadeFrameRef.current !== null) {
        window.cancelAnimationFrame(crossfadeFrameRef.current);
      }
    };
  }, []);

  const onSceneImage = (nextImageSrc: string) => {
    setSceneImageSrc((currentImageSrc) => {
      if (currentImageSrc === nextImageSrc) {
        return currentImageSrc;
      }

      if (!currentImageSrc) {
        setPreviousSceneImageSrc(null);
        setIsCrossfading(false);
        setIsCurrentImageVisible(true);
        return nextImageSrc;
      }

      setPreviousSceneImageSrc(currentImageSrc);
      setIsCrossfading(true);
      setIsCurrentImageVisible(false);
      if (crossfadeTimeoutRef.current !== null) {
        window.clearTimeout(crossfadeTimeoutRef.current);
      }
      if (crossfadeFrameRef.current !== null) {
        window.cancelAnimationFrame(crossfadeFrameRef.current);
      }
      crossfadeFrameRef.current = window.requestAnimationFrame(() => {
        setIsCurrentImageVisible(true);
        crossfadeFrameRef.current = null;
      });
      crossfadeTimeoutRef.current = window.setTimeout(() => {
        setPreviousSceneImageSrc(null);
        setIsCrossfading(false);
        crossfadeTimeoutRef.current = null;
      }, 360);

      return nextImageSrc;
    });
  };

  const chatInitialMessages: readonly ThreadMessageLike[] =
    firstPlayerMessage.length > 0
      ? [
          {
            role: "user" as const,
            content: [{ type: "text", text: firstPlayerMessage }],
          },
        ]
      : [];

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

  return (
    <>
      <div className="connection-status-overlay" aria-live="polite">
        <p className="connection-status-badge" data-status={websocketStatus}>
          <span className="connection-status-dot" aria-hidden="true" />
          <span className="connection-status-text">
            {websocketStatus === "connected" ? "Connected" : "Disconnected"}
          </span>
        </p>
        {websocketNotice && (
          <p className="connection-status-banner" role="status">
            {websocketNotice}
          </p>
        )}
      </div>
      {view === "chat" ? (
        <WebSocketRuntimeProvider
          initialMessages={chatInitialMessages}
          onSceneImage={onSceneImage}
        >
          <ChatScreen
            sceneImageSrc={sceneImageSrc}
            previousSceneImageSrc={previousSceneImageSrc}
            isCrossfading={isCrossfading}
            isCurrentImageVisible={isCurrentImageVisible}
          />
        </WebSocketRuntimeProvider>
      ) : (
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
      )}
    </>
  );
}

export default App;
