import { describe, expect, it } from "vitest";
import { buildModelContext } from "@/lib/ai/context";
import { prematureResultClaims, ungroundedNumbers, allowedNumbers } from "@/lib/ai/guards";
import { buildModelInput } from "@/lib/ai/prompts";
import { runCatchUp } from "@/lib/ai/service";
import type { StructuredModel } from "@/lib/ai/model";
import { BoundedCache, FixedWindowLimiter } from "@/lib/ai/limits";
import { EVAL_CASES, resolveCheckpoint } from "../../evals/cases";
import { loadChase } from "../support/fixture";

// Offline half of the evaluation cases: deterministic checks only, no real model.
// The live half runs with `npm run verify:ai`.

const chase = loadChase();

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
  }
});

describe("unchanged-checkpoint case", () => {
  it("returns no_change without calling the model", async () => {
    const c = EVAL_CASES.find((e) => e.id === "unchanged-checkpoint")!;
    let calls = 0;
    const model: StructuredModel = {
      model: "never-called",
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

describe("runtime guards catch the outcome-leak bad outputs", () => {
  it.each(["normal-catchup", "future-winner", "ignore-context-injection"])("%s", (id) => {
    const c = EVAL_CASES.find((e) => e.id === id)!;
    const ctx = buildModelContext(chase, c.op, resolveCheckpoint(chase, c.lastSeen), resolveCheckpoint(chase, c.viewing));
    const byNumbers = ungroundedNumbers(c.badOutput!, allowedNumbers(ctx, c.question)).length > 0;
    const byResult = prematureResultClaims(c.badOutput!, false).length > 0;
    expect(byNumbers || byResult).toBe(true);
  });
});
