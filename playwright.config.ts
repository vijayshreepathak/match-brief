import { defineConfig, devices } from "@playwright/test";

// Runs against a production build (`npm run test:e2e` builds first).
// Two app servers share one build: one with AI pointed at a local mock of the
// Gemini generateContent API, one with no API key at all.
const MOCK = 4311;
const AI = 3310;
const NO_KEY = 3311;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  webServer: [
    {
      command: "node tests/e2e/mock-gemini.mjs",
      url: `http://127.0.0.1:${MOCK}/health`,
      env: { MOCK_GEMINI_PORT: String(MOCK) },
    },
    {
      command: `npx next start -p ${AI}`,
      url: `http://127.0.0.1:${AI}`,
      env: {
        GEMINI_API_KEY: "test-key-not-real",
        GEMINI_BASE_URL: `http://127.0.0.1:${MOCK}`,
        GEMINI_MODEL: "mock-gemini",
        GEMINI_THINKING_LEVEL: "minimal",
        MATCHBRIEF_AI_RATE_LIMIT: "1000",
      },
    },
    {
      command: `npx next start -p ${NO_KEY}`,
      url: `http://127.0.0.1:${NO_KEY}`,
      // Whitespace counts as "not configured" and, unlike an empty value, survives on Windows.
      env: { GEMINI_API_KEY: " ", MATCHBRIEF_AI_RATE_LIMIT: "1000" },
    },
  ],
  projects: [
    {
      name: "desktop",
      testIgnore: [/no-key\.spec/, /mobile\.spec/],
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${AI}` },
    },
    {
      name: "no-key",
      testMatch: /no-key\.spec/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${NO_KEY}` },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec/,
      use: { ...devices["Pixel 7"], baseURL: `http://127.0.0.1:${AI}` },
    },
  ],
});
