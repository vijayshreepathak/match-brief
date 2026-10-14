import { RawMatchSchema, type RawDelivery } from "./raw-schema";
import {
  SUPPORTED_DISMISSALS,
  type Chase,
  type Delivery,
  type Dismissal,
  type DismissalKind,
  type Extras,
} from "./types";

export class FixtureError extends Error {}

function fail(message: string): never {
  throw new FixtureError(`Unsupported fixture: ${message}`);
}

const BALLS_PER_OVER = 6;
const OVERS = 20;

function isLegal(extras: Extras): boolean {
  return extras.wides === 0 && extras.noballs === 0;
}

function dismissalText(kind: DismissalKind, fielders: string[], bowler: string): string {
  const fielder = fielders.join("/");
  switch (kind) {
    case "bowled":
      return `b ${bowler}`;
    case "lbw":
      return `lbw b ${bowler}`;
    case "caught":
      return `c ${fielder || "?"} b ${bowler}`;
    case "caught and bowled":
      return `c & b ${bowler}`;
    case "stumped":
      return `st ${fielder || "?"} b ${bowler}`;
    case "hit wicket":
      return `hit wicket b ${bowler}`;
    case "run out":
      return fielder ? `run out (${fielder})` : "run out";
  }
}

function toDismissals(raw: RawDelivery): Dismissal[] {
  return (raw.wickets ?? []).map((w) => {
    if (!(SUPPORTED_DISMISSALS as readonly string[]).includes(w.kind)) {
      fail(`dismissal kind "${w.kind}" is not supported`);
    }
    const kind = w.kind as DismissalKind;
    const fielders = (w.fielders ?? []).flatMap((f) => (f.name ? [f.name] : []));
    return { kind, playerOut: w.player_out, fielders, text: dismissalText(kind, fielders, raw.bowler) };
  });
}

function toExtras(raw: RawDelivery): Extras {
  const e = raw.extras ?? {};
  if (e.penalty) fail("penalty runs are not supported");
  const extras = { wides: e.wides ?? 0, noballs: e.noballs ?? 0, byes: e.byes ?? 0, legbyes: e.legbyes ?? 0 };
  const sum = extras.wides + extras.noballs + extras.byes + extras.legbyes;
  if (sum !== raw.runs.extras) fail("extras breakdown does not match extras total");
  if (raw.runs.batter + raw.runs.extras !== raw.runs.total) fail("runs do not add up");
  return extras;
}

/**
 * Validates a raw Cricsheet match and converts the second innings into a Chase.
 * Throws FixtureError if the match needs rules this prototype does not implement.
 * Deliberately does not copy outcome, player of the match, or toss.
 */
export function normalizeCricsheetMatch(input: unknown, matchId: string): Chase {
  const parsed = RawMatchSchema.safeParse(input);
  if (!parsed.success) fail(`not a recognised Cricsheet JSON file (${parsed.error.issues[0]?.message})`);
  const raw = parsed.data;
  const { info } = raw;

  if (info.match_type !== "T20" && info.match_type !== "IT20") fail(`match type ${info.match_type}`);
  if (info.overs !== OVERS || info.balls_per_over !== BALLS_PER_OVER) fail("not a 20-over, 6-ball match");
  if (info.outcome.method) fail(`result decided by ${info.outcome.method}`);
  if (info.outcome.eliminator) fail("decided by a Super Over");
  if (info.outcome.result) fail(`match result was "${info.outcome.result}"`);
  if (raw.innings.length !== 2) fail("expected exactly two innings");
  if (raw.innings.some((inn) => inn.super_over)) fail("contains a Super Over");
  if (raw.innings.some((inn) => inn.penalty_runs)) fail("contains penalty runs");

  const [first, second] = raw.innings;

  // First innings: only the total is needed to set the target.
  let firstRuns = 0;
  let firstWickets = 0;
  let firstLegal = 0;
  for (const over of first.overs) {
    for (const d of over.deliveries) {
      const extras = toExtras(d);
      firstRuns += d.runs.total;
      firstWickets += toDismissals(d).length;
      if (isLegal(extras)) firstLegal += 1;
    }
  }

  const target = firstRuns + 1;
  if (!second.target) fail("second innings has no target");
  if (second.target.overs !== OVERS) fail("target was revised (reduced overs)");
  if (second.target.runs !== target) {
    fail(`target ${second.target.runs} does not equal first-innings total ${firstRuns} + 1`);
  }

  const deliveries: Delivery[] = [];
  const overEnds: number[] = [];
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  for (const over of second.overs) {
    if (over.over !== overEnds.length) fail(`over ${over.over} is out of sequence`);
    let legalInOver = 0;
    for (const d of over.deliveries) {
      if (runs >= target || wickets >= 10 || legalBalls >= OVERS * BALLS_PER_OVER) {
        fail("deliveries continue after the chase ended");
      }
      const extras = toExtras(d);
      const legal = isLegal(extras);
      const dismissals = toDismissals(d);
      const seq = deliveries.length + 1;
      const boundary =
        !d.runs.non_boundary && (d.runs.batter === 4 || d.runs.batter === 6) ? (d.runs.batter as 4 | 6) : null;

      deliveries.push({
        seq,
        id: `E${seq}`,
        overIndex: over.over,
        // A wide or no-ball carries the label of the ball being attempted.
        ballLabel: `${over.over}.${legalInOver + 1}`,
        batter: d.batter,
        nonStriker: d.non_striker,
        bowler: d.bowler,
        batterRuns: d.runs.batter,
        extras,
        extrasTotal: d.runs.extras,
        totalRuns: d.runs.total,
        isLegal: legal,
        boundary,
        dismissals,
      });

      runs += d.runs.total;
      wickets += dismissals.length;
      if (legal) {
        legalInOver += 1;
        legalBalls += 1;
      }
      if (legalInOver > BALLS_PER_OVER) fail(`over ${over.over + 1} has more than six legal balls`);
    }
    overEnds.push(deliveries.length);
  }

  const chaseOver = runs >= target || wickets >= 10 || legalBalls === OVERS * BALLS_PER_OVER;
  if (!chaseOver) fail("second innings stops before the chase is complete");

  const event = info.event;
  const competition = event
    ? [event.name, event.match_number ? `match ${event.match_number}` : null, event.group ? `Group ${event.group}` : null]
        .filter(Boolean)
        .join(", ")
    : "T20";

  return {
    matchId,
    fixtureVersion: `cricsheet-${matchId}-${raw.meta.data_version}-r${raw.meta.revision}`,
    competition,
    venue: info.city ? `${info.venue}, ${info.city}` : info.venue,
    date: info.dates[0],
    battingTeam: second.team,
    bowlingTeam: first.team,
    firstInnings: { team: first.team, runs: firstRuns, wickets: firstWickets, legalBalls: firstLegal },
    target,
    maxLegalBalls: OVERS * BALLS_PER_OVER,
    maxWickets: 10,
    deliveries,
    overEnds,
  };
}
