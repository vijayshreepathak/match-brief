import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { ProviderError, type ModelRequest, type ModelResult, type ProviderFailure, type StructuredModel } from "./model";

// The only module that talks to Google Gemini (official @google/genai SDK, models.generateContent).
// Server-only, so the key never reaches browser code. The browser cannot choose the model,
// thinking level, token limit, timeout or retries: they come from here or from server env.

export const PROVIDER = "Gemini";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const ATTEMPT_TIMEOUT_MS = 12_000;
/** Whole-request budget across attempts; the AI routes allow 30 s. */
const DEADLINE_MS = 25_000;
const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 1_500;

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

/**
 * Thinking levels each model documents (ai.google.dev/gemini-api/docs/thinking, checked 2026-10-15).
 * For a model not listed here, GEMINI_THINKING_LEVEL is not sent and the model's default applies.
 */
const MODEL_THINKING_LEVELS: Record<string, readonly ThinkingLevelName[]> = {
  "gemini-3.5-flash-lite": ["minimal", "low", "medium", "high"],
  "gemini-3.6-flash": ["minimal", "low", "medium", "high"],
  "gemini-3.8-flash": ["low", "medium", "high"],
  "gemini-3-flash-preview": ["minimal", "low", "medium", "high"],
  "gemini-3.1-pro-preview": ["low", "medium", "high"],
  "gemini-3-pro-preview": ["low", "high"],
  "gemini-2.5-pro": ["low", "medium", "high"],
  "gemini-2.5-flash": ["low", "medium", "high"],
  "gemini-2.5-flash-lite": ["low", "medium", "high"],
};

const SDK_THINKING_LEVEL: Record<ThinkingLevelName, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GeminiConfig {
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevelName | null;
  /** Why a requested thinking level was not applied, if it wasn't. */
  thinkingNote: string | null;
  /** Only for tests against a local mock. Unset in real use. */
  baseUrl: string | null;
}

type Env = Record<string, string | undefined>;

/** Reads GEMINI_* only. GOOGLE_API_KEY and Vertex settings are deliberately ignored. */
export function readGeminiConfig(env: Env = process.env): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const requested = env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();
  let thinkingLevel: ThinkingLevelName | null = null;
  let thinkingNote: string | null = null;
  if (requested) {
    const supported = MODEL_THINKING_LEVELS[model];
    if (!(THINKING_LEVELS as readonly string[]).includes(requested)) {
      thinkingNote = `GEMINI_THINKING_LEVEL "${requested}" is not one of ${THINKING_LEVELS.join(", ")}; not sent`;
    } else if (!supported) {
      thinkingNote = `supported thinking levels for ${model} are not known; GEMINI_THINKING_LEVEL not sent`;
    } else if (!supported.includes(requested as ThinkingLevelName)) {
      thinkingNote = `${model} does not support thinking level "${requested}" (supports ${supported.join(", ")}); not sent`;
    } else {
      thinkingLevel = requested as ThinkingLevelName;
    }
  }
  return { apiKey, model, thinkingLevel, thinkingNote, baseUrl: env.GEMINI_BASE_URL?.trim() || null };
}

/** Zod schema -> JSON Schema for Gemini's responseJsonSchema (a documented subset of JSON Schema). */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete json.$schema;
  return json;
}

// ---- error classification ------------------------------------------------------------------

interface Classified {
  kind: ProviderFailure;
  detail: string;
  retryable: boolean;
  retryAfterMs: number | null;
}

interface GoogleErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: Record<string, unknown>[] };
}

function parseDuration(value: unknown): number | null {
  const match = typeof value === "string" ? value.match(/^(\d+(?:\.\d+)?)s$/) : null;
  return match ? Math.ceil(Number(match[1]) * 1_000) : null;
}

