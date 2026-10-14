import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BoundedCache, FixedWindowLimiter } from "@/lib/ai/limits";
import type { ModelUsage, StructuredModel } from "@/lib/ai/model";
import { getGeminiModel } from "@/lib/ai/gemini.server";
import { runAsk, runCatchUp, type AiDeps } from "@/lib/ai/service";
import type { AskResponse, CatchUpResponse, FallbackReason } from "@/lib/ai/types";
import { EVAL_CASES, resolveCheckpoint, type EvalCase } from "../../evals/cases";
import { loadChase } from "../support/fixture";

// REAL Gemini calls through the production service (context -> provider -> parsing ->
// guards -> response metadata). Opt-in: `npm run verify:ai:smoke` (2 calls) or
// `npm run verify:ai` (smoke first; the full suite runs only if the smoke cases pass).
// Each case runs once: no reruns until something passes. Calls are spaced to respect
// free-tier per-minute limits. Writes reports/ai-verification-<time>.json.

const baseModel = getGeminiModel();
if (!baseModel) {
  throw new Error(
    "GEMINI_API_KEY is not set, so real Gemini verification was NOT run. Add it to .env.local and run `npm run verify:ai:smoke`.",
  );
}
const model: StructuredModel = baseModel;

// A custom endpoint (e.g. a local mock) is allowed for dry runs but is never reported as real verification.
const endpoint = process.env.GEMINI_BASE_URL ? new URL(process.env.GEMINI_BASE_URL).host : "generativelanguage.googleapis.com";
const isRealGemini = !process.env.GEMINI_BASE_URL;
const SPACING_MS = Number(process.env.VERIFY_AI_SPACING_MS ?? (isRealGemini ? 4_500 : 0));
const GROUNDING_REJECTIONS: FallbackReason[] = ["invalid_evidence", "ungrounded_output"];

const chase = loadChase();

interface CallRecord {
  ms: number;
  usage: ModelUsage | null;
  error?: string;
}

