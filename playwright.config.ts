import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      'concurrently -k "tsx server/index.ts" "vite --host 127.0.0.1 --port 5174 --strictPort"',
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      DATA_MODE: "demo",
      PORT: "3002",
      VITE_API_TARGET: "http://127.0.0.1:3002",
    },
  },
});
