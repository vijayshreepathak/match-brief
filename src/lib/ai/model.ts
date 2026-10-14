import type { z } from "zod";

// Provider-agnostic contract so the service can be tested with a fake model.

export interface ModelRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  input: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
}

export interface ModelResult<T> {
  parsed: T;
  /** Model version reported by the provider. */
  model: string;
  usage: ModelUsage | null;
}

export interface StructuredModel {
  /** Display name of the provider, e.g. "Gemini". */
  readonly provider: string;
  readonly model: string;
  /** Every provider setting that can change an answer (model, thinking level...). Part of each cache key. */
  readonly configKey: string;
  generate<T>(request: ModelRequest<T>): Promise<ModelResult<T>>;
}

export type ProviderFailure =
  | "timeout"
  | "provider_error"
  | "rate_limited"
  | "quota_exhausted"
  | "invalid_api_key"
  | "model_unavailable"
  | "safety_blocked"
  | "empty_response"
  | "incomplete"
  | "malformed_json"
  | "invalid_output";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    message: string,
  ) {
    super(message);
  }
}