/** Same production model, wrapped to record latency and token usage per call. */
function recording(inner: StructuredModel, calls: CallRecord[]): StructuredModel {
  return {
    provider: inner.provider,
    model: inner.model,
    configKey: inner.configKey,
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
let lastCallAt = 0;
let smokePassed = true;

async function spaced() {
  const wait = lastCallAt + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function runCase(c: EvalCase, stage: "smoke" | "full") {
  const calls: CallRecord[] = [];
  const m = recording(model, calls);
  const request = { lastSeenSeq: resolveCheckpoint(chase, c.lastSeen), viewingSeq: resolveCheckpoint(chase, c.viewing) };
  if (c.category !== "no_model_call") await spaced();
  const res = c.op === "catchup" ? await runCatchUp(chase, request, deps(m)) : await runAsk(chase, { ...request, question: c.question! }, deps(m));
  const text = outputText(res);
  const failures: string[] = [];

  const expectedMode = c.category === "no_model_call" ? "no_change" : "ai";
  if (res.mode !== expectedMode) failures.push(`mode ${res.mode}${res.fallbackReason ? ` (${res.fallbackReason})` : ""}, expected ${expectedMode}`);
  if (expectedMode === "ai" && res.provider !== "Gemini") failures.push(`provider ${res.provider}, expected Gemini`);
  if (c.category === "no_model_call" && calls.length > 0) failures.push("model was called");
  if (res.op === "ask" && c.expectedStatus && !c.expectedStatus.includes(res.answer.status)) {
    failures.push(`status ${res.answer.status}, expected ${c.expectedStatus.join(" or ")}`);
  }
  for (const p of c.expectedInOutput) if (!p.test(text)) failures.push(`missing expected fact ${p}`);
  for (const p of c.forbiddenClaims) if (p.test(text)) failures.push(`contains forbidden claim ${p}`);
  // Every cited ID must resolve to evidence the browser can show.
  const cited = res.op === "ask" ? res.answer.evidence : [...res.recap.whatChanged, res.recap.whyItMatters, res.recap.watchNext].flatMap((p) => p.evidence);
  const unresolved = cited.filter((id) => !res.evidence[id]);
  if (unresolved.length) failures.push(`unresolved evidence ${unresolved.join(", ")}`);

  const usage = calls.find((x) => x.usage)?.usage ?? null;
  const grounding =
    res.mode === "ai" ? "accepted" : res.fallbackReason && GROUNDING_REJECTIONS.includes(res.fallbackReason) ? `rejected (${res.fallbackReason})` : "n/a";
  const row = {
    stage,
    id: c.id,
    category: c.category,
    // Only the real endpoint can produce "genuine Gemini"; a mock endpoint is labelled as such.
    result: res.mode === "ai" ? (isRealGemini ? "genuine Gemini" : "AI via custom endpoint") : res.mode === "no_change" ? "no model call" : "fallback",
    provider: res.provider,
    model: res.model,
    mode: res.mode,
    fallbackReason: res.fallbackReason,
    grounding,
    status: res.op === "ask" ? res.answer.status : null,
    latencyMs: calls.map((x) => x.ms),
    usage,
    output: res.op === "ask" ? res.answer : res.recap,
    passed: failures.length === 0,
    failures,
  };
  report.push(row);
  console.log(
    `\n[${stage}/${c.category}] ${c.id}: ${row.result}${res.fallbackReason ? ` (${res.fallbackReason})` : ""}, grounding ${grounding}` +
      `${row.status ? `, status ${row.status}` : ""}, ${calls.map((x) => `${x.ms} ms`).join("+") || "no model call"}` +
      `${usage ? `, tokens in ${usage.inputTokens} / out ${usage.outputTokens} / thinking ${usage.thinkingTokens ?? "n/a"}` : ""}\n${text}\n${failures.length ? `FAIL: ${failures.join("; ")}` : "PASS"}`,
  );
  return failures;
}

const SMOKE_IDS = ["normal-catchup", "chase-calculation"];
const label = `real ${model.provider} ${model.model} via ${endpoint}${isRealGemini ? "" : " (CUSTOM ENDPOINT: not a real Gemini verification)"}`;

describe(label, () => {
  describe("smoke", () => {
    for (const c of EVAL_CASES.filter((x) => SMOKE_IDS.includes(x.id))) {
      it(`smoke ${c.id}: ${c.description}`, async () => {
        const failures = await runCase(c, "smoke");
        if (failures.length) smokePassed = false;
        expect(failures).toEqual([]);
      });
    }
  });

  for (const category of ["ai_required", "honest_refusal", "no_model_call"] as const) {
    describe(`full ${category}`, () => {
      for (const c of EVAL_CASES.filter((x) => x.category === category && !SMOKE_IDS.includes(x.id))) {
        it(`${c.id}: ${c.description}`, async (ctx) => {
          if (!smokePassed) ctx.skip(); // don't spend quota when the basic path is broken
          expect(await runCase(c, "full")).toEqual([]);
        });
      }
    });
  }

  describe("full deliberate fallback", () => {
    it("a provider timeout is reported as a labelled fallback, never as Gemini", async (ctx) => {
      if (!smokePassed) ctx.skip();
      const slow = getGeminiModel(process.env, { attemptTimeoutMs: 1, deadlineMs: 1 })!;
      const res = await runAsk(chase, { lastSeenSeq: 60, viewingSeq: 110, question: "What do India need?" }, deps(slow));
      report.push({ stage: "full", id: "deliberate-timeout", category: "deliberate_fallback", result: res.mode, fallbackReason: res.fallbackReason, passed: res.mode === "fallback" && res.fallbackReason === "timeout" });
      console.log(`\n[full/deliberate_fallback] timeout: ${res.mode} (${res.fallbackReason})`);
      expect(res).toMatchObject({ mode: "fallback", fallbackReason: "timeout", provider: null, model: null });
    });
  });
});

afterAll(() => {
  if (report.length === 0) return;
  const dir = path.resolve(import.meta.dirname, "../../reports");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const summary = Object.fromEntries(
    ["ai_required", "honest_refusal", "no_model_call", "deliberate_fallback"].map((cat) => {
      const rows = report.filter((r) => r.category === cat);
      return [cat, { passed: rows.filter((r) => r.passed).length, ran: rows.length }];
    }),
  );
  writeFileSync(
    file,
    JSON.stringify(
      { provider: model.provider, model: model.model, configKey: model.configKey, endpoint, realGemini: isRealGemini, ranAt: new Date().toISOString(), smokePassed, summary, results: report },
      null,
      2,
    ),
  );
  console.log(`\nSmoke passed: ${smokePassed}. Summary: ${JSON.stringify(summary)}\nReport written to ${file}`);
});
