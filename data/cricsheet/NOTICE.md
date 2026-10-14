# Match data notice

MatchBrief replays one historical match using ball-by-ball data from
**Cricsheet** (<https://cricsheet.org/>), maintained by Stephen Rushe.

- **Match:** Pakistan v India, ICC Men's T20 World Cup 2022, match 16 (Group 2),
  Melbourne Cricket Ground, 23 October 2022
- **Cricsheet match ID:** `1298150` (file `1298150.json`, Cricsheet JSON
  `data_version` 1.1.0, `created` 2022-10-27, `revision` 2)
- **SHA-256 of the bundled file:**
  `069ab608f749cbdd948137131ffb6d9c41dfc2b4529d40df36d4c93f335ef33a`

## License

Cricsheet states that its match data "is licensed for use under the Open Data
Commons Attribution License". This project uses the data under the
**Open Data Commons Attribution License (ODC-By) v1.0**:
<https://opendatacommons.org/licenses/by/1-0/>.

Attribution: *Ball-by-ball data from Cricsheet (cricsheet.org), used under the
Open Data Commons Attribution License v1.0.*

The bundled `1298150.json` is the unmodified Cricsheet file. MatchBrief code is
separate from the data and is not covered by this notice.

## How the file was obtained

On 2026-10-14, `cricsheet.org/downloads/` answered scripted requests with a
browser-verification page, so the file could not be fetched from Cricsheet by
script. The unmodified Cricsheet file was instead taken from five independent
public GitHub repositories that redistribute Cricsheet data. All five copies
were byte-identical (the SHA-256 above), and the file's own `meta` block
identifies it as Cricsheet output.

To use a copy downloaded directly from Cricsheet in a browser
(<https://cricsheet.org/downloads/t20s_json.zip>, then extract `1298150.json`):

```bash
npm run data:import -- path/to/1298150.json
npm test
```

## Transformations applied at runtime (not to the file)

`src/lib/cricket/normalize.ts` reads the file on the server and:

1. Validates that this is a 20-over, 6-ball T20 with two innings, no DLS
   method, no Super Over, no penalty runs, only supported dismissal kinds, and
   a second-innings target equal to the first-innings total + 1.
2. Keeps the first-innings total (runs, wickets, legal balls) only.
3. Turns every second-innings delivery into one event with a unique sequential
   ID (`E1`...`E125`), separate from its over/ball label, because wides and
   no-balls share a ball position with the next delivery.
4. Drops match metadata that would reveal the future: `outcome`,
   `player_of_match`, and `toss` are never copied into the normalized data.
   Officials, the player registry, and DRS reviews are also dropped.

The browser and the AI model only ever receive data derived from deliveries up
to the selected checkpoint.
