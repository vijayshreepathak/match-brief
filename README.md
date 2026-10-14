# MatchBrief

**Missed a few overs? Understand what changed.**

A cricket fan steps away during a T20 chase and comes back to a different
scoreboard. Scrolling a commentary feed to work out what happened takes longer
than the overs they missed. MatchBrief lets them say *"I last watched until the
end of over 10"* and get a short, evidence-linked explanation of what changed,
why it matters, and what to watch next. They can then ask questions about the
current moment.

> Independent assignment prototype for the Dream11 Forward Deployed Engineer
> Intern role. Not an official Dream11 product, and not affiliated with or
> endorsed by Dream11, the ICC, or either team.

## Core interaction

1. Open the replay. It starts at the end of over 18 of India's chase of 160
   against Pakistan (ICC Men's T20 World Cup 2022, MCG).
2. Move the replay with **Play/Pause**, **Next ball**, **Next over**,
   **Back 1 over**, or **Restart**.
3. Pick **"I last watched until…"** (defaults to the end of over 10).
4. Press **Catch me up**. The recap has three cards: *What changed*, *Why it
   matters* (marked as interpretation), and *What to watch next*.
5. Click any evidence chip to open the cited delivery or calculation. Expand
   the evidence panel to see every delivery in the window.
6. Ask a question, or pick a suggested one. Answers use only what has happened
   up to the replay position.

## Run it locally

You need Node.js 22 or newer.

```bash
cd dream11-matchbrief
npm install
cp .env.example .env.local      # then add GEMINI_API_KEY to .env.local (optional)
npm run dev                     # http://localhost:3000
```

`.env.local` sits in the project root, next to `package.json`, and git
ignores it. Without a key, the app still works fully in labelled fallback
mode.

For a production build:

```bash
npm run build
npm start
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For AI mode | Server-only. Create one in [Google AI Studio](https://aistudio.google.com/apikey). Without it, recaps and answers use the rule-based fallback. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite`: stable, supports structured output, and has a free tier. |
| `GEMINI_THINKING_LEVEL` | No | `minimal` \| `low` \| `medium` \| `high`. The level is sent only if the configured model documents support for it. Otherwise it's skipped, with a server warning. |
| `MATCHBRIEF_AI_RATE_LIMIT` | No | AI calls per client IP per 10 minutes, per server instance. Default 30. |

The key is read only by `src/lib/ai/gemini.server.ts`, a `server-only` module,
so it never reaches browser code. Don't give it a `NEXT_PUBLIC_` prefix.

The app reads **only `GEMINI_API_KEY`**. The SDK would otherwise prefer
`GOOGLE_API_KEY` if both were set, so MatchBrief passes the key explicitly and
switches Vertex AI off. `GEMINI_BASE_URL` is used only to point tests at a
local mock; leave it unset.

**Leftover OpenAI settings:** `OPENAI_*` variables from earlier versions are no
longer read, and the OpenAI SDK has been removed. Delete them from
`.env.local`.

## Historical replay vs a live feed

This is a **historical replay, not live data**, and the UI says so at the top.
The ball-by-ball data is a bundled Cricsheet file (see
[`data/cricsheet/NOTICE.md`](data/cricsheet/NOTICE.md)). "Live" here means
the replay position. At any position, the server sends the browser and the
model only deliveries up to that point, plus figures calculated from them. The
full file, including its result metadata, stays on the server.

## AI mode vs fallback mode

| | AI mode | Rule-based fallback |
| --- | --- | --- |
| When | `GEMINI_API_KEY` is set **and** Gemini's output passes every check | Any of the triggers listed below this table |
| Label in UI | `Gemini · <model>`. Served from cache, it adds "· cached" and the original generation time. | `Rule-based fallback`, plus the specific reason |
| Words | Written by Gemini, with no numbers allowed | Sentences built from calculated facts. The "why" card becomes "What the numbers say". |
| Numbers | Rendered by the server from the facts Gemini selected, each labelled with its checkpoint or interval | Built into the sentences from the same calculated facts |

The fallback is used when any of these happens:

- no key, or an invalid key;
- the model is unavailable;
- a per-minute rate limit, or exhausted quota or credit;
- a safety block;
- an empty, cut-off, malformed or off-schema response;
- evidence that is unknown, from the future, or mislabelled;
- numbers the model wrote itself;
- a result hinted at before the chase ends;
- a timeout or server error;
- the app's own rate limit.

Having a key is not enough to get the Gemini badge. It appears only for
output that passed validation.

How the AI path works (`src/lib/ai/`):

1. **Validate the request.** The browser sends only two checkpoint numbers,
   plus the question for Q&A. The server checks them against the fixture and
   rejects anything that is:
   - out of range;
   - reversed;
   - carrying extra fields: a score, a model, a token limit, or "facts".
2. **Build the context** (`context.ts`) from canonical data.
   - Every calculated fact has an ID, a type, a **scope**, a value and its
     supporting deliveries. The scope says when the fact applies: "as of
     18.0 ov", "when you left, 10.0 ov", "10.0–18.0 ov", or match-level.
   - Every delivery has an event ID (`E1`…`E125`) and its kinds (`six`,
     `wicket`, `wide`…).
3. **Call Gemini** (`gemini.server.ts`) using the official **`@google/genai`**
   SDK's `models.generateContent`. This API is stateless: nothing is stored
   server-side. The call uses:
   - `responseMimeType: "application/json"` and a `responseJsonSchema`
     generated from the Zod schemas (only keywords Gemini supports);
   - `systemInstruction` for the rules;
   - `maxOutputTokens: 1500`;
   - the thinking level, if the model supports it;
   - no tools, search or browsing.

   Timeouts and retries are bounded: the SDK's own retries are off. Each
   attempt gets 12 s within a 25 s overall budget, and there's **at most one
   retry**. A retry happens only for a per-minute 429 (honouring Gemini's
   `retryDelay` if it fits the budget), a 500/503 or a network error.
   - **Never retried:** a daily quota or exhausted credit, an invalid key or
     model, safety blocks, and parse failures.
   - **Error handling:** errors are classified from the HTTP status and
     Google's error details (`API_KEY_INVALID`, `QuotaFailure` IDs,
     `RetryInfo`), and never shown raw.
