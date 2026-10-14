# Verification record

This record covers the OpenAI → Google Gemini migration on 2026-10-15 (IST).
Every result below comes from a command that was actually run. Mocked tests and
real-provider checks are reported separately.

## Overall status

| Requirement | Status |
| --- | --- |
| Lint, typecheck, unit tests, build, mocked e2e | **Pass** |
| Real Gemini catch-up | **NOT VERIFIED.** `.env.local` had no `GEMINI_API_KEY`, so no real Gemini call was made. |
| Real Gemini Q&A | **NOT VERIFIED** (same reason) |
| Public deployment | **NOT DONE.** Needs your authorization and a verified key. |
| Submission | **Not ready**, for the reasons above |

## Final quality gates

| Command | Result |
| --- | --- |
| `npm run lint` | pass (exit 0) |
| `npm run typecheck` | pass (exit 0) |
| `npm test` | **221 / 221 passed**, 10 files. No network, no key, no paid calls. |
| `npm run test:e2e` (runs `next build` first) | build OK; **23 / 23 passed**: 20 desktop (Gemini mock), 2 no-key, 1 mobile |
| `npm audit --omit=dev` | **0 vulnerabilities**, with `@google/genai` installed |
| `npm audit` | 5 high, all in one dev-only `braces` chain (unchanged; see `docs/DECISIONS.md` §17) |
| `git diff --check` | clean |
| `npm run verify:ai:smoke` / `verify:ai` / `verify:ai:browser` (real Gemini) | **NOT RUN**: no `GEMINI_API_KEY` |

`npm run build` was not run separately, because `test:e2e` runs `next build`
first.

## How the Gemini path was tested without a key

These tests exercise the production code path, **not** the real model.

**Unit tests** use the real `@google/genai` 2.29.1 SDK with an injected fake
`fetch`. They confirm:

- the exact request the SDK sends: `contents`, `systemInstruction`,
  `generationConfig.responseMimeType`, `responseJsonSchema` (no `$schema`),
  `maxOutputTokens: 1500` and `thinkingConfig.thinkingLevel: "MINIMAL"`, with
  the key sent in the `x-goog-api-key` header and no tools;
- parsing and usage (prompt, candidate and thought tokens);
- each failure class:

| Failure | How it was simulated |
| --- | --- |
| Invalid key | 400 `API_KEY_INVALID`, and 401 |
| Depleted prepay balance | 402 |
| Model unavailable | 404 / 403 |
| Daily quota | 429 with a `PerDay` quota ID; not retried |
| Per-minute rate limit | 429; retried once after `retryDelay`, or not retried if the delay doesn't fit the deadline |
| Server error | 503; retried once only |
| Timeout | the request never answers |
| Bad request | 400 |
| Deadline exceeded | 504 |
| Safety block | prompt blocked, or a SAFETY finish reason |
| Cut-off output | `MAX_TOKENS` |
| Empty response | no candidates, or blank text |
| Malformed JSON | invalid JSON in the response |
| Schema mismatch | valid JSON that fails the schema |

They also cover:

- config: the default model, explicit `GEMINI_API_KEY` only (`GOOGLE_API_KEY`
  and `OPENAI_API_KEY` are ignored), and thinking levels validated per model;
- the JSON Schema using only keywords Gemini documents;
- cache keys isolated by provider and config, with cached answers keeping the
  original provider, model and timestamp.

**E2E tests** run `next start`, pointed through the real SDK at
`tests/e2e/mock-gemini.mjs`. They show:

- the `Gemini · mock-gemini` badge appears only for accepted answers;
- safety, quota and empty responses give labelled fallbacks;
- invalid evidence is rejected;
- stale and rewind handling, double-click dedupe and autoplay all still work;
- the no-key server still serves the fallback.

**Harness dry run.** `verify:ai` and `verify:ai:smoke` were also run against
the mock through a scratch env file, to check the harness wiring:

- the env loader works;
- the run is labelled "CUSTOM ENDPOINT: not a real Gemini verification";
- the smoke test failed on the mock's generic answer, so the 9 remaining cases
  were **skipped**, as intended;
- the report fields are filled in.

Afterwards the dry-run reports were deleted. Mock rows can never be labelled
"genuine Gemini".

## Real Gemini verification: pending

Once `GEMINI_API_KEY` is in `.env.local`:

1. Run `npm run verify:ai:smoke`. This makes 2 real calls: one catch-up and
   one factual question.
2. If both are accepted, run `npm run verify:ai` once. It reruns the smoke
   test, then runs 8 more model cases, 1 no-call case and 1 deliberate
   timeout, spaced 4.5 s apart.
3. Run `npm run verify:ai:browser` once. It covers catch-up with an evidence
   click, an extras question, and an injury question.

Record the results here. If you see 429 `RESOURCE_EXHAUSTED`, check the
project's free-tier limits in Google AI Studio.

## Earlier history (OpenAI)

Before the migration, the OpenAI key was valid, but every generation request
returned 429 `insufficient_quota` / `credit_balance_exhausted`. That run
produced 0 / 9 accepted answers, all correctly labelled fallbacks. OpenAI is no
longer used: the SDK is uninstalled and `OPENAI_*` variables are ignored.

## Security and readiness checks

- **Browser bundles:** client bundles (`.next/static`) contain no
  `GEMINI_API_KEY`, `GEMINI_MODEL`, Gemini endpoint, `@google/genai` or
  `x-goog-api-key`. The SDK appears only in a server chunk, and
  `gemini.server.ts` starts with `import "server-only"`.
- **Public variables:** there are no `NEXT_PUBLIC_` variables.
- **Tracked files:** no `.env.local`, report or test-result files are tracked.
  `.env.local` is git-ignored.
- **Error details:** responses carry only a fallback reason code. Server logs
  carry the HTTP status, RPC status, reason and quota ID, never provider
  message bodies or keys.
- **Request validation:** malformed or oversized requests, and requests that
  name a model, token limit or "facts", are rejected (400/413) before any
  provider call.
- **Builds without credentials:** the build and all tests passed with no key
  present. The client is created lazily.

## Submission note

**168 words** (limit 200), counted with `wc -w` between the note markers. It is
enforced by `tests/unit/submission.test.ts`, which also checks that the note
names Gemini and no longer mentions OpenAI.
