import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ProviderError, type ModelRequest, type StructuredModel } from "./model";

// The only module that talks to OpenAI. Server-only, so the key never reaches browser code.
// Clients cannot choose the model, token limit, timeout or retries: all come from here or server env.

export const DEFAULT_MODEL = "gpt-5.4-mini";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const MAX_OUTPUT_TOKENS = 1_500;
const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface AiConfig {
  apiKey: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
}

type Env = Record<string, string | undefined>;

export function readAiConfig(env: Env = process.env): AiConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const effort = env.OPENAI_REASONING_EFFORT?.trim() as ReasoningEffort | undefined;
  return {
    apiKey,
    model: env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    // Only sent when set: not every model accepts a reasoning setting.
    reasoningEffort: effort && REASONING_EFFORTS.includes(effort) ? effort : null,
  };
}

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;

function sharedClient(apiKey: string): OpenAI {
  // Created lazily at request time so builds work without credentials.
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    cachedKey = apiKey;
  }
  return cachedClient;
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError("timeout", "request timed out");
  // 429 covers both rate limits and an exhausted credit balance (insufficient_quota).
  if (error instanceof OpenAI.RateLimitError) {
    const code = (error.error as { code?: string } | undefined)?.code ?? error.code ?? "rate_limit";
    return new ProviderError("provider_rate_limited", `provider status 429 (${code})`);
  }
  if (error instanceof OpenAI.APIError) return new ProviderError("provider_error", `provider status ${error.status ?? "connection"}`);
  // Anything else happened after a response arrived: JSON/Zod parse failures in the
  // SDK's structured-output parser, or SDK finish-reason errors.
  return new ProviderError("invalid_output", "structured output could not be parsed");
}

/** Wraps an OpenAI client as a StructuredModel. Exported so tests can inject a client with a fake fetch. */
export function createOpenAIModel(config: AiConfig, client: OpenAI): StructuredModel {
  return {
    model: config.model,
    async generate<T>(request: ModelRequest<T>) {
      try {
        const response = await client.responses.parse({
          model: config.model,
          instructions: request.instructions,
          input: request.input,
          text: { format: zodTextFormat(request.schema, request.schemaName) },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
        });

        if (response.status === "incomplete") {
          throw new ProviderError("incomplete", `incomplete response: ${response.incomplete_details?.reason ?? "unknown"}`);
        }
        const refused = response.output.some(
          (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
        );
        if (refused) throw new ProviderError("refusal", "model refused");
        if (response.output_parsed == null) throw new ProviderError("invalid_output", "no parsed output");

        const usage = response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? null,
            }
          : null;
        return { parsed: response.output_parsed as T, model: response.model ?? config.model, usage };
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}

/**
 * Returns null when no API key is configured (the caller then uses the labelled fallback).
 * `overrides` exists for the opt-in verification harness only; HTTP requests cannot reach it.
 */
export function getOpenAIModel(
  env: Env = process.env,
  overrides?: { timeoutMs?: number; maxRetries?: number },
): StructuredModel | null {
  const config = readAiConfig(env);
  if (!config) return null;
  const client = overrides
    ? new OpenAI({
        apiKey: config.apiKey,
        timeout: overrides.timeoutMs ?? REQUEST_TIMEOUT_MS,
        maxRetries: overrides.maxRetries ?? MAX_RETRIES,
      })
    : sharedClient(config.apiKey);
  return createOpenAIModel(config, client);
}
