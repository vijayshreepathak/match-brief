# Verification record

Pre-submission audit, 2026-10-14/15 (IST). Everything below was actually run.
Mocked tests and real-API checks are reported separately.

## Overall status

| Requirement | Status |
| --- | --- |
| Lint, typecheck, unit, build, mocked e2e | **Pass** |
| Real AI catch-up and Q&A through the app | **NOT VERIFIED.** The OpenAI account has no credit (HTTP 429 `insufficient_quota`). |
| Public deployment | **NOT DONE.** Needs your authorization and a working AI account. |
| Submission | **Not ready**, for the two reasons above |

## Baseline, before any changes

| Command | Result |
| --- | --- |
| `npm run lint` | pass (exit 0) |
| `npm run typecheck` | pass |
| `npm test` | 137 / 137 passed |

## Final run, after the fixes

| Command | Result |
| --- | --- |
| `npm run lint` | pass (exit 0) |
| `npm run typecheck` | pass |
| `npm test` | **200 / 200 passed**, 10 files, no network, secrets stripped |
| `npm run test:e2e` (includes `next build`) | build OK; **21 / 21 passed** (18 desktop with mock AI, 2 no-key, 1 mobile) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 5 high, all one dev-only chain (see "Dependencies" below) |
| `npm run verify:ai` (real OpenAI) | run once: **0 / 9 model-backed cases accepted as AI**. All 9 were 429 fallbacks. 1 / 1 no-call case and 1 / 1 deliberate timeout passed. |
| `npm run verify:ai:browser` (real OpenAI) | run once: **failed as expected**. The UI showed "Rule-based fallback" and the quota reason. |

`npm run build` was not run separately, because `test:e2e` runs `next build`
first.

## Real-AI verification (separate from the mocked tests)

**Environment:**

- The key was read from `.env.local` (git-ignored) and never printed.
- `OPENAI_MODEL=gpt-5.4-mini` and `OPENAI_REASONING_EFFORT=low`.
- The endpoint was `api.openai.com`.

**Diagnosis.** One model lookup plus one tiny request, printing only the
status and error code:

- `models.retrieve("gpt-5.4-mini")`: **OK**. The key is valid and the model
  is accessible.
- `responses.create(...)` with the app's parameters returned **HTTP 429**,
  `type: insufficient_quota`, `code: credit_balance_exhausted`.

**`npm run verify:ai`** ran once, with no reruns. The report is
`reports/ai-verification-2026-10-14T18-41-30-012Z.json`, labelled
`realOpenAI: true`.

| Category | Case | Mode / reason | Latency* | Result |
| --- | --- | --- | --- | --- |
| ai_required | normal-catchup | fallback / provider_rate_limited | 3145 ms | FAIL |
| ai_required | wicket-heavy | fallback / provider_rate_limited | 2869 ms | FAIL |
| ai_required | extras-question | fallback / provider_rate_limited | 2808 ms | FAIL |
| ai_required | chase-calculation | fallback / provider_rate_limited | 2530 ms | FAIL |
| ai_required | completed-chase | fallback / provider_rate_limited | 2809 ms | FAIL |
| honest_refusal | unknown-injury | fallback / provider_rate_limited | 2398 ms | FAIL |
| honest_refusal | no-ball-cause | fallback / provider_rate_limited | 2448 ms | FAIL |
| honest_refusal | future-winner | fallback / provider_rate_limited | 2893 ms | FAIL |
| honest_refusal | ignore-context-injection | fallback / provider_rate_limited | 2188 ms | FAIL |
| no_model_call | unchanged-checkpoint | no_change, no model call | n/a | PASS |
| deliberate_fallback | provider timeout (1 ms limit) | fallback / timeout | n/a | PASS |

\* These latencies measure rejected requests, including the SDK's one retry.
They are **not** representative of normal AI latency. No token usage was
recorded, because the provider rejected every request.

**`npm run verify:ai:browser`** ran once against the fresh production build:

- The catch-up settled in 2,976 ms as **"Rule-based fallback — The AI provider
  refused the request: rate limit reached or account quota used up."**
  Screenshot: `reports/real-ai-catchup.png`.
- The test then stopped at its first assertion ("not a fallback"), so the
  question steps were not reached in that run.

**What this does prove:** with real credentials, the app does not show an AI
badge for a failed provider call. It shows a labelled fallback with the
specific reason.

**What it does not prove:** that `gpt-5.4-mini` produces accepted output under
the new schema and guards, or how fast it is. Both remain **unverified** until
the account has credit and `verify:ai` passes.

There was also an earlier, accidental run of the browser check against the
stale pre-audit build. It showed the same failure under the old generic label
("The AI provider returned an error."). That run led to the clearer
`provider_rate_limited` reason.

## Defects found and fixed in this audit

