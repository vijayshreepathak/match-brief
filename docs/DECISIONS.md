# Decisions

Short records of the choices that shaped MatchBrief, and why.

## 1. One match: India v Pakistan, T20 World Cup 2022 (Cricsheet 1298150)

- **Why this match:** It's an ordinary chase of 160 with no DLS, Super Over,
  or penalty runs. It still has the edge cases a cricket engine must get
  right:
  - a 3-run wide;
  - a final over of 9 deliveries for 6 legal balls, including a no-ball hit
    for six, two wides, 3 byes off a legal ball, and a stumping;
  - a run out;
  - a wicket-heavy start (31/4).

  An Indian fan audience will also recognise it.
- **Trade-off:** The model may remember this famous result from training data
  and leak it before the replay reaches the end. Mitigations:
  - the prompt forbids it;
  - a guard rejects result statements and hints while the chase is in progress;
  - the model cannot write numbers at all (so not Kohli's final 82);
  - eval cases `future-winner` and `ignore-context-injection` test it.

  A less famous match would lower this risk, but the leak would be harder to
  notice in a demo.

## 2. How the data was obtained

`cricsheet.org` returned a JavaScript browser-verification page to every
scripted download, on 2026-10-14 and again on 2026-10-15. I did not try to get
around it. The file is a copy of Cricsheet's `1298150.json` as redistributed
in five public GitHub repositories (allowed under ODC-By). All five copies have
the same git blob SHA as the bundled file at pinned commits, which are listed
in `data/cricsheet/NOTICE.md` and `manifest.json`.

- **What that shows:** the copies are *consistent* with each other. It is not
  proof of official authenticity.
- **Independent cross-check:** the calculated scorecard matches a published
  scorecard ball for ball. The checks cover batting, extras, fall of wickets
  and bowling (test: "reconciliation with the published scorecard").
- **Checksum:** a test checks the SHA-256 recorded in `manifest.json`.
- **Replacing the file:** `npm run data:import` swaps in a browser download
  from Cricsheet and records whether it matches the mirror copy.

The license wording ("Match data is licensed for use under the Open Data
Commons Attribution License") comes from Cricsheet's own download README. The
`/licensing` page sits behind the same browser check.

## 3. Checkpoint = sequential delivery index

Checkpoint `N` means "after delivery N" (0 = start, 125 = final ball). Every
delivery has a unique ID `E{N}`, separate from its over label. Wides and
no-balls share a ball label with the next delivery: `E120`, `E121` and `E122`
are all "19.4". Overs text is always derived from **legal balls**
(`104 → "17.2"`) and never parsed as a decimal.

## 4. The server decides where navigation lands

The browser sends `seq` + `step` (`next-ball`, `next-over`, `prev-over`,
`start`), and the server returns the new view. That way the browser never
learns where future overs end, how many deliveries are left, or anything else
about the future. `canAdvance` is safe to send because it can be derived from
the past alone.

## 5. Fixture stays server-side

The JSON is imported only in `fixture.server.ts`, which uses `import
"server-only"`, so it is bundled into server code only. Normalization never
copies `outcome`, `player_of_match`, or `toss`. A post-build scan confirmed the
client chunks and prerendered page contain no later players or result
metadata. Tests repeat this check on views and contexts.

## 6. Code calculates; the model explains

Scores, run rates, equations, batting and bowling figures, partnerships, and
interval aggregates are all computed in `src/lib/cricket/engine.ts`. The model
receives them as facts with stable IDs and derivations (e.g.
`"31 (160 - 129)"`) and is told to copy numbers, not compute them.

## 7. What the model sees

- **Catch-up:** facts as of the viewing checkpoint, interval facts, and the
  deliveries in the window.
- **Questions:** facts plus every delivery so far, so "who hit the first six?"
  can be answered.

Neither includes first-innings ball-by-ball data, only its total.

## 8. The model writes words; the server renders every number

The first version let the model write numbers. It accepted a number if that
value appeared anywhere in the context. A pre-submission audit showed this was
too weak:

- "31 needed off 12" could become "12 off 31", because both numbers exist.
- "need 115 off 60" (true when the fan left) could be presented as the current
  equation.
- A number the fan typed in the question was accepted.
- A real delivery ID could support an unrelated claim, such as a four cited as
  a wicket.

**Current design (smallest change that fixes these):**

- **Typed, scoped facts.** Every fact has an ID, a type, a scope (now / when
  you left / the window / the match), a label, a canonical value and its
  supporting deliveries. The equation fact labels each half with its own
  checkpoint.
- **Words-only model output.**
  - The model returns a headline and short **notes**, written in words.
  - It selects facts by `fact_ids`.
  - It references deliveries as `events: [{id, kind}]`, where `kind` is one of
    wicket, six, four, wide, no_ball, bye, leg_bye, runs or dot.
- **Guards reject:**
  - unknown facts;
  - deliveries that are future, outside the catch-up window ("what changed"
    only), or not of the claimed kind;
  - "what to watch next" built on non-current facts;
  - any digit or number word in model text. "Four" and "six" are allowed as
    boundary names, but not as counts ("six balls"); "T20" is allowed;
  - spoilers before the chase ends;
  - over-long output.
- **The server renders fact statements.** For example, "Runs needed (as of
  18.0 ov): 31 (160 - 129)". These statements are the only source of numbers
  in AI responses.
- **Spoiler check.** Patterns such as "won", "eventually", "over the line",
  "go on to win", "seal" and "clinch" are caught. A sentence is exempt only if
  it states the result is unknown ("not known", "can't predict"), not merely
  because it contains a negation. So "Don't worry, India eventually get over
  the line" is rejected. The check switches off once the chase is complete.
- **The AI is still useful.** It decides which facts and deliveries matter,
  writes the headline and the interpretation, and answers questions in plain
  words. It doesn't become canned text.
- **Known gap.** Free-text claims with no numbers and no result language can't
  be verified this way. Example: an invented reason for a no-ball. The prompt
  and the live eval's forbidden-claim patterns are the only defence. The
  offline test suite records this gap explicitly (`KNOWN_GUARD_GAPS`).
- **Any failure means a labelled fallback,** never a silent pass-through.

## 9. The fallback is honest and useful

The fallback text is built only from calculated facts, and the "why" card
becomes "What the numbers say (Calculated)". The question fallback:

- answers "not in the match data" for injuries, conditions, intentions, and
  umpiring reasons;
- declines result predictions while the chase is in progress;
- otherwise returns the calculated facts closest to the question.

`lastSeen == viewing` short-circuits to "Nothing new since you left" without a
model call.

## 10. Two checkpoints in the browser, with stale handling

The browser tracks the last-seen and viewing checkpoints separately. Every
request and response carries its `asOf`.

- **Advancing** keeps earlier recaps and answers, with an explicit "The replay
  has moved on… it describes 18.0 ov, not the current score" notice.
- **Rewinding or restarting** aborts in-flight requests and clears recaps and
  answers, because they may describe deliveries the fan hasn't reached.
- **A response whose `asOf` is later than the current view** is discarded.
- **Superseded recap requests** are ignored.
- **Nothing is persisted.**

## 11. Cost controls

- **Cache:** an LRU of 200 entries holding validated AI output only. The key
  includes the fixture version, prompt version, provider/model/thinking-level
  `configKey`, operation, both checkpoints, and the normalized question.
- **In-flight dedupe:** identical concurrent requests share one provider call.
- **Rate limiter:** per IP, fixed window. It's process-local and documented as
  non-durable; the README lists the deployment-level controls still needed.
- **Provider call limits:** 12 s per attempt within a 25 s budget, at most one
  retry (transient errors only), 1,500 max output tokens, minimal thinking, and
  the stateless `generateContent` API.
- **Request limits:** body limit of 4 KB, questions up to 280 characters.

## 12. Model settings (Gemini)

**Model.** The default is `gemini-3.5-flash-lite`. Its model page (checked
2026-10-15) lists it as **stable**, with structured outputs and thinking. The
pricing page lists a **free tier** for input and output. That tier's data
"Used to improve our products" is "Yes", so fan questions sent on the free
tier may be used by Google.

**Thinking.** The thinking docs list `minimal`, `low`, `medium` and `high` for
this model, with `minimal` as the default. `GEMINI_THINKING_LEVEL` is sent only
if the configured model documents that level. The app keeps a small table taken
from those docs. For an unlisted model, or an unsupported level, nothing is
sent and the server logs a single warning.

**API and settings.**

- **API:** the official `@google/genai` SDK, `models.generateContent`. The
  current docs also show the newer Interactions API. `generateContent` is still
  a documented API-reference method, and it is stateless, so nothing is stored
  server-side.
- **Structured output:** `responseMimeType: "application/json"` plus a
  `responseJsonSchema` generated from the Zod schemas, with `$schema` removed.
  A test checks that only documented keywords are used. The output is
  re-validated with Zod.
- **Not sent:** temperature and tools. Answers must come only from the bundled
  match context.

## 13. Testing without a test mode in app code

**E2E.** E2E tests run the production build against a small mock of Gemini's
REST `generateContent` endpoint, reached through the real SDK by setting the
server-only `GEMINI_BASE_URL`. That exercises the real SDK request and parsing
path. Special phrases in the question trigger errors, safety blocks, quota
errors, empty or slow replies, and bad evidence.

**No-key path.** A second server runs with a whitespace key to cover the
no-key path. Whitespace is used because empty environment values can be
dropped on Windows.

**Unit tests.** These inject a fake `fetch` into the real SDK
(`httpOptions.fetch`).

**Real-model checks.** These are separate, opt-in commands.

## 14. Scaffold choices

- **Scaffold:** `create-next-app@16.4.0` (React 19.3, TypeScript 5.9,
  Tailwind 4, ESLint 9).
- **Turned off:** the template's experimental `cacheComponents` and
  `partialPrefetching`, to keep standard, explainable caching.
- **Removed:** Google Fonts, so builds don't depend on the network.
- **Upgraded:** `@types/node` to 22 (Vitest 5 needs it), and `engines.node` is
  `>=22`.

## 15. Deliberately not built

- **Product features:** live feeds, accounts, a database, chat history,
  multiple matches, win probabilities, betting or fantasy features, and
  theming.
- **AI infrastructure:** vector search/RAG, agents, and MCP.
- **Cricket rules:** DLS, Super Overs, penalty runs, and retirements. The
  normalizer rejects matches that need them.

## 16. Each provider failure gets its own explicit, honest label

**How errors are read.** Gemini errors don't mean the same thing as OpenAI's.
The SDK raises `ApiError`, carrying the HTTP status, with Google's error JSON
in the message. MatchBrief parses that JSON privately to get the RPC status,
`ErrorInfo.reason`, `QuotaFailure` quota IDs and `RetryInfo.retryDelay`. It
never shows the raw text.

| Situation | Fallback reason | Retried? |
| --- | --- | --- |
| No `GEMINI_API_KEY` | `missing_config` | no call made |
| 401, or 400 with `API_KEY_INVALID` | `invalid_api_key` | no |
| 402 (prepay depleted), or billing problems | `quota_exhausted` | no |
| 429 with a per-day quota ID (incl. a free tier with no quota) | `quota_exhausted` | no |
| 429 per-minute rate limit | `provider_rate_limited` | once, after `retryDelay`, only if it fits the 25 s budget |
| 403 / 404 | `model_unavailable` | no |
| `promptFeedback.blockReason`, or finish reason SAFETY / RECITATION / … | `safety_blocked` | no |
| finish reason `MAX_TOKENS` | `incomplete_output` | no |
| no candidates or empty text | `empty_response` | no |
| text that is not JSON | `malformed_json` | no |
| JSON that fails the Zod schema | `invalid_output` | no |
| fails the grounding guards | `invalid_evidence` / `ungrounded_output` | no |
| our 12 s abort, or 504 | `timeout` | no |
| 500 / 503 / network error | `provider_error` | once |

**Retry limits.** The SDK's built-in retries (5 attempts by default, with
delays up to 60 s) are switched off. The request never makes more than two
attempts, and nothing switches models silently.

