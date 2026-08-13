import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
