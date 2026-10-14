# Verification record

This record covers the OpenAI → Google Gemini migration and the real-Gemini
verification, both on 2026-10-15 (IST; report file names use UTC). Every
result below comes from a command that was actually run. Mocked tests and real
provider checks are reported separately.

## Overall status

| Requirement | Status |
| --- | --- |
| Lint, typecheck, unit tests, build, mocked e2e | **Pass** |
| Real Gemini catch-up | **Verified.** Genuine, accepted answers in the smoke and full runs, and in the browser. |
| Real Gemini Q&A | **Verified.** Factual, extras, completed-match and "not in data" answers were accepted. |
| Full real suite | **9 / 11 checks passed**. The two misses are listed below. |
| Public deployment | **Verified.** https://matchbrief.vercel.app/ (see "Live deployment check" below) |
| Submission | **Ready, with caveats** (9 / 11 full suite; check on your own phone) |

## UI refresh verification (branch `feat/matchbrief-ui-refresh`, 2026-10-15)

This is a presentation-only change, made after submission. The submitted
version is `main` at `6c0f1b9`, which is what production ran on 2026-10-15.
The changes:

- a new page layout;
- day/night themes;
- polished catch-up, question, evidence and fallback states.

There were no changes to cricket calculations, the Gemini provider, prompts,
guards, API routes or caching.

### Checks run on the final branch build

| Command | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **222 / 222** (unchanged) |
| `npm run test:e2e` (builds first) | **38 / 38**: the 23 existing tests with **no selector or assertion changes**, plus 15 new UI tests |
| `npm run verify:ai:browser` (real Gemini, run once on the new UI) | **pass**. Catch-up accepted (4.6 s), extras question accepted (5.6 s), and the injury question answered honestly ("does not contain information about player injuries"). |

The 15 new tests are in `tests/e2e/theme.spec.ts` and
`tests/e2e/ui-states.spec.ts`. They cover:

- **First visit:** the app follows the device setting, light or dark.
- **Toggle:** the first click switches the theme in both directions,
  including from a dark device default (system is not treated as light).
- **Persistence:** the choice survives a reload, is stored under `theme`, and
  native controls get `color-scheme: dark`.
- **No flash:** a stored night choice is already on `<html>` at
  `DOMContentLoaded`, before hydration.
- **No state loss:** switching keeps the replay position, the last-seen
  selection, a half-typed question, the recap and the paused state, and makes
  **zero `/api/*` requests**.
- **No unwanted calls or errors:** page load plus theme changes make zero
  AI requests and log no console or hydration errors.
- **Night mode:** catch-up, a question, and evidence chips that focus the
  correct item all work.
- **Phone widths:** there is no horizontal overflow at 390 px or 320 px in
  night mode with results open.
- **Loading and errors:**
  - the catch-up loading status, network error and "Try again" recovery;
  - the question error and Retry;
  - the "Checking the match data…" status;
  - the disabled Ask button and the character counter.
- **Replay states:** shown as *Paused*, *Playing replay* or *End of chase*.
  The page never says "live".

**Test fix during development:** the "checking" status test first reused a
question that another test had already cached, so the answer arrived
instantly. It now uses a unique question. No app behaviour changed.

### Visual inspection

Screenshots were taken from the production build with **mocked Gemini**
(`npm run screenshots`) and inspected at:

- 1366×768, day and night: first viewport, full page, recap and answer with
  evidence open, and the fallback state;
- 390×844, day and night: first viewport, full page, and populated;
- 1440×900, 768×1024 and 320×640, day and night.

**Issues found and fixed during inspection:**

- disabled primary buttons were a faded green, and now use a neutral disabled
  style;
- the phone header tagline wrapped onto three or four lines beside the
  controls, and now has its own row.

At 1366×768 the match summary, the whole replay toolbar (one row), **Catch me
up** and the question input are all visible without scrolling.

The curated before/after images are in `docs/screenshots/`. "Before" is the
submitted version at `6c0f1b9`.

### Colour contrast (computed, WCAG 2.x)

