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

Requires Node.js 22 or newer.

```bash
cd dream11-matchbrief
npm install
cp .env.example .env.local      # then put your key in .env.local (optional)
npm run dev                     # http://localhost:3000
```

`.env.local` lives in the project root, next to `package.json`. It is
git-ignored. Without a key, the app works fully in labelled fallback mode.

Production build:

```bash
npm run build
npm start
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | For AI mode | Server-only. Without it, recaps and answers use the rule-based fallback. |
| `OPENAI_MODEL` | No | Defaults to `gpt-5.4-mini`. Any model with Responses API and Structured Outputs support. |
| `OPENAI_REASONING_EFFORT` | No | Only sent when set. `low` is the suggested value for `gpt-5.4-mini`. Leave empty for models without reasoning settings. |
| `MATCHBRIEF_AI_RATE_LIMIT` | No | AI calls per client IP per 10 minutes, per server instance. Default 30. |

The key is read only in `src/lib/ai/openai.server.ts`, a `server-only` module.
It never reaches browser code.

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
| When | `OPENAI_API_KEY` is set **and** the model's output passes every check | No key; provider error, quota/rate limit (HTTP 429) or timeout; refusal; incomplete or invalid structured output; unknown, future or mislabelled evidence; numbers written by the model; a result hinted before the chase ends; or the app's own rate limit |
| Label in UI | `AI · <model>`, plus "· cached" and the original generation time when served from cache | `Rule-based fallback` plus the specific reason |
| Words | Written by the model; no numbers allowed | Sentences built from calculated facts. The "why" card becomes "What the numbers say". |
| Numbers | Rendered by the server from the facts the model selected, each labelled with its checkpoint or interval | Built into the sentences from the same calculated facts |

Having credentials is not enough to get the AI badge. It is shown only for
model output that passed validation.

How the AI path works (`src/lib/ai/`):

1. **Validate the request.** The browser sends only two checkpoint numbers,
   plus the question for Q&A. The server validates them against the fixture
   and rejects anything out of range, reversed, or carrying extra fields: a
   score, a model, a token limit, or "facts".
2. **Build the context from canonical data** (`context.ts`).
   - Every calculated fact has an ID, a type, a **scope**, a value, and its
     supporting deliveries. The scope is the checkpoint or interval it
     describes: "as of 18.0 ov", "when you left, 10.0 ov", "10.0–18.0 ov", or
     the whole match.
   - Every delivery has an event ID (`E1`…`E125`) and its kinds (`six`,
     `wicket`, `wide`…).
3. **Call the model** (`openai.server.ts`) through the OpenAI **Responses
   API**, using the official SDK (`responses.parse` + `zodTextFormat`):
   - strict Zod schema;
   - `store: false`;
   - 15 s timeout, 1 retry, 1,500 max output tokens;
   - reasoning effort from `OPENAI_REASONING_EFFORT`;
   - no temperature.

   Refusals, incomplete output, timeouts, 429s and other API errors each map
   to their own fallback reason.
4. **What the model returns:** **words only** (a headline and short notes),
   plus structured references:
   - `fact_ids`, which select canonical facts;
   - `events: [{id, kind}]`, which point at deliveries.
5. **Check the output** (`guards.ts`). It is rejected if:
   - a fact ID is unknown;
   - a cited delivery is in the future, outside the catch-up window, or not
     what the model claims (e.g. a four cited as a "wicket");
   - "what to watch next" uses anything other than current facts;
   - the model's text contains any digit or number word;
   - it hints at the result before the chase ends, including spoilers with no
     numbers, such as "India eventually get over the line";
   - it is over-long.
6. **Render the numbers.** The server renders every number from the selected
   facts. So "31 off 12" cannot become "12 off 31", and an old equation cannot
   be shown as the current one.
7. **Cache only validated output.** Only validated AI output is cached, along
   with its model and generation time.

These checks remove whole classes of numerical and evidence errors. They do
**not** prove the model's free-text interpretation is right:

- An invented reason for a no-ball contains no numbers and no result claim, so
  the runtime checks cannot detect it. The live eval checks for it.
- The model may know this famous match's result from training data. The
  prompt and the spoiler check reduce, but cannot rule out, a leak.

## Tests

```bash
npm run lint
npm run typecheck
npm test                   # 200 unit tests (Vitest); no network, no key
npm run test:e2e           # production build + 21 Playwright tests (mock AI + no-key)
npm run verify:ai          # OPT-IN, REAL OpenAI: 9 model cases + 1 no-call case + 1 deliberate timeout
npm run verify:ai:browser  # OPT-IN, REAL OpenAI in the browser: catch-up + 2 questions
```

- **Unit tests** (`tests/unit/`) strip `OPENAI_API_KEY` and `OPENAI_BASE_URL`
  before running. They cover:
  - fixture checksum and validation;
  - reconciliation with the **published scorecard**: every batter, extras,
    fall of wickets, and bowling figures;
  - the final over, event by event;
  - legal balls vs deliveries, intervals, and checkpoints;
  - request validation and the route handlers;
  - context leakage;
  - grounding regressions: swapped numbers, wrong-kind events,
    wrong-checkpoint facts, `E82`-style IDs, numbers from future metadata,
    and number-free spoilers;
  - the OpenAI provider through the real SDK with a fake `fetch`: success,
    usage, refusal, incomplete output, malformed JSON, schema mismatch, and
    HTTP 429, 500, 401, 400 and timeout;
  - cache provenance, dedupe, and rate limiting;
  - the offline half of the [evaluation cases](evals/cases.ts);
  - the submission-note word count.
- **E2E tests** (`tests/e2e/`) run against `next start`, using a local mock of
  the Responses API (`tests/e2e/mock-openai.mjs`, connected through the SDK's
  `OPENAI_BASE_URL`), plus a second server with no key. Beyond the core flows,
  they cover:
  - rewinding or moving forward while a request is in flight;
  - refusal and incomplete-output labels;
  - cache provenance.
- **`npm run verify:ai`** loads `.env.local` with Node's own loader,
  independently of Next.js. It runs each case once through the production
  service and checks mode, status, expected facts, and forbidden claims. It
  records latency and token usage and writes
  `reports/ai-verification-*.json`. If `OPENAI_BASE_URL` is set to a custom
  endpoint, the run is labelled "not a real OpenAI verification".
- **`npm run verify:ai:browser`** builds the app, runs it with `.env.local`,
  checks the real AI badges in the UI, and saves screenshots to `reports/`.

**Verified status (2026-10-15).** Lint, typecheck, 200 unit tests, and 21 e2e
tests pass.

**Real AI is NOT verified.** The key in `.env.local` is valid and can see
`gpt-5.4-mini`, but every generation request returns HTTP 429
`insufficient_quota` (`credit_balance_exhausted`). As a result, every real
call fell back, and each fallback was correctly labelled. See
[`docs/VERIFICATION.md`](docs/VERIFICATION.md).

## Deploy to Vercel

1. **Set up OpenAI first.**
   - Create a **dedicated OpenAI project** for MatchBrief, with a **project
     API key**.
   - Add credit.
   - In the project's limits, set an **enforced monthly budget**. That's a
     hard cap on spend, not just an email alert at a threshold.
2. **Push** this folder to a **private** GitHub repository. If the repository
   root is the parent folder, set Vercel's **Root Directory** to
   `dream11-matchbrief`.
3. **Import the project.** In Vercel, choose **Add New → Project**, import the
   repository, and keep the **Next.js** preset. Node.js must be 22 or newer:
   the project setting defaults to a supported version, and `package.json`
   declares `>=22`.
4. **Add the environment variables** under **Settings → Environment
   Variables** (Production):
   - `OPENAI_API_KEY` (the project key)
   - `OPENAI_MODEL` = `gpt-5.4-mini`
   - `OPENAI_REASONING_EFFORT` = `low`

   `MATCHBRIEF_AI_RATE_LIMIT` is optional. Do **not** set `OPENAI_BASE_URL`.
5. **Deploy.** **Redeploy after any environment-variable change**: variables
   only apply to new deployments.

   CLI alternative: `npx vercel`, then `npx vercel env add OPENAI_API_KEY
   production`, then `npx vercel --prod`.
6. **Runtime.** The route handlers (`/api/replay`, `/api/catchup`, `/api/ask`)
   run on the default **Node.js** runtime. `/api/catchup` and `/api/ask` set
   `maxDuration = 30`. The fixture is **imported into the server bundle**
   (`src/lib/match/fixture.server.ts`), so it is always available on Vercel
   and is never a public file.
7. **Check public access.**
   - Open the production URL in an **incognito window** (not logged in to
     Vercel). If you get a Vercel login page, adjust **Settings → Deployment
     Protection** so the production domain is public.
   - Press **Catch me up** and confirm the badge says `AI · gpt-5.4-mini`. If
     it says `Rule-based fallback`, the reason is shown underneath.
   - Ask a question, then repeat on a phone.

### Usage and abuse controls for a public AI endpoint

The in-app cache (200 entries) and per-IP limiter (30 AI calls per 10 minutes
by default) are **process-local**. Each serverless instance has its own copy
and loses it on a cold start, so they are **not a distributed limit**. Before
sharing the link:

- **Vercel Firewall → Rate Limiting rule** on `POST` requests whose path is
  `/api/catchup` or `/api/ask`, e.g. 20 requests per minute per IP, with
  action deny (429). Leave `/api/replay` out: replay steps are cheap, and
  auto-play calls it every 1.2 s.
- **OpenAI project budget**, enforced as above, with the dedicated key only.
- **Vercel function logs** show fallback reasons such as
  `provider status 429 (insufficient_quota)`, never keys or provider error
  bodies.
- For real traffic, move rate limiting to a shared store (for example Redis)
  and consider bot protection.

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
src/lib/ai/              context, prompts, schemas, guards, fallback, cache, OpenAI provider, service
src/app/api/             replay, catchup, ask route handlers
src/components/          the single-page UI
evals/cases.ts           evaluation cases (offline + live)
tests/                   unit, e2e (mock Responses API), live + live-browser (real API, opt-in)
docs/                    DECISIONS, DEMO, SUBMISSION, VERIFICATION
```

## Data attribution

Ball-by-ball data from [Cricsheet](https://cricsheet.org/) (match `1298150`),
used under the
[Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/).
Provenance, checksum, and every transformation are documented in
[`data/cricsheet/NOTICE.md`](data/cricsheet/NOTICE.md).
