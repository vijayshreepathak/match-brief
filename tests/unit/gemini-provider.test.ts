import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/ai/model";
import { createGeminiModel, getGeminiModel, readGeminiConfig, type GeminiConfig } from "@/lib/ai/gemini.server";
import { AnswerOutputSchema } from "@/lib/ai/prompts";

// Exercises the real @google/genai request/parse path with an injected fake fetch:
// no network, no key, no paid calls.

const config: GeminiConfig = { apiKey: "test-key", model: "gemini-3.5-flash-lite", thinkingLevel: "minimal", thinkingNote: null, baseUrl: null };
const goodAnswer = { status: "answered", answer: "Here is what India need.", fact_ids: ["F_RUNS_NEEDED"], events: [] };
const request = { schema: AnswerOutputSchema, schemaName: "answer", instructions: "rules", input: "MATCH_CONTEXT: {}" };

type Reply = { status?: number; body: unknown } | "hang";

function geminiBody(text: string | null, extra: Record<string, unknown> = {}, finishReason = "STOP") {
  return {
    candidates: text === null ? [] : [{ content: { role: "model", parts: [{ text }] }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 120, thoughtsTokenCount: 40, totalTokenCount: 1660 },
    modelVersion: "gemini-3.5-flash-lite",
    ...extra,
  };
}

function googleError(code: number, status: string, message: string, details: unknown[] = []) {
  return { error: { code, status, message, details } };
}

/** A model whose fetch replies from a queue; records each request. */
function modelWith(replies: Reply[], options: { deadlineMs?: number; attemptTimeoutMs?: number } = {}) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const sleeps: number[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  };
  const client = new GoogleGenAI({
    apiKey: config.apiKey,
    vertexai: false,
    httpOptions: { baseUrl: "http://fake-gemini.test", retryOptions: { attempts: 1 }, fetch: fetchImpl as typeof fetch },
  });
  const model = createGeminiModel(config, client, {
    ...options,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { model, calls, sleeps };
}

async function failure(replies: Reply[], options?: { deadlineMs?: number; attemptTimeoutMs?: number }) {
  const { model, calls, sleeps } = modelWith(replies, options);
  try {
    await model.generate(request);
  } catch (error) {
    return { error: error as ProviderError, calls, sleeps };
  }
  throw new Error("expected a failure");
}

describe("Gemini provider: successful generation", () => {
  it("sends server-controlled structured-output settings and parses JSON with usage", async () => {
    const { model, calls } = modelWith([{ body: geminiBody(JSON.stringify(goodAnswer)) }]);
    const result = await model.generate(request);

    expect(result.parsed).toEqual(goodAnswer);
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 120, thinkingTokens: 40 });
    expect(model).toMatchObject({ provider: "Gemini", model: "gemini-3.5-flash-lite" });
    expect(model.configKey).toContain("thinking=minimal");

    const sent = calls[0];
    expect(sent.url).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(sent.headers.get("x-goog-api-key")).toBe("test-key");
    expect(sent.body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "MATCH_CONTEXT: {}" }] }],
      systemInstruction: { parts: [{ text: "rules" }] },
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      },
    });
    const schema = (sent.body.generationConfig as { responseJsonSchema: Record<string, unknown> }).responseJsonSchema;
    expect(schema).toMatchObject({ type: "object", required: ["status", "answer", "fact_ids", "events"] });
    expect(schema).not.toHaveProperty("$schema");
    // Answers come only from the supplied context: no tools, search or browsing.
    expect(sent.body).not.toHaveProperty("tools");
  });

  it("omits thinking config when no supported level is configured", async () => {
    const client = new GoogleGenAI({ apiKey: "k", vertexai: false, httpOptions: { baseUrl: "http://x.test", retryOptions: { attempts: 1 }, fetch: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.generationConfig).not.toHaveProperty("thinkingConfig");
      return new Response(JSON.stringify(geminiBody(JSON.stringify(goodAnswer))), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch } });
    await createGeminiModel({ ...config, thinkingLevel: null }, client).generate(request);
  });
});

describe("Gemini provider: response problems", () => {
  it.each([
    ["a blocked prompt", { body: geminiBody(null, { promptFeedback: { blockReason: "SAFETY" } }) }, "safety_blocked"],
    ["a safety-stopped candidate", { body: geminiBody("{}", {}, "SAFETY") }, "safety_blocked"],
    ["output cut off at the token limit", { body: geminiBody('{"status":"ans', {}, "MAX_TOKENS") }, "incomplete"],
    ["no candidates", { body: geminiBody(null) }, "empty_response"],
    ["an empty text part", { body: geminiBody("   ") }, "empty_response"],
    ["malformed JSON", { body: geminiBody("{not json") }, "malformed_json"],
    ["JSON that breaks the schema", { body: geminiBody(JSON.stringify({ status: "maybe", answer: 3 })) }, "invalid_output"],
  ] as const)("maps %s", async (_name, reply, kind) => {
    const { error, calls } = await failure([reply]);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe(kind);
    expect(calls).toHaveLength(1); // never retried
  });
});

