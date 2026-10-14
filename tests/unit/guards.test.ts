import { describe, expect, it } from "vitest";
import { endOfOver } from "@/lib/cricket/engine";
import { buildModelContext, eventKinds } from "@/lib/ai/context";
import { prematureResultClaims, validateAnswer, validateCatchUp, writtenNumbers } from "@/lib/ai/guards";
import type { AnswerOutput, CatchUpOutput } from "@/lib/ai/prompts";
import { loadChase } from "../support/fixture";

const chase = loadChase();
const over10 = endOfOver(chase, 10);
const over18 = endOfOver(chase, 18);
const ctx = buildModelContext(chase, "catchup", over10, over18);
const askCtx = buildModelContext(chase, "ask", over10, over18);

function goodRecap(overrides: Partial<CatchUpOutput> = {}): CatchUpOutput {
  return {
    headline: "Kohli and Pandya rebuild without losing a wicket",
    what_changed: [
      { note: "The partnership kept the scoreboard moving without another wicket.", fact_ids: ["F_INT_RUNS", "F_INT_WICKETS"], events: [] },
      {
        note: "Back-to-back sixes in one Nawaz over changed the mood.",
        fact_ids: [],
        events: [
          { id: "E67", kind: "six" },
          { id: "E70", kind: "six" },
          { id: "E72", kind: "six" },
        ],
      },
    ],
    why_it_matters: { note: "The asking rate still climbed, so the pressure is on the final overs.", fact_ids: ["F_INT_EQUATION"], events: [] },
    watch_next: { note: "Watch whether India can match the required rate.", fact_ids: ["F_RUNS_NEEDED", "F_BALLS_LEFT", "F_RRR"], events: [] },
    ...overrides,
  };
}

const answer = (o: Partial<AnswerOutput>): AnswerOutput => ({ status: "answered", answer: "", fact_ids: [], events: [], ...o });

describe("accepted output renders numbers only from canonical facts", () => {
  it("accepts a grounded recap and renders checkpoint-labelled fact statements", () => {
    const result = validateCatchUp(goodRecap(), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.whyItMatters.kind).toBe("interpretation");
    expect(result.value.watchNext.facts.map((f) => f.statement)).toEqual([
      "Runs needed (as of 18.0 ov): 31 (160 - 129)",
      "Balls remaining (as of 18.0 ov): 12 (120 - 108 legal balls bowled)",
      "Required run rate (as of 18.0 ov): 15.50 per over (31 x 6 / 12 balls)",
    ]);
    expect(result.value.whatChanged[0].facts[0].statement).toBe("Runs scored (10.0–18.0 ov): 84 (10.50 per over)");
    expect(result.value.whatChanged[1].evidence).toEqual(["E67", "E70", "E72"]);
  });

  it("keeps correctly formatted and rounded values exactly as calculated", () => {
    const result = validateAnswer(answer({ answer: "Their scoring rate so far is shown below.", fact_ids: ["F_CRR"] }), askCtx);
    expect(result.ok && result.value.facts[0].statement).toBe("Current run rate (as of 18.0 ov): 7.17 per over (129 x 6 / 108 legal balls)");
  });

  it("allows cricket words that are not counts", () => {
    const text = "Kohli hit a six and a four, then back-to-back sixes. One more big over could change this; the second wicket fell early in a T20 chase.";
    expect(writtenNumbers(text)).toEqual([]);
  });
});