4. **Validate the shape.** The JSON is parsed and **re-validated with Zod**.
   The model writes **words only** (a headline and short notes), selects facts
   with `fact_ids`, and points at deliveries with `events: [{id, kind}]`.
5. **Run the guards** (`guards.ts`). The output is rejected if it has:
   - unknown fact IDs;
   - cited deliveries that are in the future, outside the catch-up window, or
     not what the model claims (e.g. a four cited as a "wicket");
   - a "what to watch next" that uses non-current facts;
   - any digit or number word in the model's text;
   - spoilers before the chase ends, including number-free ones like "India
     eventually get over the line";
   - over-long text.
6. **Render the numbers.** The server renders every number from the selected
   facts. So "31 off 12" cannot become "12 off 31", and an old equation
   cannot be shown as the current one.
7. **Cache validated answers only.** The provider, model and generation time
   are stored with each one. Cache keys include the provider, model, thinking
   level, prompt version, fixture version, both checkpoints, the operation and
   the question. A cached answer from another provider or configuration is
   therefore never served as new Gemini output.

These checks remove whole classes of numerical and evidence errors. They do
**not** prove that Gemini's free-text interpretation is right. For example, an
invented reason for a no-ball contains no numbers and no result claim, so the
runtime checks cannot detect it. Only the live eval checks for it.

Gemini may also know this famous match's result from training data. The
prompt and the spoiler check reduce the risk of that leaking, but cannot rule
it out.

## Tests

