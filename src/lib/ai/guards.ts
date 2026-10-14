import type { ModelContext } from "./context";
import type { AnswerOutput, CatchUpOutput } from "./prompts";
import type { AnswerResult, CatchUpRecap, FallbackReason } from "./types";

// Deterministic checks on model output. Passing them does not prove a claim is
// true; they reject output that is malformed, cites unknown evidence, uses numbers
// that appear nowhere in the supplied data, or states a result that is not known yet.

export type GuardResult<T> = { ok: true; value: T } | { ok: false; reason: FallbackReason; detail: string };

const LIMITS = {
  headlineWords: 16,
  itemWords: 45,
  catchUpWords: 160,
  answerWords: 120,
  maxEvidencePerItem: 10,
};

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function canonicalNumber(token: string): string {
  return String(Number(token));
}

export function numbersIn(text: string): string[] {
  // Delivery IDs such as "E82" are references, not numbers that can ground a claim.
  const withoutIds = text.replace(/\bE\d+\b/g, " ");
  return (withoutIds.match(/\d+(?:\.\d+)?/g) ?? []).map(canonicalNumber);
}

/** Numbers the model may use: anything in the context or question, plus small counts and over numbers. */
export function allowedNumbers(ctx: ModelContext, question = ""): Set<string> {
  const allowed = new Set<string>();
  for (let n = 0; n <= 20; n++) allowed.add(String(n));
  for (const token of [...numbersIn(JSON.stringify(ctx.payload)), ...numbersIn(question)]) {
    allowed.add(token);
    const value = Number(token);
    // Allow "more than 15 an over" for a context value of 15.50.
    allowed.add(String(Math.floor(value)));
    allowed.add(String(Math.ceil(value)));
  }
  return allowed;
}

export function ungroundedNumbers(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n));
}

const RESULT_CLAIM =
  /\b(won|wins by|win by|went on to (?:win|lose)|player of the match|man of the match|clinched|sealed (?:the|a) (?:win|victory|match))\b/i;
// "no-ball" is not a negation.
const NEGATION = /\b(not|never|cannot|unknown|unavailable)\b|n't\b|\bno\b(?!-)/i;

/** Sentences that state a result while the chase is still in progress. */
export function prematureResultClaims(text: string, chaseComplete: boolean): string[] {
  if (chaseComplete) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => RESULT_CLAIM.test(sentence) && !NEGATION.test(sentence));
}

function checkText(
  texts: string[],
  ctx: ModelContext,
  question: string | undefined,
): { reason: FallbackReason; detail: string } | null {
  const allowed = allowedNumbers(ctx, question);
  const all = texts.join(" ");
  const badNumbers = ungroundedNumbers(all, allowed);
  if (badNumbers.length) return { reason: "ungrounded_output", detail: `numbers not in context: ${badNumbers.join(", ")}` };
  const claims = prematureResultClaims(all, ctx.snapshot.inningsComplete);
  if (claims.length) return { reason: "ungrounded_output", detail: `result claim before the chase ended: ${claims[0]}` };
  return null;
}

function checkIds(ids: string[], ctx: ModelContext, required: boolean): { reason: FallbackReason; detail: string } | null {
  if (required && ids.length === 0) return { reason: "invalid_evidence", detail: "missing evidence" };
  if (ids.length > LIMITS.maxEvidencePerItem) return { reason: "invalid_output", detail: "too many evidence IDs" };
  const unknown = ids.filter((id) => !ctx.evidence.has(id));
  if (unknown.length) return { reason: "invalid_evidence", detail: `unknown evidence IDs: ${unknown.join(", ")}` };
  return null;
}

const unique = (ids: string[]) => [...new Set(ids)];

export function validateCatchUp(output: CatchUpOutput, ctx: ModelContext): GuardResult<CatchUpRecap> {
  const items = [...output.what_changed, output.why_it_matters, output.watch_next];
  if (output.what_changed.length < 1 || output.what_changed.length > 4) {
    return { ok: false, reason: "invalid_output", detail: "what_changed must have 1-4 items" };
  }
  if (!output.headline.trim() || words(output.headline) > LIMITS.headlineWords) {
    return { ok: false, reason: "invalid_output", detail: "headline missing or too long" };
  }
  if (items.some((i) => !i.text.trim() || words(i.text) > LIMITS.itemWords)) {
    return { ok: false, reason: "invalid_output", detail: "an item is empty or too long" };
  }
  const allText = [output.headline, ...items.map((i) => i.text)];
  if (words(allText.join(" ")) > LIMITS.catchUpWords) {
    return { ok: false, reason: "invalid_output", detail: "recap too long" };
  }
  for (const item of items) {
    const problem = checkIds(item.evidence_ids, ctx, true);
    if (problem) return { ok: false, ...problem };
  }
  const textProblem = checkText(allText, ctx, undefined);
  if (textProblem) return { ok: false, ...textProblem };

  const cited = (i: { text: string; evidence_ids: string[] }) => ({ text: i.text.trim(), evidence: unique(i.evidence_ids) });
  return {
    ok: true,
    value: {
      headline: output.headline.trim(),
      whatChanged: output.what_changed.map(cited),
      whyItMatters: { ...cited(output.why_it_matters), kind: "interpretation" },
      watchNext: cited(output.watch_next),
    },
  };
}

export function validateAnswer(output: AnswerOutput, ctx: ModelContext, question: string): GuardResult<AnswerResult> {
  const text = output.answer.trim();
  if (!text || words(text) > LIMITS.answerWords) {
    return { ok: false, reason: "invalid_output", detail: "answer missing or too long" };
  }
  const idProblem = checkIds(output.evidence_ids, ctx, output.status === "answered");
  if (idProblem) return { ok: false, ...idProblem };
  const textProblem = checkText([text], ctx, question);
  if (textProblem) return { ok: false, ...textProblem };
  return { ok: true, value: { status: output.status, text, evidence: unique(output.evidence_ids) } };
}