/** The SDK puts the raw Google error JSON in ApiError.message. Read it here; never show it to users. */
function classifyApiError(error: ApiError): Classified {
  let body: GoogleErrorBody = {};
  try {
    body = JSON.parse(error.message) as GoogleErrorBody;
  } catch {
    // Non-JSON error bodies are classified by HTTP status alone.
  }
  const rpc = body.error?.status ?? "";
  const message = body.error?.message ?? "";
  const details = body.error?.details ?? [];
  const reasons = details.map((d) => String(d.reason ?? "")).filter(Boolean);
  const quotaIds = details.flatMap((d) =>
    Array.isArray(d.violations) ? d.violations.map((v: { quotaId?: string }) => String(v.quotaId ?? "")) : [],
  );
  const retryAfterMs = details.map((d) => parseDuration(d.retryDelay)).find((ms) => ms !== null) ?? null;
  const status = error.status;
  const label = `HTTP ${status}${rpc ? ` ${rpc}` : ""}${reasons.length ? ` (${reasons.join(", ")})` : ""}`;
  const text = `${message} ${reasons.join(" ")} ${quotaIds.join(" ")}`;

  if (status === 401 || reasons.includes("API_KEY_INVALID") || /api key not valid|api key expired/i.test(message)) {
    return { kind: "invalid_api_key", detail: label, retryable: false, retryAfterMs: null };
  }
  if (status === 402 || /prepay|credit balance|payment_required|billing/i.test(text)) {
    return { kind: "quota_exhausted", detail: label, retryable: false, retryAfterMs: null };
  }
  if (status === 429) {
    // A daily quota (or a free tier with zero quota for this model) will not recover within this request.
    const daily = quotaIds.some((id) => /PerDay/i.test(id)) || /quota_exceeded|daily|limit: 0\b/i.test(text);
    return daily
      ? { kind: "quota_exhausted", detail: `${label} ${quotaIds.join(",")}`.trim(), retryable: false, retryAfterMs: null }
      : { kind: "rate_limited", detail: `${label} ${quotaIds.join(",")}`.trim(), retryable: true, retryAfterMs };
  }
  if (status === 403 || status === 404) {
    return { kind: "model_unavailable", detail: label, retryable: false, retryAfterMs: null };
  }
  if (status === 504) return { kind: "timeout", detail: label, retryable: false, retryAfterMs: null };
  if (status === 500 || status === 503) return { kind: "provider_error", detail: label, retryable: true, retryAfterMs };
  return { kind: "provider_error", detail: label, retryable: false, retryAfterMs: null };
}

function classify(error: unknown): Classified {
  if (error instanceof ProviderError) return { kind: error.kind, detail: error.message, retryable: false, retryAfterMs: null };
  if (error instanceof ApiError) return classifyApiError(error);
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { kind: "timeout", detail: "request timed out", retryable: false, retryAfterMs: null };
  }
  // Network failures (fetch rejected without an HTTP response) are worth one retry.
  return { kind: "provider_error", detail: "network or SDK error", retryable: true, retryAfterMs: null };
}

// ---- response handling ---------------------------------------------------------------------

const BLOCKED_FINISH = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.LANGUAGE,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  "IMAGE_SAFETY",
]);

function readResponse<T>(response: GenerateContentResponse, request: ModelRequest<T>, model: string): ModelResult<T> {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new ProviderError("safety_blocked", `prompt blocked: ${blocked}`);
  const candidate = response.candidates?.[0];
  if (!candidate) throw new ProviderError("empty_response", "no candidates");
  const finish = candidate.finishReason;
  if (finish === FinishReason.MAX_TOKENS) throw new ProviderError("incomplete", "finish reason MAX_TOKENS");
  if (finish && BLOCKED_FINISH.has(finish)) throw new ProviderError("safety_blocked", `finish reason ${finish}`);
  if (finish && finish !== FinishReason.STOP) throw new ProviderError("invalid_output", `finish reason ${finish}`);

  const text = response.text;
  if (!text?.trim()) throw new ProviderError("empty_response", "no text in response");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError("malformed_json", "response was not valid JSON");
  }
  const parsed = request.schema.safeParse(json);
  if (!parsed.success) throw new ProviderError("invalid_output", "response did not match the schema");

  const usage = response.usageMetadata;
  return {
    parsed: parsed.data,
    model: response.modelVersion ?? model,
    usage: usage
      ? {
          inputTokens: usage.promptTokenCount ?? 0,
          outputTokens: usage.candidatesTokenCount ?? 0,
          thinkingTokens: usage.thoughtsTokenCount ?? null,
        }
      : null,
  };
}

