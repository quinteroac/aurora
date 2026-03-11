import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export const resolveFrontendPort = (input: string | undefined): number => {
  if (!input) {
    return 5173;
  }

  const parsedPort = Number.parseInt(input, 10);
  return Number.isNaN(parsedPort) ? 5173 : parsedPort;
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: resolveFrontendPort(process.env.FRONTEND_PORT),
  },
});
