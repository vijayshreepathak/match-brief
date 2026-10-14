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
  | "invalid_api_key"
  | "model_unavailable"
  | "provider_rate_limited"
  | "quota_exhausted"
  | "safety_blocked"
  | "empty_response"
  | "incomplete_output"
  | "malformed_json"
  | "invalid_output"
  | "invalid_evidence"
  | "ungrounded_output"
  | "timeout"
  | "provider_error"
  | "rate_limited";

export const FALLBACK_REASON_TEXT: Record<FallbackReason, string> = {
  missing_config: "AI is not configured on this server (no Gemini API key).",
  invalid_api_key: "The AI provider rejected the server's API key.",
  model_unavailable: "The configured AI model is unavailable to this project.",
  provider_rate_limited: "The AI provider's rate limit was reached. Try again in a minute.",
  quota_exhausted: "The AI provider's quota or credit for this project is used up.",
  safety_blocked: "The AI provider blocked the response.",
  empty_response: "The AI provider returned an empty response.",
  incomplete_output: "The AI response was cut off before it finished.",
  malformed_json: "The AI response was not valid JSON.",
  invalid_output: "The AI response did not match the expected format.",
  invalid_evidence: "The AI response cited evidence that is not part of this checkpoint, or described a delivery wrongly.",
  ungrounded_output: "The AI response wrote numbers itself or hinted at the result before the chase ended.",
  timeout: "The AI provider did not respond in time.",
  provider_error: "The AI provider returned an error.",
  rate_limited: "Too many AI requests from your connection. Try again in a few minutes.",
};

interface BaseResponse {
  ok: true;
  asOf: AsOf;
  mode: ResponseMode;
  /** Provider that produced the text (e.g. "Gemini"), only when mode is "ai". */
  provider: string | null;
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
