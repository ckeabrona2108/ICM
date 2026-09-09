import { defineConfig, devices } from "@playwright/test";

import { assertCommunityE2EEnvironment, communityE2EBaseUrl } from "./tests/e2e/support/environment";

const environment = assertCommunityE2EEnvironment();
const baseUrl = communityE2EBaseUrl();
const appUrl = new URL(baseUrl);
const webServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND?.trim() ||
  `npx next dev --hostname ${appUrl.hostname} --port ${appUrl.port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/artifacts",
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ru-RU",
    timezoneId: "Europe/Madrid"
  },
  webServer: {
    command: webServerCommand,
    url: new URL("/api/health", baseUrl).href,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      COMMUNITY_E2E_ALLOW: environment.allow,
      DATABASE_URL: environment.databaseUrl,
      DIRECT_URL: environment.databaseUrl,
      E2E_STORAGE_ROOT: environment.storageRoot,
      NEXTAUTH_URL: baseUrl,
      NEXT_PUBLIC_APP_URL: baseUrl
    }
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/
    },
    {
      name: "chromium",
      dependencies: ["auth-setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