| | Day | Night |
| --- | --- | --- |
| Body text on page / surface | 16.3 / 17.9 | 16.2 / 14.9 |
| Secondary text, lowest pairing | 6.1 | 7.1 |
| Primary button text | 6.5 | 8.3 |
| Warning, danger and success text on their tints | 7.3 / 6.5 / 8.8 | 9.7 / 8.3 / 9.0 |
| Control borders (inputs, select, secondary buttons) | 3.7 | 3.8 |
| Focus ring | 4.2–4.6 | 7.3–7.9 |

All text pairings exceed 4.5:1. Control borders and the focus ring exceed
3:1. The first palette had 1.9:1 control borders, which were corrected before
building.

### Known limitations of the UI checks

- **No automated accessibility audit** (axe or Lighthouse) was run. The
  accessibility claims are limited to what was tested: names, roles, focus,
  contrast, keyboard use and overflow.
- **200% zoom** was approximated with narrow viewports (768 / 390 / 320 px),
  not tested with browser zoom.
- **Phones were emulated** with Playwright viewports, not real devices.
- **Dev mode:** next-themes documents a possible theme flash in Next.js dev
  mode. The no-flash check above is against the production build.
- **No AI improvements:** the earlier real-Gemini misses (9 / 11 in the full
  suite) are unchanged, and this redesign does not address them.

## Quality gates (mocked, no paid calls)

| Command | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **222 / 222 passed** |
| `npm run test:e2e` (runs `next build` first) | build OK, **23 / 23 passed** (Gemini mock, no-key server, mobile) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 5 high, all in one dev-only `braces` chain (see `docs/DECISIONS.md` §17) |

## Real Gemini runs

**Configuration:**

- Model: `gemini-3.5-flash-lite`.
- Thinking level: `minimal`.
- Endpoint: `generativelanguage.googleapis.com`.
- Key: read from `.env.local` and never printed.
- Every report has `realGemini: true`.

Each run was executed once. When a run failed, the cause was diagnosed and
fixed before anything was run again; no run was repeated in the hope of a
lucky pass.

| Run (report, UTC) | Command | Result | What happened |
| --- | --- | --- | --- |
| A `19-37-55` | `verify:ai:smoke` | 1 / 2 | Catch-up accepted (2.5 s). The required-rate question was **rejected**: Gemini wrote the number word "twelve". **Fix:** stronger words-only prompt with a numeric-question example (prompt version `2026-10-15.3`). |
| B `19-39-04` | `verify:ai:smoke` | **2 / 2** | Catch-up accepted (2.6 s, 5,862 in / 380 out tokens). Required-rate question accepted (1.3 s). |
| C `19-39-31` | `verify:ai` | smoke 1 / 2, rest skipped | The catch-up was **rejected** with "too many references in one point": Gemini cited more deliveries than the old cap of 8. The window contains 10 boundaries. **Fix:** caps raised to 8 facts / 16 deliveries per point; each one is still validated. The smoke gate correctly skipped the other 9 cases. |
| D `19-40-52` | `verify:ai` | **9 / 11** | See the table below. |
| Browser | `verify:ai:browser` | **pass** | Catch-up settled in 2.5 s with the `Gemini · gemini-3.5-flash-lite` badge, the correct as-of label, and an evidence chip that opened its item. The extras question was answered in 1.9 s with the F_EXTRAS fact line. The injury question returned "not available in the supplied match data". Screenshots: `reports/real-gemini-*.png` (not committed). |

### Run D in detail

| Case | Result | Latency | Tokens (in / out) | Outcome |
| --- | --- | --- | --- | --- |
| normal-catchup (smoke) | genuine Gemini, grounding accepted | 1.85 s | 5,862 / 301 | pass |
| chase-calculation (smoke) | genuine Gemini, accepted | 1.29 s | 6,943 / 77 | pass |
| wicket-heavy | **fallback**, `ungrounded_output` | 2.06 s | 5,375 / 428 | **fail**: Gemini wrote "four wickets". The guard rejected it and the fan saw a labelled fallback. |
| extras-question | genuine Gemini, accepted | 1.49 s | 7,630 / 141 | pass |
| completed-chase | genuine Gemini, accepted | 1.60 s | 8,326 / 60 | pass |
| unknown-injury | genuine Gemini, `not_in_data` | 1.13 s | 7,628 / 53 | pass |
| no-ball-cause | genuine Gemini, `not_in_data` | 1.11 s | 7,959 / 52 | pass |
| future-winner | genuine Gemini, but status `answered` | 1.20 s | 7,622 / 57 | **fail on status only**. The text was honest ("The result is not known at this checkpoint as the chase is still in progress."), but it was tagged `answered` instead of `declined` / `not_in_data`. |
| ignore-context-injection | genuine Gemini, `declined` | 1.08 s | 6,363 / 41 | pass |
| unchanged-checkpoint | no model call (`no_change`) | n/a | n/a | pass |
| deliberate timeout | fallback, `timeout` | n/a | n/a | pass |

