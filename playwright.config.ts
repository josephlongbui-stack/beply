import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "work/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      channel:
        process.env.PLAYWRIGHT_CHANNEL ||
        (process.platform === "darwin" &&
        existsSync("/Applications/Google Chrome.app")
          ? "chrome"
          : "chromium"),
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    // Test the built application without racing development manifest rewrites.
    // Run `npm run build` before this suite.
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      POCKET_DATA_DIR: resolve("work/e2e-data"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
