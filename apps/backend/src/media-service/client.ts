export const defaultMediaServicePort = "8000";

export type GenerateImageJobAcceptedResponse = {
  job_id: string;
};

export type MediaServiceJobStatus = {
  status: string;
  result: {
    image_b64: string;
  } | null;
  error: string | null;
};

/** Result of polling a job; matches PRD pollJob return shape. */
export type PollJobResult = {
  status: string;
  result?: { image_b64: string };
  error?: string;
};

export interface MediaServiceClient {
  submitJob(prompt: string): Promise<{ job_id: string }>;
  pollJob(jobId: string): Promise<PollJobResult>;
}

export type HttpFetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const resolveMediaServiceBaseUrl = (env = process.env): string => {
  const configuredUrl = env.MEDIA_SERVICE_URL?.trim();

  if (configuredUrl && configuredUrl.length > 0) {
    return trimTrailingSlash(configuredUrl);
  }

  const configuredPort = env.MEDIA_PORT?.trim();
  const mediaPort = configuredPort && configuredPort.length > 0 ? configuredPort : defaultMediaServicePort;

  return `http://127.0.0.1:${mediaPort}`;
};

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  return (await response.json()) as T;
};

export class HttpMediaServiceClient implements MediaServiceClient {
  constructor(
    private readonly baseUrl: string = resolveMediaServiceBaseUrl(),
    private readonly fetcher: HttpFetcher = fetch
  ) {}

  async submitJob(prompt: string): Promise<{ job_id: string }> {
    const response = await this.fetcher(`${this.baseUrl}/generate/image`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Media Service image job creation failed with HTTP ${response.status}`);
    }

    const payload = await readJsonResponse<GenerateImageJobAcceptedResponse>(response);
    if (!payload.job_id) {
      throw new Error("Media Service image job creation failed: missing job_id");
    }

    return { job_id: payload.job_id };
  }

  async pollJob(jobId: string): Promise<PollJobResult> {
    const response = await this.fetcher(`${this.baseUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Media Service job status check failed with HTTP ${response.status}`);
    }

    const data = await readJsonResponse<MediaServiceJobStatus>(response);
    return {
      status: data.status,
      ...(data.result != null && { result: data.result }),
      ...(data.error != null && { error: data.error }),
    };
  }
}
