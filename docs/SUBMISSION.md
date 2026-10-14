# Submission

> **Status: ready to submit, with the caveats below.**
>
> - **The public demo is verified (2026-10-15).** The site loads without a
>   login, works at phone width, and returned accepted Gemini answers live for
>   a catch-up and a question.
> - **Caveats:**
>   - The full real-Gemini suite passed 9 of 11 checks; both misses were handled
>     safely.
>   - Live first responses took about 6–10 s.
>   - Do a final check on your own phone before submitting.
>
> See `docs/VERIFICATION.md`.

## Working artifact

**Deployed URL:** https://matchbrief.vercel.app/

Source code: https://github.com/vijayshreepathak/match-brief

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

**AI tools:** Google Gemini API (gemini-3.5-flash-lite) with structured JSON
output and Zod validation. Built with Claude Code as a coding assistant.

**Disclosure:** historical replay, not live data; independent prototype, not
affiliated with Dream11.
<!-- note:end -->

## Before you submit (not part of the note)

- [x] Add `GEMINI_API_KEY` to `.env.local`. Use a key from a dedicated Google
      Cloud project.
- [x] Run `npm run verify:ai:smoke`. Both cases must be accepted Gemini
      answers.
- [ ] Run `npm run verify:ai` once. Every `ai_required` and `honest_refusal`
      case must pass. Last run: 9 / 11, with two Gemini behaviour misses; see
      `docs/VERIFICATION.md`.
- [x] Run `npm run verify:ai:browser` once. Both the catch-up and the question
      must show `Gemini · gemini-3.5-flash-lite`.
- [x] Deploy to Vercel. https://matchbrief.vercel.app/ loads publicly, works
      at phone width (emulated Pixel 7), and returns accepted Gemini answers.
      Still worth checking on your own phone.
- [x] Replace the URL placeholder above with the verified production URL.
- [ ] In the form, upload a document containing the link and the note above.
- [ ] If you edit the note, run `npm test`: a test fails above 200 words.
