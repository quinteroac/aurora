import { Elysia } from "elysia";

export const backendServiceName = "backend";
export const defaultPort = 3000;

export const resolvePort = (port = process.env.PORT): number => {
  if (!port) {
    return defaultPort;
  }

  const parsedPort = Number.parseInt(port, 10);
  return Number.isFinite(parsedPort) ? parsedPort : defaultPort;
};

export const createApp = () =>
  new Elysia().get("/health", () => ({
    status: "ok",
    service: backendServiceName,
  }));

if (import.meta.main) {
  createApp().listen(resolvePort());
}
