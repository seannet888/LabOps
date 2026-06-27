import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../e2e/web",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm run api:dev",
      url: "http://127.0.0.1:3000/api/v1/me",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: "npm run web:dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
