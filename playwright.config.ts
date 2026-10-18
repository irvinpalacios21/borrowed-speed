import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
