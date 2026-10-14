// Response shapes shared by the route handlers and the browser.

export interface EvidenceItem {
  id: string;
  kind: "fact" | "event";
  /** Short label for an evidence chip, e.g. "Runs needed" or "Ball 19.4". */
  chip: string;
  title: string;
  detail: string;
  /** For events: the delivery's sequential position. */
  seq?: number;
}

export interface CitedText {
  text: string;
  evidence: string[];
}

export interface CatchUpRecap {
  headline: string;
  whatChanged: CitedText[];
  /** "interpretation" for AI wording, "calculated" for rule-based fallback numbers. */
  whyItMatters: CitedText & { kind: "interpretation" | "calculated" };
  watchNext: CitedText;
}

export type AnswerStatus = "answered" | "not_in_data" | "declined" | "facts_only";

export interface AnswerResult extends CitedText {
  status: AnswerStatus;
}

export interface AsOf {
  viewingSeq: number;
  viewingLabel: string;
  lastSeenSeq: number;
  lastSeenLabel: string;
}

/** ai = validated model output; fallback = rule-based text; no_change = nothing new to explain. */
export type ResponseMode = "ai" | "fallback" | "no_change";

export type FallbackReason =
  | "missing_config"
  | "provider_error"
  | "timeout"
  | "invalid_output"
  | "invalid_evidence"
  | "ungrounded_output"
  | "rate_limited";

export const FALLBACK_REASON_TEXT: Record<FallbackReason, string> = {
  missing_config: "AI is not configured on this server (no OpenAI API key).",
  provider_error: "The AI provider returned an error.",
  timeout: "The AI provider did not respond in time.",
  invalid_output: "The AI response did not match the expected format.",
  invalid_evidence: "The AI response cited evidence that is not part of this checkpoint.",
  ungrounded_output: "The AI response included numbers or result claims that could not be checked against the match data.",
  rate_limited: "Too many AI requests from your connection. Try again in a few minutes.",
};

interface BaseResponse {
  ok: true;
  asOf: AsOf;
  mode: ResponseMode;
  /** Model that produced the text, only when mode is "ai". */
  model: string | null;
  fallbackReason: FallbackReason | null;
  /** Cited evidence, resolved so the browser can show it. */
  evidence: Record<string, EvidenceItem>;
  cached: boolean;
}

export interface CatchUpResponse extends BaseResponse {
  op: "catchup";
  recap: CatchUpRecap;
}

export interface AskResponse extends BaseResponse {
  op: "ask";
  question: string;
  answer: AnswerResult;
}

export interface ErrorResponse {
  ok: false;
  error: { code: string; message: string };
}

export const MAX_QUESTION_LENGTH = 280;