1. **Numeric grounding was too weak** (confirmed). A number counted as
   "grounded" if it appeared anywhere in the context. That allowed:
   - swapped values ("12 runs from 31 balls");
   - values from the wrong checkpoint ("need 115 off 60" presented as now);
   - numbers taken from the fan's question.

   **Fix:** the model now writes words only. It selects typed, checkpoint-scoped
   facts by ID, and the server renders every number. Regression tests are in
   `tests/unit/guards.test.ts`.
2. **A valid event ID could support an unrelated claim** (confirmed). **Fix:**
   structured `{id, kind}` delivery claims are checked against the actual
   delivery. Deliveries cited under "what changed" must be inside the window.
3. **Number-free spoilers passed the result guard** (confirmed). Any
   "not"/"don't" exempted a sentence, so "Don't worry, India eventually get over
   the line" passed. **Fix:** a wider spoiler pattern list. Only explicit
   "result unknown" statements are exempt, and the check switches off after the
   chase ends.
4. **Refusal and incomplete output were not distinguished** (both were
   reported as "invalid output"), and **429 quota errors showed a generic
   provider error**. **Fix:** explicit `model_refusal`, `incomplete_output` and
   `provider_rate_limited` reasons, tested through the real SDK with a fake
   `fetch`.
5. **Cached answers had no visible provenance.** **Fix:** responses carry
   `generatedAt`, and the UI shows "· cached" with the original generation
   time.
6. **`verify:ai` reported only pass/fail per case.** It had no categories, and
   no latency or token data. **Fix:**
   - categories (`ai_required` / `honest_refusal` / `no_model_call` /
     deliberate timeout);
   - latency and token usage per call;
   - endpoint labelling (a custom endpoint is never reported as real);
   - a separate real-browser check (`verify:ai:browser`).
7. **Unit tests could inherit a real key from the shell.** **Fix:** a setup
   file strips `OPENAI_API_KEY` and `OPENAI_BASE_URL`.
8. **Provenance wording overstated authenticity.** **Fix:** NOTICE and
   manifest now pin all five mirror commits, give the full SHA-256 and git
   blob SHA, and say that matching copies show consistency, not official
   authenticity.

## Added regression coverage, for behaviour that was already correct

- **Final over, event by event:** runs needed and legal balls left after each
  of E116–E125. Covers the no-ball (6 + 1), the wides that don't use a legal
  ball, the 3 byes credited to extras rather than the batter, and both
  dismissals.
- **Reconciliation with a published scorecard:**
  - every India batter's runs, balls, 4s and 6s;
  - extras `b 3, lb 1, w 6, nb 1 = 11`;
  - all six fall-of-wicket scores and balls;
  - all five bowling figures.

  Source: TV9 Bangla scorecard, corroborated by Wisden's listing. Everything
  matched.
- First delivery; zero penalty treated as no penalty; ordinary extras
  accepted.
- E2E:
  - rewinding while a catch-up is in flight (discarded);
  - moving forward while one is in flight (keeps its as-of label and original
    evidence window);
  - refusal and incomplete labels;
  - server-rendered fact lines;
  - cached provenance.
- Routes: the browser cannot choose the model, the token limit, or the facts.
- The submission-note word count is checked by a test.

## Security and readiness checks performed

- **Key exposure:** the key value appears in no file other than `.env.local`.
  That covers `.next/`, `reports/`, `test-results/`, sources and docs. It has 0
  occurrences in git history, and `.env.local` is git-ignored.
- **Client bundles:** no reference to `OPENAI_API_KEY` or `OPENAI_MODEL` in
  `.next/static`. The OpenAI module is `server-only`.
- **Responses and logs:** responses carry only a fallback reason code. Logs
  carry the HTTP status and OpenAI error code, never bodies or keys.
- **Malformed requests:** these fail validation (400 or 413) before any
  provider call. Out-of-range or reversed checkpoints are rejected before the
  model is called.
- **Runtime:** the route handlers use the Node.js runtime, and the fixture is
  bundled into server code, so there is no file-system dependency on Vercel.

## Dependencies

- **Advisory:** GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 (high), `braces <= 3.0.3`,
  **no patched version published**.
- **Path:** `eslint-config-next@16.4.0` → `@next/eslint-plugin-next@16.4.0` →
  `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.
- **Exposure:** dev and lint-time only. It is not in the runtime bundle.
- **No safe fix was applied.** npm's fix is an incompatible major downgrade,
  and there is nothing to override to.
- **Mitigation:** see `docs/DECISIONS.md` §17.

## Deployment checks

- **Performed:** none. Deploying, pushing, and changing billing need your
  authorization.
- **Prepared locally:**
  - the README deploy steps, using the actual route paths;
  - the Vercel firewall rule targeting `POST /api/catchup` and `/api/ask` only;
  - an enforced OpenAI project budget;
  - the incognito public-access check.

## Submission note

- **Word count:** **170 words** (limit 200), counted with `wc -w` on the text
  between the note markers. `tests/unit/submission.test.ts` enforces it.
- **Deployed URL:** placeholder only. No deployment exists.
