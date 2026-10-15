import { defineConfig } from "@playwright/test";

// Screenshot harness for UI reviews: `npm run build && npm run screenshots`.
// Uses the production build with MOCKED Gemini responses (tests/e2e/mock-gemini.mjs),
// so it never calls the real Gemini API. Images go to docs/screenshots/<prefix>-*.jpg.
const MOCK = 4341;
const APP = 3340;

export default defineConfig({
  testDir: "tests/visual",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  webServer: [
    {
      command: "node tests/e2e/mock-gemini.mjs",
      url: `http://127.0.0.1:${MOCK}/health`,
      env: { MOCK_GEMINI_PORT: String(MOCK) },
    },
    {
      command: `npx next start -p ${APP}`,
      url: `http://127.0.0.1:${APP}`,
      env: {
        GEMINI_API_KEY: "test-key-not-real",
        GEMINI_BASE_URL: `http://127.0.0.1:${MOCK}`,
        GEMINI_MODEL: "mock-gemini",
        GEMINI_THINKING_LEVEL: "minimal",
        MATCHBRIEF_AI_RATE_LIMIT: "1000",
      },
    },
  ],
  use: { baseURL: `http://127.0.0.1:${APP}` },
});