// ---- model --------------------------------------------------------------------------------

interface ModelOptions {
  attemptTimeoutMs?: number;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Wraps a GoogleGenAI client as a StructuredModel. Exported so tests can inject a client with a fake fetch. */
export function createGeminiModel(config: GeminiConfig, client: GoogleGenAI, options: ModelOptions = {}): StructuredModel {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const deadlineMs = options.deadlineMs ?? DEADLINE_MS;
  const wait = options.sleep ?? sleep;

  async function attempt<T>(request: ModelRequest<T>, timeoutMs: number): Promise<ModelResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await client.models.generateContent({
        model: config.model,
        contents: [{ role: "user", parts: [{ text: request.input }] }],
        config: {
          systemInstruction: request.instructions,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiJsonSchema(request.schema),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: controller.signal,
          ...(config.thinkingLevel ? { thinkingConfig: { thinkingLevel: SDK_THINKING_LEVEL[config.thinkingLevel] } } : {}),
          // No tools: answers come only from the supplied match context, never search or browsing.
        },
      });
      return readResponse(response, request, config.model);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    provider: PROVIDER,
    model: config.model,
    configKey: `gemini|${config.model}|thinking=${config.thinkingLevel ?? "default"}|max=${MAX_OUTPUT_TOKENS}|${config.baseUrl ?? "api"}`,
    async generate<T>(request: ModelRequest<T>) {
      const deadline = Date.now() + deadlineMs;
      for (let n = 1; ; n++) {
        try {
          return await attempt(request, Math.max(1, Math.min(attemptTimeoutMs, deadline - Date.now())));
        } catch (error) {
          const failure = classify(error);
          const delay = failure.retryAfterMs ?? 1_000;
          // At most one retry, only for transient failures, and only if it fits the deadline.
          const fits = Date.now() + delay + 2_000 < deadline;
          if (n >= MAX_ATTEMPTS || !failure.retryable || !fits) throw new ProviderError(failure.kind, failure.detail);
          await wait(delay);
        }
      }
    },
  };
}

let cachedClient: GoogleGenAI | null = null;
let cachedFor: string | null = null;
let warnedThinking = false;

function clientFor(config: GeminiConfig): GoogleGenAI {
  const key = `${config.apiKey}|${config.baseUrl ?? ""}`;
  if (!cachedClient || cachedFor !== key) {
    // Created lazily at request time so builds work without credentials.
    cachedClient = new GoogleGenAI({
      apiKey: config.apiKey,
      vertexai: false,
      httpOptions: {
        timeout: ATTEMPT_TIMEOUT_MS,
        // The SDK would otherwise retry up to 5 times; retries are bounded above instead.
        retryOptions: { attempts: 1 },
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      },
    });
    cachedFor = key;
  }
  return cachedClient;
}

/**
 * Returns null when GEMINI_API_KEY is not set (the caller then uses the labelled fallback).
 * `options` exists for the opt-in verification harness only; HTTP requests cannot reach it.
 */
export function getGeminiModel(env: Env = process.env, options?: ModelOptions): StructuredModel | null {
  const config = readGeminiConfig(env);
  if (!config) return null;
  if (config.thinkingNote && !warnedThinking) {
    console.warn(`Gemini config: ${config.thinkingNote}`);
    warnedThinking = true;
  }
  return createGeminiModel(config, clientFor(config), options);
}
