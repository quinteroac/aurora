export type AppView = "onboarding" | "chat";

export type SubmitUniverseSettingResult = {
  error: string | null;
  firstMessage: string | null;
  nextView: AppView;
};

export type SubmitUniverseSettingDeps = {
  sendFirstPlayerMessage: (message: string) => Promise<void>;
};

export const EMPTY_UNIVERSE_VALIDATION_MESSAGE = "Describe your universe before beginning.";

export const validateUniverseSetting = (value: string): string | null => {
  return value.trim().length === 0 ? EMPTY_UNIVERSE_VALIDATION_MESSAGE : null;
};

export const submitUniverseSetting = async (
  value: string,
  deps: SubmitUniverseSettingDeps
): Promise<SubmitUniverseSettingResult> => {
  const trimmed = value.trim();
  const validationError = validateUniverseSetting(trimmed);

  if (validationError) {
    return {
      error: validationError,
      firstMessage: null,
      nextView: "onboarding",
    };
  }

  await deps.sendFirstPlayerMessage(trimmed);

  return {
    error: null,
    firstMessage: trimmed,
    nextView: "chat",
  };
};
