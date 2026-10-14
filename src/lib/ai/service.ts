import type { Chase } from "@/lib/cricket/types";
import { buildModelContext, type ModelContext } from "./context";
import { fallbackAnswer, fallbackRecap, noChangeRecap } from "./fallback";
import { validateAnswer, validateCatchUp, type GuardResult } from "./guards";
import { BoundedCache, FixedWindowLimiter } from "./limits";
import { ProviderError, type ProviderFailure, type StructuredModel } from "./model";
import {
  ASK_INSTRUCTIONS,
  AnswerOutputSchema,
  CATCHUP_INSTRUCTIONS,
  CatchUpOutputSchema,
  PROMPT_VERSION,
  buildModelInput,
} from "./prompts";
import type {
  AnswerResult,
  AskResponse,
  CatchUpRecap,
  CatchUpResponse,
  EvidenceItem,
  FallbackReason,
} from "./types";

// Orchestrates one user-triggered AI operation:
// validate checkpoints -> build context on the server -> cache / rate limit ->
// model call -> guards -> either validated AI output or a labelled rule-based fallback.

type Outcome<T> =
  | { ok: true; value: T; provider: string; model: string; generatedAt: string }
  | { ok: false; reason: FallbackReason; detail: string };

const PROVIDER_REASONS: Record<ProviderFailure, FallbackReason> = {
  timeout: "timeout",
  provider_error: "provider_error",
  rate_limited: "provider_rate_limited",
  quota_exhausted: "quota_exhausted",
  invalid_api_key: "invalid_api_key",
  model_unavailable: "model_unavailable",
  safety_blocked: "safety_blocked",
  empty_response: "empty_response",
  incomplete: "incomplete_output",
  malformed_json: "malformed_json",
  invalid_output: "invalid_output",
};

export interface AiDeps {
  model: StructuredModel | null;
  clientKey: string;
  cache?: BoundedCache<Outcome<unknown>>;
  limiter?: FixedWindowLimiter;
  /** Server log hook; never sent to the browser. */
  log?: (message: string) => void;
}

const sharedCache = new BoundedCache<Outcome<unknown>>(200);
const sharedLimiter = new FixedWindowLimiter(Number(process.env.MATCHBRIEF_AI_RATE_LIMIT) || 30, 10 * 60_000);
const inFlight = new Map<string, Promise<Outcome<unknown>>>();

export function cacheKey(parts: {
  fixtureVersion: string;
  /** StructuredModel.configKey: provider, model and every setting that can change an answer. */
  modelConfig: string;
  op: "catchup" | "ask";
  lastSeenSeq: number;
  viewingSeq: number;
  question?: string;
}): string {
  return JSON.stringify([
    parts.fixtureVersion,
    PROMPT_VERSION,
    parts.modelConfig,
    parts.op,
    parts.lastSeenSeq,
    parts.viewingSeq,
    parts.question ? normalizeQuestion(parts.question).toLowerCase() : "",
  ]);
}

