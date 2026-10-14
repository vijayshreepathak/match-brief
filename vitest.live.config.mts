import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Opt-in real-API verification: `npm run verify:ai`. Reads OPENAI_* from .env.local.
const envFile = path.resolve(import.meta.dirname, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
