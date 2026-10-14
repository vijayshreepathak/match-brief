import { describe, expect, it } from "vitest";
import { buildModelContext } from "@/lib/ai/context";
import { prematureResultClaims, writtenNumbers } from "@/lib/ai/guards";
import { buildModelInput } from "@/lib/ai/prompts";
import { runCatchUp } from "@/lib/ai/service";
import type { StructuredModel } from "@/lib/ai/model";
import { BoundedCache, FixedWindowLimiter } from "@/lib/ai/limits";
import { EVAL_CASES, resolveCheckpoint } from "../../evals/cases";
import { loadChase } from "../support/fixture";

// Offline half of the evaluation cases: deterministic checks only, no real model.
// The live half runs with `npm run verify:ai`.

const chase = loadChase();

/**
 * Bad outputs that the runtime guards cannot detect, because the claim is plain
 * words about something the data does not record. Only the live evaluation's
 * forbidden-claim patterns (and the prompt) address these. Kept explicit so the
 * gap stays visible.
 */
const KNOWN_GUARD_GAPS = ["no-ball-cause"];

describe.each(EVAL_CASES)("eval case $id", (c) => {
  const lastSeen = resolveCheckpoint(chase, c.lastSeen);
  const viewing = resolveCheckpoint(chase, c.viewing);
  const ctx = buildModelContext(chase, c.op, lastSeen, viewing);
  const input = buildModelInput(ctx.payload, c.question);

  it("context contains the facts a grounded answer needs", () => {
    for (const { factId, includes } of c.expectedFacts) {
      expect(ctx.facts.find((f) => f.id === factId)?.value, factId).toContain(includes);
    }
  });

  it("context contains nothing after the viewing checkpoint", () => {
    const future = chase.deliveries.filter((d) => d.seq > viewing).map((d) => d.id);
    for (const id of future) expect(ctx.evidence.has(id)).toBe(false);
    if (!ctx.snapshot.inningsComplete) {
      // Forbidden claims about the outcome must not be derivable from the context itself.
      const contextOnly = input.split("FAN_QUESTION")[0];
      for (const pattern of c.forbiddenClaims) expect(contextOnly).not.toMatch(pattern);
    }
  });

  if (c.badOutput) {
    it("the forbidden-claim patterns detect the known bad output", () => {
      // Validates the eval's own checker, so a live run cannot pass this bad answer.
      expect(c.forbiddenClaims.some((p) => p.test(c.badOutput!))).toBe(true);
    });

    const caught = writtenNumbers(c.badOutput).length > 0 || prematureResultClaims(c.badOutput, ctx.snapshot.inningsComplete).length > 0;
    if (KNOWN_GUARD_GAPS.includes(c.id)) {
      it("is a documented gap: runtime guards cannot detect this bad output", () => {
        expect(caught).toBe(false);
      });
    } else {
      it("the runtime guards reject the known bad output", () => {
        expect(caught).toBe(true);
      });
    }
  }
});

describe("unchanged-checkpoint case", () => {
  it("returns no_change without calling the model", async () => {
    const c = EVAL_CASES.find((e) => e.id === "unchanged-checkpoint")!;
    let calls = 0;
    const model: StructuredModel = {
      provider: "Test",
      model: "never-called",
      configKey: "test",
      async generate() {
        calls += 1;
        throw new Error("should not be called");
      },
    };
    const res = await runCatchUp(
      chase,
      { lastSeenSeq: resolveCheckpoint(chase, c.lastSeen), viewingSeq: resolveCheckpoint(chase, c.viewing) },
      { model, clientKey: "eval", cache: new BoundedCache(5), limiter: new FixedWindowLimiter(5, 1000) },
    );
    expect(res.mode).toBe(c.expectedMode);
    expect(calls).toBe(0);
    for (const pattern of c.expectedInOutput) expect(`${res.recap.headline} ${res.recap.whatChanged[0].text}`).toMatch(pattern);
  });
});

describe("eval suite shape", () => {
  it("covers each required scenario with a bounded number of model calls", () => {
    const counts = EVAL_CASES.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + 1 }), {});
    expect(counts).toEqual({ ai_required: 5, honest_refusal: 4, no_model_call: 1 });
    expect(EVAL_CASES.filter((c) => c.op === "catchup" && c.category === "ai_required").length).toBeGreaterThanOrEqual(2);
  });
});