export function normalizeQuestion(question: string): string {
  // Strip control characters and collapse whitespace.
  return question.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function resolveEvidence(ctx: ModelContext, ids: string[]): Record<string, EvidenceItem> {
  const out: Record<string, EvidenceItem> = {};
  for (const id of ids) {
    const item = ctx.evidence.get(id);
    if (item) out[id] = item;
  }
  return out;
}

function recapIds(r: CatchUpRecap): string[] {
  return [...r.whatChanged, r.whyItMatters, r.watchNext].flatMap((i) => i.evidence);
}

async function runModel<T>(
  key: string,
  deps: AiDeps,
  call: (model: StructuredModel) => Promise<GuardResult<T>>,
): Promise<Outcome<T> & { cached: boolean }> {
  const model = deps.model;
  if (!model) return { ok: false, reason: "missing_config", detail: "no API key", cached: false };

  const cache = deps.cache ?? sharedCache;
  const hit = cache.get(key) as Outcome<T> | undefined;
  if (hit) return { ...hit, cached: true };

  // Identical request already running (e.g. double click from two tabs): share it.
  const pending = inFlight.get(key) as Promise<Outcome<T>> | undefined;
  if (pending) return { ...(await pending), cached: false };

  if (!(deps.limiter ?? sharedLimiter).take(deps.clientKey)) {
    return { ok: false, reason: "rate_limited", detail: "per-client limit", cached: false };
  }

  const promise = (async (): Promise<Outcome<T>> => {
    try {
      const result = await call(model);
      if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
      // The configured model name is shown to fans; the provider's exact model version goes to the verification report.
      return { ok: true, value: result.value, provider: model.provider, model: model.model, generatedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ProviderError) {
        return { ok: false, reason: PROVIDER_REASONS[error.kind], detail: error.message };
      }
      return { ok: false, reason: "provider_error", detail: "unexpected error" };
    }
  })();

  inFlight.set(key, promise as Promise<Outcome<unknown>>);
  try {
    const outcome = await promise;
    // Only validated AI output is cached; failures can be retried.
    if (outcome.ok) cache.set(key, outcome as Outcome<unknown>);
    return { ...outcome, cached: false };
  } finally {
    inFlight.delete(key);
  }
}

export async function runCatchUp(
  chase: Chase,
  request: { lastSeenSeq: number; viewingSeq: number },
  deps: AiDeps,
): Promise<CatchUpResponse> {
  const ctx = buildModelContext(chase, "catchup", request.lastSeenSeq, request.viewingSeq);
  const base = { ok: true as const, op: "catchup" as const, asOf: ctx.asOf };

  if (!ctx.interval) {
    const recap = noChangeRecap(chase, ctx);
    return { ...base, mode: "no_change", provider: null, model: null, fallbackReason: null, generatedAt: null, recap, evidence: resolveEvidence(ctx, recapIds(recap)), cached: false };
  }

  const key = cacheKey({ fixtureVersion: chase.fixtureVersion, modelConfig: deps.model?.configKey ?? "", op: "catchup", ...request });
  const outcome = await runModel<CatchUpRecap>(key, deps, async (model) => {
    const { parsed } = await model.generate({
      schema: CatchUpOutputSchema,
      schemaName: "catch_up",
      instructions: CATCHUP_INSTRUCTIONS,
      input: buildModelInput(ctx.payload),
    });
    return validateCatchUp(parsed, ctx);
  });

  if (outcome.ok) {
    return { ...base, mode: "ai", provider: outcome.provider, model: outcome.model, fallbackReason: null, generatedAt: outcome.generatedAt, recap: outcome.value, evidence: resolveEvidence(ctx, recapIds(outcome.value)), cached: outcome.cached };
  }
  deps.log?.(`catchup fallback: ${outcome.reason} (${outcome.detail})`);
  const recap = fallbackRecap(chase, ctx);
  return { ...base, mode: "fallback", provider: null, model: null, fallbackReason: outcome.reason, generatedAt: null, recap, evidence: resolveEvidence(ctx, recapIds(recap)), cached: false };
}

export async function runAsk(
  chase: Chase,
  request: { lastSeenSeq: number; viewingSeq: number; question: string },
  deps: AiDeps,
): Promise<AskResponse> {
  const question = normalizeQuestion(request.question);
  const ctx = buildModelContext(chase, "ask", request.lastSeenSeq, request.viewingSeq);
  const base = { ok: true as const, op: "ask" as const, asOf: ctx.asOf, question };

  const key = cacheKey({ fixtureVersion: chase.fixtureVersion, modelConfig: deps.model?.configKey ?? "", op: "ask", ...request, question });
  const outcome = await runModel<AnswerResult>(key, deps, async (model) => {
    const { parsed } = await model.generate({
      schema: AnswerOutputSchema,
      schemaName: "answer",
      instructions: ASK_INSTRUCTIONS,
      input: buildModelInput(ctx.payload, question),
    });
    return validateAnswer(parsed, ctx);
  });

  if (outcome.ok) {
    return { ...base, mode: "ai", provider: outcome.provider, model: outcome.model, fallbackReason: null, generatedAt: outcome.generatedAt, answer: outcome.value, evidence: resolveEvidence(ctx, outcome.value.evidence), cached: outcome.cached };
  }
  deps.log?.(`ask fallback: ${outcome.reason} (${outcome.detail})`);
  const answer = fallbackAnswer(question, ctx);
  return { ...base, mode: "fallback", provider: null, model: null, fallbackReason: outcome.reason, generatedAt: null, answer, evidence: resolveEvidence(ctx, answer.evidence), cached: false };
}
