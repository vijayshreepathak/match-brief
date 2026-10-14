import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ProviderError, type ModelRequest, type StructuredModel } from "./model";

// The only module that talks to OpenAI. Server-only, so the key never reaches browser code.

export const DEFAULT_MODEL = "gpt-5.4-mini";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const MAX_OUTPUT_TOKENS = 1_500;
const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

interface AiConfig {
  apiKey: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
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

let client: OpenAI | null = null;
let clientKey: string | null = null;

function getClient(apiKey: string): OpenAI {
  // Created lazily at request time so builds work without credentials.
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    clientKey = apiKey;
  }
  return client;
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError("timeout", "request timed out");
  if (error instanceof OpenAI.APIError) return new ProviderError("provider_error", `provider status ${error.status ?? "unknown"}`);
  // Anything else happened after a response arrived: JSON/Zod parse failures in the
  // SDK's structured-output parser, or SDK finish-reason errors.
  return new ProviderError("invalid_output", "structured output could not be parsed");
}

/** Returns null when no API key is configured (the caller then uses the labelled fallback). */
export function getOpenAIModel(env: NodeJS.ProcessEnv = process.env): StructuredModel | null {
  const config = readAiConfig(env);
  if (!config) return null;

  return {
    model: config.model,
    async generate<T>(request: ModelRequest<T>) {
      try {
        const response = await getClient(config.apiKey).responses.parse({
          model: config.model,
          instructions: request.instructions,
          input: request.input,
          text: { format: zodTextFormat(request.schema, request.schemaName) },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
        });

        if (response.status === "incomplete") {
          throw new ProviderError("invalid_output", `incomplete response: ${response.incomplete_details?.reason ?? "unknown"}`);
        }
        const refused = response.output.some(
          (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
        );
        if (refused || response.output_parsed == null) {
          throw new ProviderError("invalid_output", refused ? "model refused" : "no parsed output");
        }
        return { parsed: response.output_parsed as T, model: response.model ?? config.model };
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}
