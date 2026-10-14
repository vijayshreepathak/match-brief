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
| When | `OPENAI_API_KEY` set and the model's output passes every check | No key, provider error or timeout, invalid structured output, unknown or future evidence IDs, unverifiable numbers, a result stated too early, or rate limit |
| Label in UI | `AI · <model>` | `Rule-based fallback` plus the reason |
| Text | Model wording, constrained to supplied facts | Sentences assembled from calculated facts. The "why" card becomes "What the numbers say". |

How the AI path works (`src/lib/ai/`):

1. The browser sends only two checkpoint numbers (plus the question, for Q&A).
   The server validates them against the fixture and rejects anything out of
   range, reversed, or carrying extra fields such as a score.
2. `context.ts` builds the model's context from canonical data. Every
   calculated figure gets a stable fact ID (e.g. `F_RUNS_NEEDED`) and every
   delivery an event ID (`E1`…`E125`).
3. `openai.server.ts` calls the OpenAI **Responses API** through the official
   SDK (`responses.parse` + `zodTextFormat`) with a strict Zod schema,
   `store: false`, a 15 s timeout, 1 retry, and 1,500 max output tokens.
4. `guards.ts` rejects output that:
   - breaks the length limits,
   - cites missing or future evidence IDs,
   - uses numbers that appear nowhere in the supplied data,
   - states a result before the chase is over.
5. Only validated AI output is cached. Everything else becomes the labelled
   fallback.

These checks reduce errors. They don't guarantee correctness: a valid schema
and valid evidence IDs don't prove a sentence is true.

## Tests

```bash
npm run lint
npm run typecheck
npm test                 # 137 unit tests (Vitest)
npm run test:e2e         # production build + 15 Playwright tests
npm run verify:ai        # OPT-IN: real OpenAI calls, needs OPENAI_API_KEY in .env.local
```

- **Unit tests** cover:
  - Fixture checksum, validation, and final-score reconciliation with
    Cricsheet's recorded result.
  - Legal balls vs deliveries (wides, no-balls, the 9-delivery final over),
    balls faced, and bowler figures.
  - Target, runs needed, balls remaining, and run rates.
  - Interval boundaries; start, no-change, and completed-chase states.
  - Invalid checkpoints, request validation, and the route handlers.
  - Context leakage: no future deliveries, players, or result metadata.
  - The guards, fallback reasons, caching, in-flight dedupe, and rate
    limiting, all with a fake model.
  - The offline half of the [evaluation cases](evals/cases.ts).
- **E2E tests** run against `next start`, using a local mock of the Responses
  API (`tests/e2e/mock-openai.mjs`, wired in through the SDK's
  `OPENAI_BASE_URL`), plus a second server with no key. They cover evidence
  chips, double-click dedupe, keyboard use, stale labels, rewind clearing,
  auto-play making no AI calls, the end of the chase, provider errors, bad
  evidence, the no-key fallback, and mobile layout.
- **`npm run verify:ai`** runs the 10 evaluation cases against the real model.
  For each it checks the mode, answer status, expected facts, and forbidden
  claims, and writes a report to `reports/`. Without a key it fails with
  "real-API verification was NOT run".

**Verified status.** Lint, typecheck, unit, and e2e tests all pass locally.
**A real OpenAI response has not been verified yet**: no API key was available
while building. All AI-path tests use mocks. Run `npm run verify:ai` with a key
before relying on AI mode.

## Deploy to Vercel

1. Push this folder to a GitHub repository. If the repository root is the
   parent folder, set Vercel's **Root Directory** to `dream11-matchbrief`.
2. In Vercel, choose **Add New → Project**, import the repository, and keep
   the **Next.js** preset.
3. Under **Settings → Environment Variables** (Production), add:
   - `OPENAI_API_KEY` (your key)
   - `OPENAI_MODEL` = `gpt-5.4-mini`
   - `OPENAI_REASONING_EFFORT` = `low`

   `MATCHBRIEF_AI_RATE_LIMIT` is optional.
4. Deploy, then redeploy whenever you change environment variables.

   CLI alternative: `npx vercel`, `npx vercel env add OPENAI_API_KEY production`,
   then `npx vercel --prod`.
5. **Check public access.** Open the production URL in an incognito/private
   window, where you are not logged in to Vercel.
   - If you see a Vercel login page, turn off protection for production under
     **Settings → Deployment Protection**.
   - Press **Catch me up** and confirm the badge says `AI · gpt-5.4-mini`. If
     it says `Rule-based fallback`, the reason underneath tells you why.
   - Test from a phone as well.

### Usage and abuse controls for a public AI endpoint

The in-app cache and rate limiter are **process-local**. Each serverless
instance has its own copy, they reset on cold starts, and they are not durable
protection. Before sharing the link widely:

- Set a monthly budget and usage limits on the OpenAI project that owns the
  key, and use a dedicated key for this app.
- Add a Vercel Firewall / WAF rate-limit rule for `/api/catchup` and
  `/api/ask`.
- If the app gets real traffic, move rate limiting to a shared store (for
  example Redis), and consider bot protection.
- Watch Vercel function logs. They contain fallback reasons, never keys or
  provider error bodies.

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
data/cricsheet/          bundled match file, manifest (sha256), NOTICE (license + transformations)
src/lib/cricket/         pure normalization + scoreboard engine (no server, no AI)
src/lib/match/           server-only fixture loader; client-safe replay view
src/lib/ai/              context, prompts, schemas, guards, fallback, cache, OpenAI provider, service
src/app/api/             replay, catchup, ask route handlers
src/components/          the single-page UI
evals/cases.ts           evaluation cases (offline + live)
tests/                   unit, e2e (with mock Responses API), live
docs/                    DECISIONS, DEMO, SUBMISSION
```

## Data attribution

Ball-by-ball data from [Cricsheet](https://cricsheet.org/) (match `1298150`),
used under the
[Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/).
Provenance, checksum, and every transformation are documented in
[`data/cricsheet/NOTICE.md`](data/cricsheet/NOTICE.md).
