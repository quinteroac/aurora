export type ChatApiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const resolveBackendUrl = (): string => {
  const configuredUrl = (import.meta as ImportMeta & { env?: { VITE_BACKEND_URL?: string } }).env
    ?.VITE_BACKEND_URL;
  return configuredUrl && configuredUrl.trim().length > 0
    ? configuredUrl.trim()
    : "http://localhost:3000";
};

export const sendFirstPlayerMessage = async (
  message: string,
  fetchImpl: ChatApiFetch = fetch as unknown as ChatApiFetch
): Promise<void> => {
  const response = await fetchImpl(`${resolveBackendUrl()}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (response.ok) {
    return;
  }

  const payload = (await response.json()) as { error?: unknown };
  const error = typeof payload.error === "string" ? payload.error : `request failed (${response.status})`;
  throw new Error(error);
};
