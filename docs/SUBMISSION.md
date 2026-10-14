# Submission

## Working artifact

**Deployed URL:** `[[ PASTE THE VERCEL PRODUCTION URL HERE AFTER DEPLOYING ]]`

Source code: `[[ OPTIONAL: PASTE THE GITHUB REPOSITORY URL HERE ]]`

## Note (under 200 words)

**Fan problem:** Fans step away during a chase, for food, work or a call, and
return to a changed scoreboard. Reading a commentary feed to work out what
happened takes longer than the overs they missed.

**Solution:** MatchBrief replays a real historical T20 chase (India v
Pakistan, 2022 T20 World Cup, Cricsheet ball-by-ball data). The fan picks when
they stopped watching and taps "Catch me up". MatchBrief explains what
changed, why it matters and what to watch next, and links every point to the
deliveries or calculations behind it. Fans can also ask questions about the
current moment. Code computes the scores, run rates and equations, and the AI
only explains them. It sees only deliveries up to the current replay point and
says plainly when something, such as an injury or why a no-ball was called,
isn't in the data. If AI output fails validation or is unavailable, a clearly
labelled rule-based summary appears instead.

**AI tools:** OpenAI GPT-5.4 mini through the Responses API with Structured
Outputs, Zod validation and evidence checks. Built with Claude Code as a
coding assistant.

**Disclosure:** historical replay, not live data. Independent prototype, not
affiliated with Dream11.

---

## Before you submit (not part of the note)

- [ ] Deploy to Vercel with `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.4-mini`, and
      `OPENAI_REASONING_EFFORT=low` (README → Deploy to Vercel).
- [ ] Run `npm run verify:ai` locally with the key, and/or press
      **Catch me up** on the deployed URL. Confirm the badge says
      `AI · gpt-5.4-mini`. The note describes AI features; submit it only once
      a real AI response has been seen working.
- [ ] Open the URL in an incognito window to confirm it is public, then check
      it on a phone.
- [ ] Set an OpenAI usage/budget limit for the key.
- [ ] Replace the URL placeholder above. In the form, upload a document that
      contains the link and this note.
- [ ] If you change the note, keep it under 200 words (the note above is
      193 words, counted with `wc -w`).
