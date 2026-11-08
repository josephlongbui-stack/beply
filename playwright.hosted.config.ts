import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/hosted",
  outputDir: "work/hosted-test-results",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "work/hosted-browser-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:3101",
    reducedMotion: "reduce",
    launchOptions: { channel: "chrome" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "hosted-desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "hosted-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
