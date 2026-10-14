# Demo script (about 3 minutes)

Before the demo:

- Run `npm run verify:ai`, or press **Catch me up** once on the deployed URL,
  to confirm the badge says `AI · gpt-5.4-mini`. If it says
  `Rule-based fallback`, read the reason under it and fix that first.
- AI wording varies between runs. The numbers below come from the engine and
  will match.

## 1. Set the scene (20 s)

Open the deployed URL.

> "A fan was watching India chase 160 against Pakistan, stepped away, and is
> back. This is a historical replay, not live data, and the label at the top
> says so."

Point at the scorecard: **129/4 after 18 overs, need 31 off 12**, required
rate 15.50.

## 2. Advance the replay (20 s)

Click **Next over**. The score moves to **144/4 (19.0 ov), need 16 off 6**.

> "Play, Next ball and Next over only move the replay. They never call the
> AI. The server decides where each step lands, so the browser never sees
> future deliveries."

## 3. Catch up (40 s)

Leave **"I last watched until…"** on **End of over 10 · 45/4** and click
**Catch me up**.

Walk through the three cards:

- **What changed:** India added **99 runs for no wickets** in 9 overs.
- **Why it matters:** this card is labelled *interpretation*. The equation
  went from **115 off 60** to **16 off 6**.
- **What to watch next:** **16 off 6 balls** with 6 wickets in hand.

> "The model never calculates numbers. The code computes every figure and the
> model explains them. Every claim cites evidence."

## 4. Inspect evidence (30 s)

Click an evidence chip, such as **Runs in window** or any **Ball …** delivery
chip. The evidence panel opens with that item highlighted. Scroll **Every
delivery in this window** to show the underlying ball-by-ball data.

> "If the model cites anything that isn't in this checkpoint's data, or uses a
> number we can't find in the data, the response is rejected and you get a
> clearly labelled rule-based fallback instead."

## 5. Ask a question (30 s)

Click the suggestion **How many extras have been conceded?** The answer comes
back tagged "As of 19.0 ov", with evidence chips.

## 6. An unsupported question, handled honestly (30 s)

Type **"Is Hardik Pandya injured?"** and press **Ask**. Expected status:
**Not in the match data**.

Optional: click **Next ball** four times to reach the no-ball at 19.4 and ask
**"Why was that a no-ball?"**

> "Ball-by-ball data records that a no-ball happened, not why."

Optional: click **Who will win?** The app declines to predict and restates
the requirement.

## 7. Stale and rewind safety (20 s)

Click **Next ball**. Earlier answers now show "The replay has moved on… it
describes 19.0 ov, not the current score". Click **Restart**: the recap and
answers are cleared, because they described deliveries the fan hasn't seen
from the start.

## If something goes wrong live

- **Fallback badge appears:** say what it means. The app degrades honestly
  instead of pretending, and the reason is shown under the badge.
- **No network:** the replay still works, because it's served by the app
  itself, not Cricsheet.