```bash
npm run lint
npm run typecheck
npm test                   # 221 unit tests (Vitest); no network, no key, no paid calls
npm run test:e2e           # production build + 23 Playwright tests (Gemini mock + no-key)
npm run verify:ai:smoke    # OPT-IN, REAL Gemini: 2 calls (one catch-up, one factual question)
npm run verify:ai          # OPT-IN, REAL Gemini: smoke first; the rest runs only if smoke passes
npm run verify:ai:browser  # OPT-IN, REAL Gemini in the browser: catch-up + 2 questions
```

### Unit tests (`tests/unit/`)

Before running, the unit tests remove `GEMINI_API_KEY`, `GEMINI_BASE_URL` and
`GOOGLE_API_KEY` from the environment. They cover:

- **Data and engine:**
  - fixture checksum and validation;
  - reconciliation with the **published scorecard**;
  - the final over, event by event;
  - legal balls vs deliveries;
  - intervals and checkpoints.
- **Requests and context:** request validation and route handlers, and context
  leakage.
- **Grounding regressions.**
- **The Gemini provider**, run through the real `@google/genai` SDK with an
  injected fake `fetch`. Cases:
  - request shape and parsing, including usage;
  - invalid key (400 and 401), prepay depleted (402), and missing or forbidden
    model (404, 403);
  - daily quota versus per-minute 429, with a single bounded retry that
    honours `retryDelay`;
  - 503 retried once, and a timeout;
  - a safety block, `MAX_TOKENS`, and an empty response;
  - malformed JSON and a schema mismatch.
- **Config and key isolation**, including thinking-level validation.
- **Schema compatibility:** the JSON Schema uses only keywords Gemini
  supports.
- **Caching:** caches are isolated by provider and config, and keep their
  provenance.
- **Evals and the note:** the offline half of the
  [evaluation cases](evals/cases.ts), and the submission-note word count.

### E2E tests (`tests/e2e/`)

E2E tests run `next start` against a local mock of Gemini's `generateContent`
endpoint (`tests/e2e/mock-gemini.mjs`, reached through the real SDK via
`GEMINI_BASE_URL`), plus a second server with no key. They cover:

- the badge reading `Gemini · <model>` only for accepted answers;
- safety, quota and empty-response fallbacks;
- cache provenance;
- rewinding or moving forward while a request is in flight.

### `npm run verify:ai`

The harness loads `.env.local` with Node's own loader, independently of
Next.js. It then runs the production service:

1. It runs the **2-case smoke test first**. If smoke fails, the remaining
   cases are skipped, so quota isn't spent.
2. Each case runs once, with real calls spaced 4.5 s apart for free-tier
   per-minute limits.
3. For each case it records:
   - result: genuine Gemini, fallback, or no model call;
   - grounding acceptance or rejection;
   - latency;
   - tokens (input, output and thinking);
   - the failure reason.
4. It writes `reports/ai-verification-*.json`.

A custom `GEMINI_BASE_URL` makes the report say "not a real Gemini
verification".