**Logs.** Server logs record a label such as `HTTP 429 RESOURCE_EXHAUSTED
GenerateRequestsPerDay…`, never a provider message body or the key.

**Cache provenance.** A cached AI answer keeps its provider, model and original
generation time, and the UI shows "· cached" with that time. Cache keys include
the provider/model/thinking-level `configKey`, the prompt and fixture versions,
both checkpoints, the operation and the question. So a cached answer can't
describe a different moment, or pass as output from another provider or
configuration.

## 17. Known dependency finding, with no safe fix

`npm audit` reports GHSA-vfj7-8cjw-p6xm (CVE-2026-93687, high): `braces` stack
exhaustion on deeply nested patterns. It affects `<= 3.0.3`, and **no patched
version exists** (3.0.3 is the latest).

- **Path:** `eslint-config-next` → `@next/eslint-plugin-next@16.4.0` →
  `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`. That's dev-only:
  `npm audit --omit=dev` reports 0. Next's own compiled `glob` and `picomatch`
  don't include `braces`.
- **npm's suggested fix** is downgrading `eslint-config-next` to 14.2.35, an
  incompatible major version. `@next/eslint-plugin-next@16.4.1` pins the same
  `fast-glob`. An override can't help, because no fixed `braces` exists.
- **Exposure:** only while running `npm run lint`, on glob patterns from the
  project's own config. Not reachable from the deployed app or user input. It
  is still a real advisory, not "no risk".
