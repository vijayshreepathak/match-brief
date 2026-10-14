// Normalized, future-safe representation of a T20 run chase.
// Everything here is plain data so it can be computed and tested without a server.

export const SUPPORTED_DISMISSALS = [
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "run out",
  "stumped",
  "hit wicket",
] as const;

export type DismissalKind = (typeof SUPPORTED_DISMISSALS)[number];

export interface Extras {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
}

export interface Dismissal {
  kind: DismissalKind;
  playerOut: string;
  fielders: string[];
  /** e.g. "c Babar Azam b Mohammad Nawaz" */
  text: string;
}

/** One second-innings delivery. `seq` is unique; `ballLabel` is not. */
export interface Delivery {
  /** 1-based sequential index within the chase. Checkpoint N = "after delivery N". */
  seq: number;
  /** Stable evidence ID, e.g. "E47". */
  id: string;
  /** 0-based over index, as in Cricsheet. */
  overIndex: number;
  /** Over.ball notation such as "17.4". Wides/no-balls share it with the next ball. */
  ballLabel: string;
  batter: string;
  nonStriker: string;
  bowler: string;
  batterRuns: number;
  extras: Extras;
  extrasTotal: number;
  totalRuns: number;
  /** False for wides and no-balls, which do not count towards the 6-ball over. */
  isLegal: boolean;
  /** 4 or 6 when the batter hit a boundary (not when four runs were run). */
  boundary: 4 | 6 | null;
  dismissals: Dismissal[];
}

export interface FirstInnings {
  team: string;
  runs: number;
  wickets: number;
  legalBalls: number;
}

export interface Chase {
  matchId: string;
  /** Changes whenever the bundled data changes; part of every AI cache key. */
  fixtureVersion: string;
  competition: string;
  venue: string;
  date: string;
  battingTeam: string;
  bowlingTeam: string;
  firstInnings: FirstInnings;
  target: number;
  maxLegalBalls: number;
  maxWickets: number;
  deliveries: Delivery[];
  /** seq of the last delivery in each over (index 0 = over 1). */
  overEnds: number[];
}

export type ChaseStatus = "in_progress" | "won" | "lost" | "tied";

export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissal: string | null;
}

export interface BowlerLine {
  name: string;
  legalBalls: number;
  overs: string;
  runs: number;
  wickets: number;
}

export interface Snapshot {
  seq: number;
  label: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  ballsRemaining: number;
  runsNeeded: number;
  /** null before the first legal ball. */
  currentRunRate: number | null;
  /** null once the chase is over (or no balls remain). */
  requiredRunRate: number | null;
  status: ChaseStatus;
  inningsComplete: boolean;
  /** Only set when the chase is complete, computed from the deliveries. */
  resultText: string | null;
  extras: Extras & { total: number };
  fours: number;
  sixes: number;
  batters: BatterLine[];
  bowlers: BowlerLine[];
  partnership: { runs: number; legalBalls: number; batters: string[] };
  lastWicket: { eventId: string; ballLabel: string; text: string; score: string } | null;
}

export interface IntervalSummary {
  fromSeq: number;
  toSeq: number;
  deliveries: number;
  legalBalls: number;
  runs: number;
  wickets: number;
  extras: Extras & { total: number };
  fourIds: string[];
  sixIds: string[];
  wicketIds: string[];
  batters: { name: string; runs: number; balls: number }[];
  bowlers: { name: string; legalBalls: number; overs: string; runs: number; wickets: number }[];
  before: Snapshot;
  after: Snapshot;
}
