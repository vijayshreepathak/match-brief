import { describe, expect, it } from "vitest";
import { endOfOver } from "@/lib/cricket/engine";
import { buildModelContext } from "@/lib/ai/context";
import { numbersIn, prematureResultClaims, validateAnswer, validateCatchUp } from "@/lib/ai/guards";
import type { CatchUpOutput } from "@/lib/ai/prompts";
import { loadChase } from "../support/fixture";

const chase = loadChase();
const ctx = buildModelContext(chase, "catchup", endOfOver(chase, 10), endOfOver(chase, 18));
const askCtx = buildModelContext(chase, "ask", endOfOver(chase, 10), endOfOver(chase, 18));

function goodRecap(overrides: Partial<CatchUpOutput> = {}): CatchUpOutput {
  return {
    headline: "Kohli and Pandya rebuild without losing a wicket",
    what_changed: [
      { text: "India added 84 runs for no wickets in the last 8 overs.", evidence_ids: ["F_INT_RUNS", "F_INT_WICKETS"] },
      { text: "Three sixes came in the 12th over.", evidence_ids: ["E67", "E70", "E72"] },
    ],
    why_it_matters: {
      text: "The required rate still rose from 11.50 to 15.50, so the pressure is on the last two overs.",
      evidence_ids: ["F_INT_EQUATION"],
    },
    watch_next: { text: "India need 31 off 12 balls.", evidence_ids: ["F_RUNS_NEEDED", "F_BALLS_LEFT"] },
    ...overrides,
  };
}

describe("numeric grounding", () => {
  it("extracts and canonicalizes numbers", () => {
    expect(numbersIn("needs 15.50 an over, 31 off 12")).toEqual(["15.5", "31", "12"]);
  });
});

describe("validateCatchUp", () => {
  it("accepts grounded output and keeps evidence IDs", () => {
    const result = validateCatchUp(goodRecap(), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.whyItMatters.kind).toBe("interpretation");
      expect(result.value.whatChanged[1].evidence).toEqual(["E67", "E70", "E72"]);
    }
  });

  it("rejects evidence IDs that do not exist", () => {
    const bad = goodRecap({ watch_next: { text: "India need 31 off 12 balls.", evidence_ids: ["F_MADE_UP"] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence" });
  });

  it("rejects evidence from future deliveries", () => {
    const bad = goodRecap({ watch_next: { text: "India need 31 off 12 balls.", evidence_ids: ["E120"] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence" });
  });

  it("rejects claims with no evidence", () => {
    const bad = goodRecap({ watch_next: { text: "India need 31 off 12 balls.", evidence_ids: [] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "invalid_evidence" });
  });

  it("rejects numbers that appear nowhere in the supplied data", () => {
    const bad = goodRecap({ headline: "Kohli races to 82 not out" });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "ungrounded_output" });
  });

  it("rejects a result claim before the chase is over", () => {
    const bad = goodRecap({ watch_next: { text: "India won with a last-ball single.", evidence_ids: ["F_STATUS"] } });
    expect(validateCatchUp(bad, ctx)).toMatchObject({ ok: false, reason: "ungrounded_output" });
  });

  it("rejects overlong or empty recaps", () => {
    const long = goodRecap({ headline: "word ".repeat(30) });
    expect(validateCatchUp(long, ctx)).toMatchObject({ ok: false, reason: "invalid_output" });
    expect(validateCatchUp(goodRecap({ what_changed: [] }), ctx)).toMatchObject({ ok: false, reason: "invalid_output" });
  });
});

describe("prematureResultClaims", () => {
  it("flags result statements but not refusals", () => {
    expect(prematureResultClaims("India won by 4 wickets.", false)).toHaveLength(1);
    expect(prematureResultClaims("It is not known who won at this checkpoint.", false)).toHaveLength(0);
    expect(prematureResultClaims("India can't say who won yet.", false)).toHaveLength(0);
    // "no-ball" is not a negation.
    expect(prematureResultClaims("India won after a no-ball.", false)).toHaveLength(1);
    expect(prematureResultClaims("India won by 4 wickets.", true)).toHaveLength(0);
  });
});

describe("validateAnswer", () => {
  it("requires evidence for answered questions", () => {
    const result = validateAnswer({ status: "answered", answer: "India need 31 off 12.", evidence_ids: [] }, askCtx, "q");
    expect(result).toMatchObject({ ok: false, reason: "invalid_evidence" });
  });

  it("allows not_in_data answers without evidence", () => {
    const result = validateAnswer(
      { status: "not_in_data", answer: "That is not available in the supplied match data.", evidence_ids: [] },
      askCtx,
      "Is anyone injured?",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts numbers that came from the fan's own question", () => {
    const result = validateAnswer(
      { status: "answered", answer: "Scoring 13 an over would not be enough; India need 15.50 per over.", evidence_ids: ["F_RRR"] },
      askCtx,
      "Is 13 an over enough?",
    );
    expect(result.ok).toBe(true);
  });
});