- **Mitigation:**
  - lint only trusted code;
  - keep CI job timeouts;
  - re-run `npm audit` and upgrade `eslint-config-next` when a release drops
    the vulnerable chain or `braces` ships a fix.

## 18. Migration from OpenAI to Google Gemini (2026-10-15)

**Why we switched.** OpenAI was blocked: the account had no credit (HTTP 429
`insufficient_quota`). Gemini is now the **only** runtime AI provider.

**What changed (deliberately narrow):**

- One provider adapter (`src/lib/ai/gemini.server.ts`) replaces
  `openai.server.ts` behind the existing `StructuredModel` contract.
- That contract now also carries `provider` and a cache `configKey`.
- **Unchanged:**
  - routes and request/response shapes; responses only gained a `provider`
    field;
  - context building, fact scoping, guards, fallback text, caching and dedupe;
  - all cricket data and scoring.
- **Dependencies:** `openai` was uninstalled after confirming that no runtime
  or test code imports it. `@google/genai` 2.29.1 was added. The deprecated
  `@google/generative-ai` and OpenAI-compatibility adapters were not used.

**Configuration.**

- **Variables:** `GEMINI_API_KEY`, `GEMINI_MODEL` (default
  `gemini-3.5-flash-lite`), `GEMINI_THINKING_LEVEL` (default suggestion
  `minimal`) and `MATCHBRIEF_AI_RATE_LIMIT`.
- **Key selection is explicit.** `GOOGLE_API_KEY`, Vertex flags and
  `OPENAI_*` are ignored, so another credential can't be picked up by
  accident.

**Verification is opt-in and quota-aware:**

- `verify:ai:smoke` makes 2 calls.
- `verify:ai` runs the smoke test first and runs the rest only if it passes.
- Real calls are spaced 4.5 s apart.
- Results from a mock endpoint are never labelled "genuine Gemini".