**Verified status:** see [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
Lint, typecheck, 221 unit tests and 23 e2e tests pass. **Real Gemini
generation is NOT verified yet**: `.env.local` had no `GEMINI_API_KEY` when the
migration was finished.

## Deploy to Vercel

1. **Prepare a Gemini key.**
   - In [Google AI Studio](https://aistudio.google.com/apikey), create an API
     key in a **dedicated Google Cloud project** for MatchBrief.
   - The free tier has per-minute and per-day limits, so it does not cover
     unlimited public use. If you enable billing on the project, also set a
     **budget** in Google Cloud Billing. A budget only alerts by default; you
     can add a hard cap by also limiting the project's API quotas.
   - Run `npm run verify:ai:smoke` locally first.
2. **Push** this folder to a **private** GitHub repository. If the repository
   root is the parent folder, set Vercel's **Root Directory** to
   `dream11-matchbrief`.
3. **Import the project.** In Vercel, choose **Add New → Project**, import the
   repository, and keep the **Next.js** preset. Node.js must be 22 or newer;
   `package.json` declares `>=22`.
4. **Set environment variables** under **Settings → Environment Variables**
   (Production):
   - `GEMINI_API_KEY` (required)
   - `GEMINI_MODEL` = `gemini-3.5-flash-lite`
   - `GEMINI_THINKING_LEVEL` = `minimal`
   - optional: `MATCHBRIEF_AI_RATE_LIMIT`

   **Do not set** `GEMINI_BASE_URL`, `GOOGLE_API_KEY` or any `OPENAI_*`
   variable.
5. **Deploy.** **Redeploy after any environment-variable change.**

   CLI alternative: run `npx vercel`, then
   `npx vercel env add GEMINI_API_KEY production`, then `npx vercel --prod`.
6. **Runtime.** The route handlers (`/api/replay`, `/api/catchup`, `/api/ask`)
   run on the default **Node.js** runtime. `/api/catchup` and `/api/ask` set
   `maxDuration = 30`. The fixture is **imported into the server bundle**, so
   it is always available and never a public file.
7. **Check public access.** This is the URL the reviewer will use.
   - Open the production URL in an **incognito window** and on a **phone**.
   - If you get a Vercel login page, adjust **Settings → Deployment
     Protection** so the production domain is public.
   - Press **Catch me up** and confirm `Gemini · gemini-3.5-flash-lite`.
   - Then ask a question.

### Usage and abuse controls for a public AI endpoint

The in-app cache (200 entries) and per-IP limiter (30 AI calls per 10 minutes
by default) are **process-local**. Each serverless instance has its own copy,
and they reset on cold starts, so they are **not a distributed limit**.

Gemini's free tier also caps requests per minute and per day for the whole
project. A shared link can exhaust it, and fans then see a labelled fallback.
Don't promise unlimited use.

- **Vercel Firewall → Rate Limiting rule** on `POST` requests to
  `/api/catchup` or `/api/ask` (e.g. 10 per minute per IP, then deny with
  429). Leave `/api/replay` alone: replay controls and auto-play must stay
  unthrottled.
- **Google Cloud:** use the dedicated project, check its quotas, and set a
  budget if billing is enabled.
- **Vercel function logs** show fallback reasons such as
  `HTTP 429 RESOURCE_EXHAUSTED GenerateRequestsPerDay…`. They never contain
  keys or provider message bodies.

## Integrating an authorized live feed later

The engine already works on a sequence of normalized deliveries, so a live
version would mostly change the data edges:

- Write a **feed adapter** that maps the licensed provider's ball events into
  the same `Delivery` shape. It must handle corrections and retractions, which
  historical data never has.
- **Store the event log** (append-only, versioned) instead of a bundled file.
  The newest ingested event becomes the viewing checkpoint. Cache keys then
  include the feed revision as well as the fixture version.
- **Push updates** to the browser (SSE or polling) instead of manual replay
  steps. AI calls stay user-triggered.
- **Implement the rules** this prototype deliberately rejects: DLS revisions,
  Super Overs, penalty runs, retirements, and abandoned matches.
- Move to **durable rate limiting and observability**, and handle feed
  latency and outages explicitly in the UI.
- Get **licensing and terms** for the live data, and keep the "as of" labels.

## Project layout

```
data/cricsheet/          match file, manifest (sha256, pinned mirrors), NOTICE (license, provenance, transforms)
src/lib/cricket/         pure normalization + scoreboard engine (no server, no AI)
src/lib/match/           server-only fixture loader; client-safe replay view
src/lib/ai/              context, prompts, schemas, guards, fallback, cache, Gemini provider, service
src/app/api/             replay, catchup, ask route handlers
src/components/          the single-page UI
evals/cases.ts           evaluation cases (offline + live)
tests/                   unit, e2e (Gemini mock), live + live-browser (real Gemini, opt-in)
docs/                    DECISIONS, DEMO, SUBMISSION, VERIFICATION
```

## Data attribution

Ball-by-ball data from [Cricsheet](https://cricsheet.org/) (match `1298150`),
used under the
[Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/).
Provenance, checksum, and every transformation are documented in
[`data/cricsheet/NOTICE.md`](data/cricsheet/NOTICE.md).
