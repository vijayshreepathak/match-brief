import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/ai/model";
import { createOpenAIModel, getOpenAIModel, readAiConfig } from "@/lib/ai/openai.server";
import { AnswerOutputSchema } from "@/lib/ai/prompts";

// Exercises the real OpenAI SDK request/parse path with a fake fetch: no network, no key.

const config = { apiKey: "sk-test", model: "gpt-5.4-mini", reasoningEffort: "low" as const };
const goodAnswer = { status: "answered", answer: "Here is what India need.", fact_ids: ["F_RUNS_NEEDED"], events: [] };

function responseBody(content: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "gpt-5.4-mini-2026-03-17",
    output: [{ type: "message", id: "msg", status: "completed", role: "assistant", content }],
    usage: { input_tokens: 1200, output_tokens: 180, total_tokens: 1380, output_tokens_details: { reasoning_tokens: 64 } },
    ...extra,
  };
}

function modelWith(fetchImpl: (body: Record<string, unknown>) => Promise<Response> | Response, timeout = 2_000) {
  const requests: Record<string, unknown>[] = [];
  const client = new OpenAI({
    apiKey: "sk-test",
    baseURL: "http://fake.openai.test/v1",
    maxRetries: 0,
    timeout,
    fetch: (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      // Like real fetch, reject when the SDK aborts the request (its timeout).
      return new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        Promise.resolve(fetchImpl(body)).then(resolve, reject);
      });
    }) as unknown as typeof fetch,
  });
  return { model: createOpenAIModel(config, client), requests };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const request = { schema: AnswerOutputSchema, schemaName: "answer", instructions: "rules", input: "MATCH_CONTEXT: {}" };

async function failure(fetchImpl: Parameters<typeof modelWith>[0], timeout?: number) {
  const { model } = modelWith(fetchImpl, timeout);
  try {
    await model.generate(request);
  } catch (error) {
    return error as ProviderError;
  }
  throw new Error("expected a failure");
}

describe("OpenAI provider", () => {
  it("sends bounded, server-controlled settings and parses structured output with usage", async () => {
    const { model, requests } = modelWith(() => json(responseBody([{ type: "output_text", text: JSON.stringify(goodAnswer), annotations: [] }])));
    const result = await model.generate(request);
    expect(result.parsed).toEqual(goodAnswer);
    expect(result.model).toBe("gpt-5.4-mini-2026-03-17");
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 180, reasoningTokens: 64 });
    expect(requests[0]).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 1500,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "answer", strict: true } },
    });
    expect(requests[0]).not.toHaveProperty("temperature");
  });

  it("maps a refusal to a refusal failure", async () => {
    const error = await failure(() => json(responseBody([{ type: "refusal", refusal: "I can't help with that." }])));
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("refusal");
  });

  it("maps an incomplete response (output token limit) to an incomplete failure", async () => {
    const error = await failure(() =>
      json(responseBody([{ type: "output_text", text: '{"status":"answ', annotations: [] }], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })),
    );
    expect(error.kind).toBe("incomplete");
    expect(error.message).toContain("max_output_tokens");
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["JSON that breaks the schema", JSON.stringify({ status: "maybe", answer: 3 })],
  ])("maps %s to invalid output", async (_name, text) => {
    const error = await failure(() => json(responseBody([{ type: "output_text", text, annotations: [] }])));
    expect(error.kind).toBe("invalid_output");
  });

  it("maps HTTP 429 (rate limit or exhausted quota) to its own failure", async () => {
    const error = await failure(() => json({ error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } }, 429));
    expect(error.kind).toBe("provider_rate_limited");
    expect(error.message).toBe("provider status 429 (insufficient_quota)");
  });

  it.each([500, 401, 400])("maps HTTP %i to a provider error without leaking the body", async (status) => {
    const error = await failure(() => json({ error: { message: "secret-ish provider detail", type: "x" } }, status));
    expect(error.kind).toBe("provider_error");
    expect(error.message).toBe(`provider status ${status}`);
  });

  it("maps a slow provider to a timeout", async () => {
    const error = await failure(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(json(responseBody([]))), 2_000)),
      50,
    );
    expect(error.kind).toBe("timeout");
  });
});

describe("AI configuration", () => {
  it("is off without a key, including a whitespace key", () => {
    expect(readAiConfig({})).toBeNull();
    expect(readAiConfig({ OPENAI_API_KEY: "   " })).toBeNull();
    expect(getOpenAIModel({ OPENAI_API_KEY: "" })).toBeNull();
  });

  it("defaults the model and ignores unknown reasoning efforts", () => {
    expect(readAiConfig({ OPENAI_API_KEY: "k" })).toEqual({ apiKey: "k", model: "gpt-5.4-mini", reasoningEffort: null });
    expect(readAiConfig({ OPENAI_API_KEY: "k", OPENAI_REASONING_EFFORT: "turbo" })?.reasoningEffort).toBeNull();
    expect(readAiConfig({ OPENAI_API_KEY: "k", OPENAI_REASONING_EFFORT: "low" })?.reasoningEffort).toBe("low");
  });
});