describe("grounding regressions", () => {
  it("cannot swap '31 runs from 12 balls' into '12 runs from 31 balls'", () => {
    for (const note of ["India need 12 runs from 31 balls.", "India need twelve runs from thirty-one balls."]) {
      const bad = goodRecap({ watch_next: { note, fact_ids: ["F_RUNS_NEEDED", "F_BALLS_LEFT"], events: [] } });
      expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "ungrounded_output" });
    }
  });

  it("a valid delivery ID does not validate a wrong claim about that delivery", () => {
    // E104 is a Kohli four, not a wicket.
    const bad = goodRecap({
      what_changed: [{ note: "Pakistan finally broke through.", fact_ids: [], events: [{ id: "E104", kind: "wicket" }] }],
    });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence", detail: expect.stringContaining("E104 was not a wicket") });
  });

  it("rejects a correct value from the wrong checkpoint as the current requirement", () => {
    // "115 off 60" was true when the fan left; it is not what to watch now.
    const bad = goodRecap({ watch_next: { note: "Watch the equation from when you left.", fact_ids: ["F_THEN_SCORE"], events: [] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence", detail: expect.stringContaining("when you left") });
  });

  it("rejects a real past delivery that is outside the catch-up window", () => {
    // E37 (Patel run out) happened before the fan left after over 10.
    const bad = goodRecap({
      what_changed: [{ note: "A run out hurt India.", fact_ids: [], events: [{ id: "E37", kind: "wicket" }] }],
    });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence", detail: expect.stringContaining("outside the catch-up window") });
  });

  it("delivery IDs such as E82 do not authorize numerical claims", () => {
    expect(ctx.citableEvents.has("E82")).toBe(true);
    const bad = goodRecap({ headline: "Kohli races to 82" });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "ungrounded_output" });
  });

  it("numbers from future metadata or the fan's question cannot authorize claims", () => {
    const fromFuture = validateAnswer(answer({ answer: "India finished on 160/6.", fact_ids: ["F_SCORE"] }), askCtx);
    expect(fromFuture).toMatchObject({ ok: false, reason: "ungrounded_output" });
    // The question itself says 82; repeating it is still a model-written number.
    const echoed = validateAnswer(answer({ answer: "Yes, Kohli made 82 not out.", fact_ids: ["F_BAT_V_KOHLI"] }), askCtx);
    expect(echoed).toMatchObject({ ok: false, reason: "ungrounded_output" });
  });

  it("rejects facts and deliveries that are not in this checkpoint's context", () => {
    expect(validateAnswer(answer({ answer: "See the fact.", fact_ids: ["F_MADE_UP"] }), askCtx)).toMatchObject({ reason: "invalid_evidence" });
    expect(validateAnswer(answer({ answer: "That ball.", events: [{ id: "E120", kind: "six" }] }), askCtx)).toMatchObject({
      reason: "invalid_evidence",
      detail: expect.stringContaining("future"),
    });
  });

  it("requires every factual point to cite a fact or delivery", () => {
    const bad = goodRecap({ watch_next: { note: "Watch the run rate.", fact_ids: [], events: [] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence" });
    expect(validateAnswer(answer({ answer: "They need runs." }), askCtx)).toMatchObject({ reason: "invalid_evidence" });
  });

  it("accepts a point citing every boundary in the window, but bounds the number of references", () => {
    // Overs 11-18 contain 10 boundaries; Gemini cited all of them in a real run.
    const all = [...ctx.factsById.get("F_INT_BOUNDARIES")!.eventIds];
    const events = all.map((id) => ({ id, kind: ["E67", "E70", "E72"].includes(id) ? ("six" as const) : ("four" as const) }));
    expect(events).toHaveLength(10);
    const ok = goodRecap({ what_changed: [{ note: "Boundaries flowed in this spell.", fact_ids: ["F_INT_BOUNDARIES"], events }] });
    expect(validateCatchUp(ok, ctx).ok).toBe(true);
    const tooMany = goodRecap({
      what_changed: [{ note: "Every ball mattered.", fact_ids: [], events: ctx.deliveries.slice(0, 17).map((d) => ({ id: d.id, kind: eventKinds(d)[0] })) }],
    });
    expect(validateCatchUp(tooMany, ctx)).toMatchObject({ ok: false, reason: "invalid_output", detail: expect.stringContaining("17 deliveries") });
  });

  it("rejects overlong or empty output", () => {
    expect(validateCatchUp(goodRecap({ headline: "word ".repeat(20) }), ctx)).toMatchObject({ reason: "invalid_output" });
    expect(validateCatchUp(goodRecap({ what_changed: [] }), ctx)).toMatchObject({ reason: "invalid_output" });
  });
});

describe("result spoilers before the chase ends", () => {
  it("catches spoilers that contain no numbers", () => {
    for (const text of [
      "Don't worry, India eventually get over the line.",
      "India won by four wickets.",
      "Kohli goes on to win it for India.",
      "India seal it in the last over.",
      "Kohli was player of the match.",
      // Seen in a real Gemini catch-up at 18.0 ov:
      "More boundaries followed as the batting side chased down the target.",
      "India knocked off the runs.",
    ]) {
      expect(prematureResultClaims(text, false), text).toHaveLength(1);
    }
    const bad = validateAnswer(answer({ status: "answered", answer: "Don't worry, India eventually get over the line.", fact_ids: ["F_STATUS"] }), askCtx);
    expect(bad).toMatchObject({ ok: false, reason: "ungrounded_output" });
  });

  it("allows honest statements that the result is unknown", () => {
    for (const text of [
      "It is not known who will win at this checkpoint.",
      "I can't predict whether India will win.",
      "The result isn't known yet.",
      "India still need a strong finish to win.",
      "India are chasing down a big target.",
    ]) {
      expect(prematureResultClaims(text, false), text).toHaveLength(0);
    }
  });

  it("does not block legitimate answers once the chase is complete", () => {
    const done = buildModelContext(chase, "ask", over18, 125);
    const result = validateAnswer(answer({ answer: "India won the match and got over the line.", fact_ids: ["F_STATUS"] }), done);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.facts[0].statement).toBe("Chase status (as of 20.0 ov): Chase complete: India reached the target and won by 4 wickets (0 balls remaining)");
  });
});

describe("validateAnswer statuses", () => {
  it("allows not_in_data answers without evidence", () => {
    const result = validateAnswer(answer({ status: "not_in_data", answer: "That is not available in the supplied match data." }), askCtx);
    expect(result.ok).toBe(true);
  });
});
