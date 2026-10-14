# Submission

> **Status: NOT READY TO SUBMIT.** Real AI responses have not been verified,
> because the OpenAI account behind the key has no credit (HTTP 429
> `insufficient_quota`). Nothing is deployed yet either. See
> `docs/VERIFICATION.md`.

## Working artifact

**Deployed URL:** `[[ PASTE THE VERIFIED VERCEL PRODUCTION URL HERE ]]`

Source code (optional): `[[ PASTE THE REPOSITORY URL HERE IF YOU SHARE IT ]]`

## Note (max 200 words; `npm test` checks the count)

<!-- note:start -->
**Fan problem:** Fans step away during a chase and return to a changed
scoreboard. Scrolling commentary to work out what happened takes longer than
the overs they missed.

**Solution:** MatchBrief replays a real historical T20 chase (India v
Pakistan, 2022 T20 World Cup, Cricsheet ball-by-ball data). The fan picks when
they stopped watching and taps "Catch me up" to see what changed, why it
matters and what to watch next, with every point linked to its supporting
deliveries or calculations. Fans can also ask about the current moment. Code
calculates every score, rate and equation; the AI selects relevant facts and
explains them in words. It sees only deliveries up to the replay point and
says when information, like an injury, isn't in the data. If AI is
unavailable, a labelled rule-based summary appears instead.

**AI tools:** OpenAI GPT-5.4 mini via the Responses API with Structured
Outputs and Zod validation. Built with Claude Code as a coding assistant.

**Disclosure:** historical replay, not live data; independent prototype, not
affiliated with Dream11.
<!-- note:end -->

## Before you submit (not part of the note)

- [ ] Add credit to the OpenAI account that owns the key. Use a dedicated
      project with an enforced monthly budget (README → Deploy).
- [ ] Run `npm run verify:ai` once. Every `ai_required` and `honest_refusal`
      case must pass as an accepted AI response.
- [ ] Run `npm run verify:ai:browser` once. Catch-up and a question must both
      show `AI · gpt-5.4-mini`, not "Rule-based fallback".
- [ ] Deploy to Vercel (README → Deploy). Open the production URL in an
      incognito window, press **Catch me up**, and confirm the AI badge.
- [ ] Replace the URL placeholder above with the verified production URL.
- [ ] In the form, upload a document containing the link and the note above.
- [ ] If you edit the note, run `npm test`: a test fails above 200 words.
