import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BoundedCache, FixedWindowLimiter } from "@/lib/ai/limits";
import type { ModelUsage, StructuredModel } from "@/lib/ai/model";
import { getOpenAIModel } from "@/lib/ai/openai.server";
import { runAsk, runCatchUp, type AiDeps } from "@/lib/ai/service";
import type { AskResponse, CatchUpResponse } from "@/lib/ai/types";
import { EVAL_CASES, resolveCheckpoint, type EvalCase } from "../../evals/cases";
import { loadChase } from "../support/fixture";

// REAL OpenAI calls through the production service (context -> provider -> parsing ->
// guards -> response metadata). Run explicitly with `npm run verify:ai`; each case runs
// once (no retries until something passes). Writes reports/ai-verification-<time>.json.

const baseModel = getOpenAIModel();
if (!baseModel) {
  throw new Error(
    "OPENAI_API_KEY is not set, so real-API verification was NOT run. Add it to .env.local and run `npm run verify:ai` again.",
  );
}
const model: StructuredModel = baseModel;

// A custom endpoint (e.g. a local mock) is allowed for dry runs but is never reported as real verification.
const endpoint = process.env.OPENAI_BASE_URL ? new URL(process.env.OPENAI_BASE_URL).host : "api.openai.com";
const isRealOpenAI = !process.env.OPENAI_BASE_URL;

const chase = loadChase();

interface CallRecord {
  ms: number;
  usage: ModelUsage | null;
  error?: string;
}

/** Same production model, wrapped to record latency and token usage per call. */
function recording(inner: StructuredModel, calls: CallRecord[]): StructuredModel {
  return {
    model: inner.model,
    async generate(request) {
      const start = performance.now();
      try {
        const result = await inner.generate(request);
        calls.push({ ms: Math.round(performance.now() - start), usage: result.usage });
        return result;
      } catch (error) {
        calls.push({ ms: Math.round(performance.now() - start), usage: null, error: (error as Error).message });
        throw error;
      }
    },
  };
}

function deps(m: StructuredModel): AiDeps {
  // Fresh cache and a generous limiter per case: every case reaches the model (no cache hits).
  return { model: m, clientKey: "verify-ai", cache: new BoundedCache(1), limiter: new FixedWindowLimiter(1_000, 60_000), log: (x) => console.warn(x) };
}

function outputText(res: CatchUpResponse | AskResponse): string {
  const point = (p: { text: string; facts: { statement: string }[] }) => [p.text, ...p.facts.map((f) => f.statement)];
  if (res.op === "ask") return point(res.answer).join(" ");
  const r = res.recap;
  return [r.headline, ...r.whatChanged.flatMap(point), ...point(r.whyItMatters), ...point(r.watchNext)].join(" ");
}

const report: Record<string, unknown>[] = [];

async function runCase(c: EvalCase) {
  const calls: CallRecord[] = [];
  const m = recording(model, calls);
  const request = { lastSeenSeq: resolveCheckpoint(chase, c.lastSeen), viewingSeq: resolveCheckpoint(chase, c.viewing) };
  const res = c.op === "catchup" ? await runCatchUp(chase, request, deps(m)) : await runAsk(chase, { ...request, question: c.question! }, deps(m));
  const text = outputText(res);
  const failures: string[] = [];

  const expectedMode = c.category === "no_model_call" ? "no_change" : "ai";
  if (res.mode !== expectedMode) failures.push(`mode ${res.mode}${res.fallbackReason ? ` (${res.fallbackReason})` : ""}, expected ${expectedMode}`);
  if (c.category === "no_model_call" && calls.length > 0) failures.push("model was called");
  if (res.op === "ask" && c.expectedStatus && !c.expectedStatus.includes(res.answer.status)) {
    failures.push(`status ${res.answer.status}, expected ${c.expectedStatus.join(" or ")}`);
  }
  for (const p of c.expectedInOutput) if (!p.test(text)) failures.push(`missing expected fact ${p}`);
  for (const p of c.forbiddenClaims) if (p.test(text)) failures.push(`contains forbidden claim ${p}`);

  const usage = calls.find((x) => x.usage)?.usage ?? null;
  const row = {
    id: c.id,
    category: c.category,
    mode: res.mode,
    fallbackReason: res.fallbackReason,
    status: res.op === "ask" ? res.answer.status : null,
    model: res.model,
    latencyMs: calls.map((x) => x.ms),
    usage,
    output: res.op === "ask" ? res.answer : res.recap,
    passed: failures.length === 0,
    failures,
  };
  report.push(row);
  console.log(
    `\n[${c.category}] ${c.id}: ${res.mode}${res.fallbackReason ? ` (${res.fallbackReason})` : ""}` +
      `${row.status ? `, status ${row.status}` : ""}, ${calls.map((x) => `${x.ms} ms`).join("+") || "no model call"}` +
      `${usage ? `, tokens in ${usage.inputTokens} / out ${usage.outputTokens} (reasoning ${usage.reasoningTokens ?? "n/a"})` : ""}\n${text}\n${failures.length ? `FAIL: ${failures.join("; ")}` : "PASS"}`,
  );
  expect(failures).toEqual([]);
}

describe(`real model ${model.model} via ${endpoint}${isRealOpenAI ? "" : " (CUSTOM ENDPOINT: not a real OpenAI verification)"}`, () => {
  for (const category of ["ai_required", "honest_refusal", "no_model_call"] as const) {
    describe(category, () => {
      for (const c of EVAL_CASES.filter((x) => x.category === category)) {
        it(`${c.id}: ${c.description}`, () => runCase(c));
      }
    });
  }

  describe("deliberate fallback", () => {
    it("a provider timeout is reported as a labelled fallback, never as AI", async () => {
      const slow = getOpenAIModel(process.env, { timeoutMs: 1, maxRetries: 0 })!;
      const res = await runAsk(chase, { lastSeenSeq: 60, viewingSeq: 110, question: "What do India need?" }, deps(slow));
      report.push({ id: "deliberate-timeout", category: "deliberate_fallback", mode: res.mode, fallbackReason: res.fallbackReason, passed: res.mode === "fallback" });
      console.log(`\n[deliberate_fallback] timeout: ${res.mode} (${res.fallbackReason})`);
      expect(res.mode).toBe("fallback");
      expect(res.fallbackReason).toBe("timeout");
      expect(res.model).toBeNull();
    });
  });
});

afterAll(() => {
  const dir = path.resolve(import.meta.dirname, "../../reports");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const summary = Object.fromEntries(
    ["ai_required", "honest_refusal", "no_model_call", "deliberate_fallback"].map((cat) => {
      const rows = report.filter((r) => r.category === cat);
      return [cat, { passed: rows.filter((r) => r.passed).length, total: rows.length }];
    }),
  );
  writeFileSync(
    file,
    JSON.stringify({ model: model.model, endpoint, realOpenAI: isRealOpenAI, ranAt: new Date().toISOString(), summary, results: report }, null, 2),
  );
  console.log(`\nSummary: ${JSON.stringify(summary)}\nReport written to ${file}`);
});
