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

/** A canonical fact rendered by the server, labelled with the checkpoint it describes. */
export interface BoundFact {
  id: string;
  statement: string;
}

export interface CitedText {
  /** AI wording (no numbers) or rule-based text built from calculated facts. */
  text: string;
  /** Numbers shown to the fan come only from these server-rendered facts. */
  facts: BoundFact[];
  /** Every cited fact and delivery ID, for evidence chips. */
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
  | "provider_rate_limited"
  | "timeout"
  | "invalid_output"
  | "model_refusal"
  | "incomplete_output"
  | "invalid_evidence"
  | "ungrounded_output"
  | "rate_limited";

export const FALLBACK_REASON_TEXT: Record<FallbackReason, string> = {
  missing_config: "AI is not configured on this server (no OpenAI API key).",
  provider_error: "The AI provider returned an error.",
  provider_rate_limited: "The AI provider refused the request: rate limit reached or account quota used up.",
  timeout: "The AI provider did not respond in time.",
  invalid_output: "The AI response did not match the expected format.",
  model_refusal: "The AI model declined to answer.",
  incomplete_output: "The AI response was cut off before it finished.",
  invalid_evidence: "The AI response cited evidence that is not part of this checkpoint, or described a delivery wrongly.",
  ungrounded_output: "The AI response wrote numbers itself or hinted at the result before the chase ended.",
  rate_limited: "Too many AI requests from your connection. Try again in a few minutes.",
};

interface BaseResponse {
  ok: true;
  asOf: AsOf;
  mode: ResponseMode;
  /** Model that produced the text, only when mode is "ai". */
  model: string | null;
  fallbackReason: FallbackReason | null;
  /** When the AI text was generated (ISO time). Earlier than the request when served from cache. */
  generatedAt: string | null;
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