**Latency** for accepted calls: catch-ups took about 1.9–2.6 s and questions
about 1.1–1.6 s. Gemini reported no thinking tokens at `minimal`.

**Normal-case fallbacks:** one catch-up in run D (number words) and one in run
C (reference cap, since fixed). Both were shown as "Rule-based fallback" with
a reason, never as Gemini.

### Change made after the live runs (not yet re-verified live)

The browser screenshot showed a real catch-up at 18.0 ov saying "as the batting
side **chased down** the target". That phrase hints at the result. The spoiler
guard now rejects "chased (the target) down" and "knocked off the runs/target"
while the chase is in progress. This change only makes acceptance stricter. It
has unit tests but has not been exercised by a further live run.

### Suggested follow-ups (not done)

- If number-word rejections stay frequent, try `GEMINI_THINKING_LEVEL=low`,
  then re-verify.
- Consider a deterministic rule that forces status `declined` for
  "who won / will win" questions before the chase ends.

## Live deployment check (2026-10-15)

You deployed the app on Vercel from `main` at `7a094dc`. I then checked it
from this machine, without any login:

| Check | Result |
| --- | --- |
| `GET https://matchbrief.vercel.app/` | HTTP 200, title "MatchBrief: catch up on a T20 chase", historical-replay label present, no Vercel login page |
| Phone width (Playwright, Pixel 7 emulation, fresh cookie-less context) | 0 px horizontal overflow, replay label visible, **Next ball** moved to delivery 111 |
| `POST /api/catchup` (10.0 → 18.0 ov) | HTTP 200, `mode: ai`, provider `Gemini`, model `gemini-3.5-flash-lite`, not cached, **10.0 s** |
| `POST /api/ask` "How many extras have been conceded?" | HTTP 200, `mode: ai`, status `answered`, fact line "Extras conceded by Pakistan (as of 18.0 ov): 5 (wides 4, …)", **6.5 s** |
| `GET /api/replay?seq=110&step=next-over` | HTTP 200, 19.0 ov · 144/4 |

**Latency:** live responses were slower than local ones (about 2 s). These were
the first requests to the deployment, so serverless start-up is a likely
cause, but that was not measured.

**Not checked here:**

- **A real phone:** the phone-width check used Pixel 7 emulation.
- **The Vercel Firewall rate-limit rule:** project settings are not visible
  from this machine.

## Earlier history (OpenAI)

Before the migration, the OpenAI key was valid, but every generation request
returned 429 `insufficient_quota`. That run produced 0 / 9 accepted answers,
all correctly labelled fallbacks. The OpenAI SDK has been removed, and
`OPENAI_*` variables are ignored.

## Security and readiness checks

- **Browser bundles:** no Gemini key, endpoint, SDK or `x-goog-api-key`
  appears in `.next/static`. The SDK is only in a server chunk, and
  `gemini.server.ts` is `server-only`.
- **Variables and tracked files:** there are no `NEXT_PUBLIC_` variables.
  `.env.local`, `reports/` and `test-results/` are git-ignored and not
  tracked.
- **What gets exposed:** responses carry only a fallback reason code. Logs
  carry status and quota IDs, never provider bodies or keys.
- **Request validation:** malformed or oversized requests, and requests that
  name a model or token limit, are rejected before any provider call.
- **Builds without a key:** the build and every mocked test pass with no key
  present.

## Submission note

The note is **168 words** (limit 200), enforced by
`tests/unit/submission.test.ts`.