describe("Gemini provider: API errors", () => {
  it.each([
    ["an invalid key (400 API_KEY_INVALID)", 400, googleError(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]), "invalid_api_key"],
    ["an unauthenticated key (401)", 401, googleError(401, "UNAUTHENTICATED", "Request had invalid authentication credentials."), "invalid_api_key"],
    ["a depleted prepay balance (402)", 402, googleError(402, "PAYMENT_REQUIRED", "Your Prepay credit balance is depleted."), "quota_exhausted"],
    ["a missing model (404)", 404, googleError(404, "NOT_FOUND", "models/x is not found for API version v1beta."), "model_unavailable"],
    ["a forbidden model (403)", 403, googleError(403, "PERMISSION_DENIED", "Permission denied on resource."), "model_unavailable"],
    [
      "a daily quota (429 PerDay)",
      429,
      googleError(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.", [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3s" },
      ]),
      "quota_exhausted",
    ],
    ["a bad request (400)", 400, googleError(400, "INVALID_ARGUMENT", "Invalid JSON payload."), "provider_error"],
    ["a deadline exceeded (504)", 504, googleError(504, "DEADLINE_EXCEEDED", "Deadline expired."), "timeout"],
  ] as const)("maps %s without retrying", async (_name, status, body, kind) => {
    const { error, calls } = await failure([{ status, body }]);
    expect(error.kind).toBe(kind);
    expect(calls).toHaveLength(1);
    // Provider message text never becomes the error message shown anywhere.
    expect(error.message).not.toMatch(/Please pass|Prepay credit|not found for API/);
  });

  it("retries a per-minute rate limit once, honouring retryDelay, and can succeed", async () => {
    const limited = googleError(429, "RESOURCE_EXHAUSTED", "Rate limit.", [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" },
    ]);
    const { model, calls, sleeps } = modelWith([{ status: 429, body: limited }, { body: geminiBody(JSON.stringify(goodAnswer)) }]);
    await expect(model.generate(request)).resolves.toMatchObject({ parsed: goodAnswer });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2_000]);
  });

  it("does not retry when retryDelay would exceed the request deadline", async () => {
    const limited = googleError(429, "RESOURCE_EXHAUSTED", "Rate limit.", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "57s" }]);
    const { error, calls } = await failure([{ status: 429, body: limited }]);
    expect(error.kind).toBe("rate_limited");
    expect(calls).toHaveLength(1);
  });

  it("retries a server error at most once", async () => {
    const unavailable = googleError(503, "UNAVAILABLE", "The model is overloaded.");
    const { error, calls } = await failure([{ status: 503, body: unavailable }, { status: 503, body: unavailable }]);
    expect(error.kind).toBe("provider_error");
    expect(calls).toHaveLength(2);
  });

  it("times out a provider that never answers", async () => {
    const { error } = await failure(["hang"], { attemptTimeoutMs: 50 });
    expect(error.kind).toBe("timeout");
  });
});

describe("Gemini configuration and key isolation", () => {
  it("is off without GEMINI_API_KEY, including a whitespace key", () => {
    expect(readGeminiConfig({})).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: "   " })).toBeNull();
    expect(getGeminiModel({ GEMINI_API_KEY: "" })).toBeNull();
  });

  it("never picks up another credential", () => {
    expect(readGeminiConfig({ GOOGLE_API_KEY: "other-google-key" })).toBeNull();
    expect(readGeminiConfig({ OPENAI_API_KEY: "old-openai-key" })).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: "gem", GOOGLE_API_KEY: "other" })?.apiKey).toBe("gem");
  });

  it("defaults to gemini-3.5-flash-lite and applies a supported thinking level", () => {
    expect(readGeminiConfig({ GEMINI_API_KEY: "k" })).toMatchObject({ model: "gemini-3.5-flash-lite", thinkingLevel: null, thinkingNote: null });
    expect(readGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_THINKING_LEVEL: "minimal" })?.thinkingLevel).toBe("minimal");
  });

  it("does not send a thinking level the model does not support", () => {
    // gemini-3.8-flash documents low/medium/high only.
    const c = readGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.8-flash", GEMINI_THINKING_LEVEL: "minimal" });
    expect(c?.thinkingLevel).toBeNull();
    expect(c?.thinkingNote).toContain("does not support");
    const unknown = readGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "some-future-model", GEMINI_THINKING_LEVEL: "low" });
    expect(unknown?.thinkingLevel).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_THINKING_LEVEL: "turbo" })?.thinkingLevel).toBeNull();
  });

  it("keeps the configured thinking level and model in the cache identity", () => {
    const minimal = getGeminiModel({ GEMINI_API_KEY: "k", GEMINI_THINKING_LEVEL: "minimal" })!;
    const low = getGeminiModel({ GEMINI_API_KEY: "k", GEMINI_THINKING_LEVEL: "low" })!;
    const other = getGeminiModel({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.6-flash" })!;
    expect(new Set([minimal.configKey, low.configKey, other.configKey]).size).toBe(3);
    expect(minimal.configKey).not.toContain("k|");
  });
});
