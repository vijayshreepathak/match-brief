import { eventKinds, factStatement, type ModelContext } from "./context";
import type { AnswerOutput, CatchUpOutput, ModelPoint } from "./prompts";
import type { AnswerResult, CatchUpRecap, CitedText, FallbackReason } from "./types";

// Deterministic checks on model output.
//
// The model writes words only; every number shown to the fan is rendered by the
// server from canonical facts it selected by ID, labelled with the checkpoint or
// interval the fact describes. Delivery references are structured {id, kind} claims
// checked against the actual delivery. These checks remove whole classes of error
// (wrong numbers, swapped numbers, numbers from the wrong checkpoint, mislabelled
// deliveries). They do not prove that free-text interpretation is correct.

export type GuardResult<T> = { ok: true; value: T } | { ok: false; reason: FallbackReason; detail: string };
type Problem = { reason: FallbackReason; detail: string } | null;

const LIMITS = {
  headlineWords: 14,
  noteWords: 40,
  catchUpNoteWords: 120,
  answerWords: 70,
  // Sanity bounds, not grounding checks: every cited fact and delivery is still validated.
  // Sized so a point can cite every boundary in a typical window (10 in overs 11-18).
  maxFactsPerPoint: 8,
  maxEventsPerPoint: 16,
};

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// "four"/"six" are boundary names in cricket; only treat them as counts before a countable noun.
const NUMBER_WORDS =
  /\b(two|three|five|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|dozen|half-century|century|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/i;
const FOUR_SIX_COUNT =
  /\b(four|six)\s+(runs?|balls?|wickets?|overs?|deliveries|fours|sixes|boundaries|extras|wides|byes|singles|dots?)\b/i;

/** Numerals or number words in model-written text. The model must select facts instead. */
export function writtenNumbers(text: string): string[] {
  // "T20" names the format; it is not a claim.
  const found = [...(text.replace(/\bT20\b/gi, "").match(/\d+(?:[.,]\d+)?/g) ?? [])];
  const word = text.match(NUMBER_WORDS);
  if (word) found.push(word[0]);
  const count = text.match(FOUR_SIX_COUNT);
  if (count) found.push(count[0]);
  return found;
}

const RESULT_CLAIM = new RegExp(
  [
    String.raw`\bwon\b`,
    String.raw`\bwins? (?:by|it|the match|the game)\b`,
    String.raw`\b(?:will|going to|go on to|goes on to|went on to) (?:win|lose)\b`,
    String.raw`\blos(?:e|es|t) (?:by|it|the match|the game)\b`,
    String.raw`\beventually\b`,
    String.raw`\bwent on to\b`,
    String.raw`\bover the line\b`,
    String.raw`\bhome and dry\b`,
    String.raw`\b(?:seal|clinch)(?:s|es|ed)?\b`,
    String.raw`\bwinning runs?\b`,
    // Past-tense completion phrases ("chased down the target") imply the result.
    String.raw`\bchased (?:it |them |the (?:target|total|runs) )?down\b`,
    String.raw`\b(?:knocked|knocks) off the (?:target|runs|total)\b`,
    String.raw`\bfinal (?:score|result|total)\b`,
    String.raw`\b(?:player|man) of the match\b`,
  ].join("|"),
  "i",
);
// Only explicit statements that the result is unknown exempt a sentence (not any "not"/"don't").
const RESULT_UNKNOWN =
  /\b(?:not (?:yet )?known|unknown|undecided|not (?:yet )?decided|too early to (?:say|tell)|can(?:not|'t) (?:predict|say|tell|know)|won't predict|do(?:n't| not) know|not (?:available|included) in|isn't (?:available|known)|no information)\b/i;

/** Sentences that state or hint at how the chase ends while it is still in progress. */
export function prematureResultClaims(text: string, chaseComplete: boolean): string[] {
  if (chaseComplete) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => RESULT_CLAIM.test(sentence) && !RESULT_UNKNOWN.test(sentence));
}

function checkWording(texts: string[], ctx: ModelContext): Problem {
  const all = texts.join(" ");
  const numbers = writtenNumbers(all);
  if (numbers.length) return { reason: "ungrounded_output", detail: `model wrote numbers itself: ${numbers.join(", ")}` };
  const claims = prematureResultClaims(all, ctx.snapshot.inningsComplete);
  if (claims.length) return { reason: "ungrounded_output", detail: `result hinted before the chase ended: ${claims[0]}` };
  return null;
}

interface PointRules {
  needsEvidence: boolean;
  /** Restrict facts to these scopes (e.g. "watch next" must use current facts). */
  scopes?: string[];
  /** Restrict events to the catch-up window. */
  windowOnly?: boolean;
}

function checkPoint(p: ModelPoint, ctx: ModelContext, rules: PointRules): Problem {
  if (p.fact_ids.length > LIMITS.maxFactsPerPoint || p.events.length > LIMITS.maxEventsPerPoint) {
    return { reason: "invalid_output", detail: `too many references in one point (${p.fact_ids.length} facts, ${p.events.length} deliveries)` };
  }
  if (rules.needsEvidence && p.fact_ids.length + p.events.length === 0) {
    return { reason: "invalid_evidence", detail: "claim has no supporting fact or delivery" };
  }
  for (const id of p.fact_ids) {
    const fact = ctx.factsById.get(id);
    if (!fact) return { reason: "invalid_evidence", detail: `unknown fact ${id}` };
    if (rules.scopes && !rules.scopes.includes(fact.scope)) {
      return { reason: "invalid_evidence", detail: `fact ${id} describes ${fact.scopeLabel}, not the current checkpoint` };
    }
  }
  for (const claim of p.events) {
    const d = ctx.citableEvents.get(claim.id);
    if (!d) return { reason: "invalid_evidence", detail: `unknown or future delivery ${claim.id}` };
    if (!eventKinds(d).includes(claim.kind)) {
      return { reason: "invalid_evidence", detail: `${claim.id} was not a ${claim.kind} (${eventKinds(d).join(", ")})` };
    }
    if (rules.windowOnly && (d.seq <= ctx.asOf.lastSeenSeq || d.seq > ctx.asOf.viewingSeq)) {
      return { reason: "invalid_evidence", detail: `${claim.id} is outside the catch-up window` };
    }
  }
  return null;
}

const unique = (ids: string[]) => [...new Set(ids)];

/** Converts a validated point into display text plus server-rendered fact statements. */
export function renderPoint(note: string, factIds: string[], eventIds: string[], ctx: ModelContext): CitedText {
  const facts = unique(factIds).map((id) => ({ id, statement: factStatement(ctx.factsById.get(id)!) }));
  return { text: note.trim(), facts, evidence: unique([...factIds, ...eventIds]) };
}

export function validateCatchUp(output: CatchUpOutput, ctx: ModelContext): GuardResult<CatchUpRecap> {
  const points = [...output.what_changed, output.why_it_matters, output.watch_next];
  if (output.what_changed.length < 1 || output.what_changed.length > 4) {
    return { ok: false, reason: "invalid_output", detail: "what_changed must have 1-4 points" };
  }
  if (!output.headline.trim() || words(output.headline) > LIMITS.headlineWords) {
    return { ok: false, reason: "invalid_output", detail: "headline missing or too long" };
  }
  if (points.some((p) => !p.note.trim() || words(p.note) > LIMITS.noteWords)) {
    return { ok: false, reason: "invalid_output", detail: "a note is empty or too long" };
  }
  if (words(points.map((p) => p.note).join(" ")) > LIMITS.catchUpNoteWords) {
    return { ok: false, reason: "invalid_output", detail: "recap too long" };
  }

  const checks: [ModelPoint, PointRules][] = [
    ...output.what_changed.map((p): [ModelPoint, PointRules] => [p, { needsEvidence: true, windowOnly: true }]),
    [output.why_it_matters, { needsEvidence: true }],
    [output.watch_next, { needsEvidence: true, scopes: ["now", "match"] }],
  ];
  for (const [point, rules] of checks) {
    const problem = checkPoint(point, ctx, rules);
    if (problem) return { ok: false, ...problem };
  }
  const wording = checkWording([output.headline, ...points.map((p) => p.note)], ctx);
  if (wording) return { ok: false, ...wording };

  const render = (p: ModelPoint) => renderPoint(p.note, p.fact_ids, p.events.map((e) => e.id), ctx);
  return {
    ok: true,
    value: {
      headline: output.headline.trim(),
      whatChanged: output.what_changed.map(render),
      whyItMatters: { ...render(output.why_it_matters), kind: "interpretation" },
      watchNext: render(output.watch_next),
    },
  };
}

export function validateAnswer(output: AnswerOutput, ctx: ModelContext): GuardResult<AnswerResult> {
  const text = output.answer.trim();
  if (!text || words(text) > LIMITS.answerWords) {
    return { ok: false, reason: "invalid_output", detail: "answer missing or too long" };
  }
  const point = { note: text, fact_ids: output.fact_ids, events: output.events };
  const problem = checkPoint(point, ctx, { needsEvidence: output.status === "answered" });
  if (problem) return { ok: false, ...problem };
  const wording = checkWording([text], ctx);
  if (wording) return { ok: false, ...wording };
  return { ok: true, value: { status: output.status, ...renderPoint(text, output.fact_ids, output.events.map((e) => e.id), ctx) } };
}
