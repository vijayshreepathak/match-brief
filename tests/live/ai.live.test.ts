import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BoundedCache, FixedWindowLimiter } from "@/lib/ai/limits";
import { getOpenAIModel } from "@/lib/ai/openai.server";
import { runAsk, runCatchUp } from "@/lib/ai/service";
import type { AskResponse, CatchUpResponse } from "@/lib/ai/types";
import { EVAL_CASES, resolveCheckpoint } from "../../evals/cases";
import { loadChase } from "../support/fixture";

// REAL OpenAI calls. Run explicitly with `npm run verify:ai`; costs a few cents.
// Writes reports/ai-verification-<timestamp>.json with every output.

const model = getOpenAIModel();
if (!model) {
  throw new Error(
    "OPENAI_API_KEY is not set, so real-API verification was NOT run. Add it to .env.local and run `npm run verify:ai` again.",
  );
}

const chase = loadChase();
const report: Record<string, unknown>[] = [];

function outputText(res: CatchUpResponse | AskResponse): string {
  if (res.op === "ask") return res.answer.text;
  const r = res.recap;
  return [r.headline, ...r.whatChanged.map((i) => i.text), r.whyItMatters.text, r.watchNext.text].join(" ");
}

describe(`real model: ${model.model}`, () => {
  for (const c of EVAL_CASES) {
    it(`${c.id}: ${c.description}`, async () => {
      const request = { lastSeenSeq: resolveCheckpoint(chase, c.lastSeen), viewingSeq: resolveCheckpoint(chase, c.viewing) };
      const deps = {
        model,
        clientKey: "verify-ai",
        cache: new BoundedCache<never>(1),
        limiter: new FixedWindowLimiter(1_000, 60_000),
        log: (m: string) => console.warn(m),
      };
      const res = c.op === "catchup" ? await runCatchUp(chase, request, deps) : await runAsk(chase, { ...request, question: c.question! }, deps);
      const text = outputText(res);
      const failures: string[] = [];

      const expectedMode = c.expectedMode ?? "ai";
      if (res.mode !== expectedMode) failures.push(`mode ${res.mode} (${res.fallbackReason ?? "-"}), expected ${expectedMode}`);
      if (res.op === "ask" && c.expectedStatus && !c.expectedStatus.includes(res.answer.status)) {
        failures.push(`status ${res.answer.status}, expected ${c.expectedStatus.join(" or ")}`);
      }
      for (const p of c.expectedInOutput) if (!p.test(text)) failures.push(`missing expected fact ${p}`);
      for (const p of c.forbiddenClaims) if (p.test(text)) failures.push(`contains forbidden claim ${p}`);

      report.push({ id: c.id, mode: res.mode, model: res.model, fallbackReason: res.fallbackReason, output: res.op === "ask" ? res.answer : res.recap, failures });
      console.log(`\n[${c.id}] ${res.mode}${res.model ? ` (${res.model})` : ""}\n${text}\n${failures.length ? `FAIL: ${failures.join("; ")}` : "PASS"}`);
      expect(failures).toEqual([]);
    });
  }
});

afterAll(() => {
  const dir = path.resolve(import.meta.dirname, "../../reports");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: model.model, ranAt: new Date().toISOString(), results: report }, null, 2));
  console.log(`\nReport written to ${file}`);
});
