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

export interface MediaServiceClient {
  createImageJob(prompt: string): Promise<string>;
  getJobStatus(jobId: string): Promise<MediaServiceJobStatus>;
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

  async createImageJob(prompt: string): Promise<string> {
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

    return payload.job_id;
  }

  async getJobStatus(jobId: string): Promise<MediaServiceJobStatus> {
    const response = await this.fetcher(`${this.baseUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Media Service job status check failed with HTTP ${response.status}`);
    }

    return readJsonResponse<MediaServiceJobStatus>(response);
  }
}
