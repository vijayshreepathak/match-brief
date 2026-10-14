# Demo script (about 3 minutes)

**Before the demo:**

- Run `npm run verify:ai` (or press **Catch me up** once on the deployed URL)
  and confirm the badge reads `AI · gpt-5.4-mini`. If it reads
  `Rule-based fallback`, the reason underneath tells you what to fix first. On
  2026-10-15 the reason was an OpenAI account with no credit.
- AI wording varies from run to run. The numbers below come from the engine
  and will not change.

## 1. Open the replay (20 s)

Open the deployed URL.

> "A fan was watching India chase 160 against Pakistan, stepped away, and has
> just come back. This is a historical replay, not live data, and the label at
> the top says so."

Point at the scorecard: **129/4 after 18 overs, need 31 off 12**, required
rate 15.50.

## 2. Catch up (45 s)

Leave **"I last watched until…"** on **End of over 10 · 45/4**. Click
**Catch me up**.

Walk through the cards:

- **What changed:** the AI's note sits above grey fact lines, for example
  "Runs scored (10.0–18.0 ov): 84 (10.50 per over)".
- **Why it matters:** labelled as interpretation.
- **What to watch next:** "Runs needed (as of 18.0 ov): 31", "Balls remaining
  (as of 18.0 ov): 12".

> "The AI decides what matters and explains it in words. It never writes a
> number. Every number you see is calculated in code and labelled with the
> moment it describes."

## 3. Inspect the evidence (30 s)

Click a chip such as **Runs in window** or a **Ball …** delivery. The evidence
panel opens with that item highlighted. Scroll **Every delivery in this
window** to show the underlying ball-by-ball data.

> "If the AI cites a delivery that isn't in this window, or calls a four a
> wicket, the answer is rejected and a labelled rule-based summary replaces
> it."

## 4. Ask a question (30 s)

Click the suggestion **How many extras have been conceded?** The answer
appears with the fact line "Extras conceded by Pakistan (as of 18.0 ov): 5
(wides 4, …)", tagged "As of 18.0 ov".

## 5. Unavailable information, handled honestly (30 s)

Type **"Is Hardik Pandya injured?"** and press **Ask**. The expected status is
**Not in the match data**.

> "Ball-by-ball data doesn't record injuries, or why a no-ball was called, so
> MatchBrief says so instead of guessing."

## Optional extras (if time allows)

- **Who will win?** The app declines to predict the result before the chase
  ends.
- **Next ball / Restart.** Earlier answers say they describe 18.0 ov, not the
  new score. Restart clears them.

## If something goes wrong live

- **A fallback badge appears.** Read out the reason shown under it. The app
  degrades honestly rather than pretending.
- **There's no network.** The replay and the fallback still work, because the
  match data is bundled with the app, not fetched from Cricsheet.
