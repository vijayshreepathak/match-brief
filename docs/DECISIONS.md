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
  - a guard rejects result statements while the chase is in progress;
  - a numeric guard rejects numbers (like Kohli's final 82) that aren't in the
    supplied data;
  - eval cases `future-winner` and `ignore-context-injection` test it.

  A less famous match would lower this risk, but the leak would be harder to
  notice in a demo.

## 2. How the data was obtained

On 2026-10-14, `cricsheet.org` returned a JavaScript browser-verification page
to every scripted download. I did not try to get around it. The unmodified
file came from five independent public GitHub repositories that redistribute
Cricsheet data (allowed under ODC-By). All five copies were byte-identical, and
the SHA-256 is recorded in `data/cricsheet/manifest.json` and checked by a
test. `npm run data:import` swaps in a copy downloaded from Cricsheet in a
browser.

The license wording ("Match data is licensed for use under the Open Data
Commons Attribution License") was confirmed from Cricsheet's own download
README. The `/licensing` page sits behind the same browser check.

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

## 8. Structured output, then deterministic guards

- **Model-facing Zod schemas** stay simple (no length keywords), so they
  convert cleanly to strict JSON Schema. A test checks this.
- **Guards run after parsing:**
  - word limits;
  - at least one evidence ID per claim;
  - every ID must exist in this checkpoint's context;
  - every number must appear in the context or the question (small counts
    0–20 are allowed);
  - no result statements before the chase ends. Negated sentences such as "it
    is not known who won" are allowed; "no-ball" doesn't count as a negation.
- **Any failure means a labelled fallback**, never a silent pass-through.

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
  includes the fixture version, prompt version, model, reasoning effort,
  operation, both checkpoints, and the normalized question.
- **In-flight dedupe:** identical concurrent requests share one provider call.
- **Rate limiter:** per IP, fixed window. It's process-local and documented as
  non-durable; the README lists the deployment-level controls still needed.
- **Provider call limits:** 15 s timeout, 1 retry, 1,500 max output tokens,
  `store: false`.
- **Request limits:** body limit of 4 KB, questions up to 280 characters.

## 12. Model settings

The default model is `gpt-5.4-mini`. Its model page lists the Responses API and
Structured Outputs, and reasoning effort `none` (default) / `low` / `medium` /
`high` / `xhigh`.

- **Reasoning effort** is sent only when `OPENAI_REASONING_EFFORT` is set
  (`.env.example` suggests `low`), so other models still work.
- **Temperature isn't sent:** the model page doesn't confirm it's supported.

## 13. Testing without a test mode in app code

E2E runs the production build against a small mock of the Responses API,
connected through the SDK's standard `OPENAI_BASE_URL`. The real SDK request
and parsing path is exercised, and special phrases in the question trigger
errors, bad evidence, or slow replies. A second server runs with a whitespace
key to test the no-key path; whitespace is used because empty environment
values can be dropped on Windows. Real-model checks are a separate, opt-in
command.

## 14. Scaffold choices

- **Scaffold:** `create-next-app@16.4.0` (React 19.3, TypeScript 5.9,
  Tailwind 4, ESLint 9).
- **Turned off:** the template's experimental `cacheComponents` and
  `partialPrefetching`, to keep standard, explainable caching.
- **Removed:** Google Fonts, so builds don't depend on the network.
- **Upgraded:** `@types/node` to 22, because Vitest 5 and the OpenAI SDK both
  need Node 22+.

## 15. Deliberately not built

- **Product features:** live feeds, accounts, a database, chat history,
  multiple matches, win probabilities, betting or fantasy features, and
  theming.
- **AI infrastructure:** vector search/RAG, agents, and MCP.
- **Cricket rules:** DLS, Super Overs, penalty runs, and retirements. The
  normalizer rejects matches that need them.
