# Match data notice

MatchBrief replays one historical match using ball-by-ball data from
**Cricsheet** (<https://cricsheet.org/>), maintained by Stephen Rushe.

- **Match:** Pakistan v India, ICC Men's T20 World Cup 2022, match 16 (Group 2),
  Melbourne Cricket Ground, 23 October 2022
- **Cricsheet match ID:** `1298150` (file `1298150.json`). Its own `meta` block
  reads: `data_version` 1.1.0, `created` 2022-10-27, `revision` 2.
- **SHA-256 of the bundled file:**
  `069ab608f749cbdd948137131ffb6d9c41dfc2b4529d40df36d4c93f335ef33a`
- **Git blob SHA-1 of the bundled file:**
  `3276a2d697c284ca02b85e2c10c9f4dcd64582e6`

## License

Cricsheet's download README states: "Match data is licensed for use under the
Open Data Commons Attribution License." MatchBrief uses the data under the
**Open Data Commons Attribution License (ODC-By) v1.0**:
<https://opendatacommons.org/licenses/by/1-0/>.

Attribution: *Ball-by-ball data from Cricsheet (cricsheet.org), used under the
Open Data Commons Attribution License v1.0.*

MatchBrief's code is separate from the data and is not covered by this notice.

## Where the file came from (provenance)

`cricsheet.org/downloads/` answers scripted requests with a JavaScript
browser-verification page. This happened on 2026-10-14 and again on
2026-10-15. I did not try to get around it, so the file has **not** been
compared with an official download.

The bundled file is a copy of Cricsheet's `1298150.json` as redistributed in
five public GitHub repositories. Each copy below has the same git blob SHA as
the bundled file, at the pinned commit:

| Repository | Path | Commit |
| --- | --- | --- |
| [Hackquantumcpp/cricket-elo](https://github.com/Hackquantumcpp/cricket-elo/blob/8f32f65943d670106433423440ab5e5127e10924/data/1298150.json) | `data/1298150.json` | `8f32f65943d670106433423440ab5e5127e10924` |
| [AMMARKHALID2004/Cricket-Match-Win-Probability-Predictor](https://github.com/AMMARKHALID2004/Cricket-Match-Win-Probability-Predictor/blob/4a878fa905d5b88a637ab35e54fbdbf42c781804/t20s_json/1298150.json) | `t20s_json/1298150.json` | `4a878fa905d5b88a637ab35e54fbdbf42c781804` |
| [cepdnaclk/e19-co544-cricket-analytics-and-prediction](https://github.com/cepdnaclk/e19-co544-cricket-analytics-and-prediction/blob/7080cba52c7a6bb7e48e70ce4e7d1c45521d092f/Data/t20s_male_json/1298150.json) | `Data/t20s_male_json/1298150.json` | `7080cba52c7a6bb7e48e70ce4e7d1c45521d092f` |
| [Krishnaag23/CrickPick](https://github.com/Krishnaag23/CrickPick/blob/5be1a58dab55ee4743aae108d4c230a874e9208a/all_json/1298150.json) | `all_json/1298150.json` | `5be1a58dab55ee4743aae108d4c230a874e9208a` |
| [SL-MGx03/T20-WC-Predicter](https://github.com/SL-MGx03/T20-WC-Predicter/blob/67af1ece2bc553bf86a444c98895512f14ace898/data_set/1298150.json) | `data_set/1298150.json` | `67af1ece2bc553bf86a444c98895512f14ace898` |

**What this shows and doesn't show:** identical copies in unrelated
repositories show the copies are *consistent*. They do not prove the file is
byte-identical to what Cricsheet serves today. Cricsheet may have issued later
revisions.

**Independent cross-check:** the scores calculated from this file match a
published scorecard for the match (TV9 Bangla, corroborated by Wisden's
listing): every India batter's runs, balls, 4s and 6s; extras
`(b 3, lb 1, w 6, nb 1) 11`; all six fall-of-wicket scores and balls; and all
five Pakistan bowling figures. The test is
`tests/unit/engine.test.ts`, "reconciliation with the published scorecard".

To replace the file with a copy downloaded from Cricsheet in a browser
(<https://cricsheet.org/downloads/t20s_json.zip>, then extract `1298150.json`):

```bash
npm run data:import -- path/to/1298150.json
npm test
```

## Transformations applied at runtime (the file itself is unchanged)

`src/lib/cricket/normalize.ts` reads the file on the server and does the
following:

1. **Validates the match.** It must be a 20-over, 6-ball T20 with two innings,
   no DLS method, no Super Over, no "no result", no penalty runs, only
   supported dismissal kinds, and a second-innings target equal to the
   first-innings total + 1. Ordinary wides, no-balls, byes and leg-byes are
   supported.
2. **Keeps only the first-innings total** (runs, wickets, legal balls).
3. **Turns every second-innings delivery into one event** with a unique
   sequential ID (`E1`…`E125`). The ID is separate from the over/ball label,
   because wides and no-balls share a ball label with the next delivery.
4. **Drops anything that would reveal the future.** `outcome`,
   `player_of_match` and `toss` are never copied into the normalized data.
   Officials, the player registry and DRS reviews are dropped as well.

The browser and the AI model only ever receive data derived from deliveries up
to the selected checkpoint.
