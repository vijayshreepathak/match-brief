import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Opt-in REAL Gemini browser check: `npm run verify:ai:browser` (builds first).
// The app server reads GEMINI_* from .env.local itself, exactly as in production.
const envFile = path.resolve(__dirname, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.GEMINI_API_KEY?.trim()) {
  throw new Error("GEMINI_API_KEY is not set in .env.local, so the real Gemini browser check was NOT run.");
}
if (process.env.GEMINI_BASE_URL) {
  throw new Error("GEMINI_BASE_URL is set; unset it so the browser check talks to the real Gemini API.");
}

const PORT = 3320;

export default defineConfig({
  testDir: "tests/live-browser",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
  },
  use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${PORT}` },
});
