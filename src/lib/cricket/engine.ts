import type {
  BatterLine,
  BowlerLine,
  Chase,
  ChaseStatus,
  Delivery,
  Extras,
  IntervalSummary,
  Snapshot,
} from "./types";

// Pure scoreboard calculations. A checkpoint `seq` means "after delivery seq":
// 0 is the start of the chase and chase.deliveries.length is the final ball.

export class CheckpointError extends Error {}

/** Legal balls -> overs notation. 104 -> "17.2". Never treat the result as a decimal. */
export function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

/** Runs per over from runs and legal balls; null when no legal ball has been bowled. */
export function runRate(runs: number, legalBalls: number): number | null {
  return legalBalls > 0 ? (runs * 6) / legalBalls : null;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "-" : rate.toFixed(2);
}

export function lastSeq(chase: Chase): number {
  return chase.deliveries.length;
}

export function assertCheckpoint(chase: Chase, seq: number): void {
  if (!Number.isInteger(seq) || seq < 0 || seq > lastSeq(chase)) {
    throw new CheckpointError(`Checkpoint must be an integer from 0 to ${lastSeq(chase)}`);
  }
}

/** Interval (fromSeq, toSeq]: deliveries after the last-seen checkpoint up to and including the viewing one. */
export function assertInterval(chase: Chase, fromSeq: number, toSeq: number): void {
  assertCheckpoint(chase, fromSeq);
  assertCheckpoint(chase, toSeq);
  if (fromSeq > toSeq) throw new CheckpointError("Last-seen checkpoint must not be after the viewing checkpoint");
}

export function deliveriesUpTo(chase: Chase, seq: number): Delivery[] {
  assertCheckpoint(chase, seq);
  return chase.deliveries.slice(0, seq);
}

export function deliveriesBetween(chase: Chase, fromSeq: number, toSeq: number): Delivery[] {
  assertInterval(chase, fromSeq, toSeq);
  return chase.deliveries.slice(fromSeq, toSeq);
}

function emptyExtras(): Extras & { total: number } {
  return { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 };
}

function addExtras(acc: Extras & { total: number }, d: Delivery) {
  acc.wides += d.extras.wides;
  acc.noballs += d.extras.noballs;
  acc.byes += d.extras.byes;
  acc.legbyes += d.extras.legbyes;
  acc.total += d.extrasTotal;
}

/** Runs charged to the bowler: everything except byes and leg-byes. */
function bowlerRuns(d: Delivery): number {
  return d.batterRuns + d.extras.wides + d.extras.noballs;
}

function creditsBowler(kind: string): boolean {
  return kind !== "run out";
}

function battingLines(deliveries: Delivery[]): BatterLine[] {
  const lines = new Map<string, BatterLine>();
  const line = (name: string) => {
    let l = lines.get(name);
    if (!l) {
      l = { name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: null };
      lines.set(name, l);
    }
    return l;
  };
  for (const d of deliveries) {
    const striker = line(d.batter);
    line(d.nonStriker);
    striker.runs += d.batterRuns;
    // A no-ball counts as a ball faced; a wide does not.
    if (d.extras.wides === 0) striker.balls += 1;
    if (d.boundary === 4) striker.fours += 1;
    if (d.boundary === 6) striker.sixes += 1;
    for (const w of d.dismissals) {
      const out = line(w.playerOut);
      out.out = true;
      out.dismissal = w.text;
    }
  }
  return [...lines.values()];
}

function bowlingLines(deliveries: Delivery[]): BowlerLine[] {
  const lines = new Map<string, BowlerLine>();
  for (const d of deliveries) {
    const l = lines.get(d.bowler) ?? { name: d.bowler, legalBalls: 0, overs: "0.0", runs: 0, wickets: 0 };
    l.runs += bowlerRuns(d);
    if (d.isLegal) l.legalBalls += 1;
    l.wickets += d.dismissals.filter((w) => creditsBowler(w.kind)).length;
    l.overs = formatOvers(l.legalBalls);
    lines.set(d.bowler, l);
  }
  return [...lines.values()];
}

export function snapshotAt(chase: Chase, seq: number): Snapshot {
  const past = deliveriesUpTo(chase, seq);
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let fours = 0;
  let sixes = 0;
  const extras = emptyExtras();
  let lastWicket: Snapshot["lastWicket"] = null;
  let partnershipStart = 0;

  past.forEach((d, i) => {
    runs += d.totalRuns;
    if (d.isLegal) legalBalls += 1;
    if (d.boundary === 4) fours += 1;
    if (d.boundary === 6) sixes += 1;
    addExtras(extras, d);
    for (const w of d.dismissals) {
      wickets += 1;
      lastWicket = {
        eventId: d.id,
        ballLabel: d.ballLabel,
        text: `${w.playerOut} ${w.text}`,
        score: `${runs}/${wickets}`,
      };
      partnershipStart = i + 1;
    }
  });

  const ballsRemaining = Math.max(0, chase.maxLegalBalls - legalBalls);
  const runsNeeded = Math.max(0, chase.target - runs);

  let status: ChaseStatus = "in_progress";
  if (runs >= chase.target) status = "won";
  else if (wickets >= chase.maxWickets || ballsRemaining === 0) {
    status = runs === chase.target - 1 ? "tied" : "lost";
  }
  const inningsComplete = status !== "in_progress";

  let resultText: string | null = null;
  if (status === "won") {
    const inHand = chase.maxWickets - wickets;
    resultText = `${chase.battingTeam} reached the target and won by ${inHand} wicket${inHand === 1 ? "" : "s"} (${ballsRemaining} ball${ballsRemaining === 1 ? "" : "s"} remaining)`;
  } else if (status === "lost") {
    const margin = chase.target - 1 - runs;
    resultText = `${chase.bowlingTeam} defended the target and won by ${margin} run${margin === 1 ? "" : "s"}`;
  } else if (status === "tied") {
    resultText = "Scores finished level: the match was tied";
  }

  const partnershipDeliveries = past.slice(partnershipStart);
  const notOut = battingLines(past).filter((b) => !b.out).map((b) => b.name);
  const partnershipBatters = notOut.filter((name) =>
    partnershipDeliveries.some((d) => d.batter === name || d.nonStriker === name),
  );

  return {
    seq,
    label: checkpointLabel(seq, legalBalls, runs, wickets),
    runs,
    wickets,
    legalBalls,
    overs: formatOvers(legalBalls),
    ballsRemaining,
    runsNeeded,
    currentRunRate: runRate(runs, legalBalls),
    requiredRunRate: !inningsComplete && ballsRemaining > 0 ? (runsNeeded * 6) / ballsRemaining : null,
    status,
    inningsComplete,
    resultText,
    extras,
    fours,
    sixes,
    batters: battingLines(past),
    bowlers: bowlingLines(past),
    partnership: {
      runs: partnershipDeliveries.reduce((sum, d) => sum + d.totalRuns, 0),
      legalBalls: partnershipDeliveries.filter((d) => d.isLegal).length,
      batters: partnershipBatters,
    },
    lastWicket,
  };
}

function checkpointLabel(seq: number, legalBalls: number, runs: number, wickets: number): string {
  if (seq === 0) return "Start of chase (0.0 ov)";
  return `${formatOvers(legalBalls)} ov · ${runs}/${wickets}`;
}

export function intervalBetween(chase: Chase, fromSeq: number, toSeq: number): IntervalSummary {
  const window = deliveriesBetween(chase, fromSeq, toSeq);
  const extras = emptyExtras();
  window.forEach((d) => addExtras(extras, d));

  const batterRuns = new Map<string, { name: string; runs: number; balls: number }>();
  for (const d of window) {
    const b = batterRuns.get(d.batter) ?? { name: d.batter, runs: 0, balls: 0 };
    b.runs += d.batterRuns;
    if (d.extras.wides === 0) b.balls += 1;
    batterRuns.set(d.batter, b);
  }

  return {
    fromSeq,
    toSeq,
    deliveries: window.length,
    legalBalls: window.filter((d) => d.isLegal).length,
    runs: window.reduce((sum, d) => sum + d.totalRuns, 0),
    wickets: window.reduce((sum, d) => sum + d.dismissals.length, 0),
    extras,
    fourIds: window.filter((d) => d.boundary === 4).map((d) => d.id),
    sixIds: window.filter((d) => d.boundary === 6).map((d) => d.id),
    wicketIds: window.filter((d) => d.dismissals.length > 0).map((d) => d.id),
    batters: [...batterRuns.values()],
    bowlers: bowlingLines(window),
    before: snapshotAt(chase, fromSeq),
    after: snapshotAt(chase, toSeq),
  };
}

export interface CheckpointOption {
  seq: number;
  label: string;
}

/** "I last watched until..." options: the start plus every completed over up to `viewingSeq`. */
export function lastSeenOptions(chase: Chase, viewingSeq: number): CheckpointOption[] {
  assertCheckpoint(chase, viewingSeq);
  const options: CheckpointOption[] = [{ seq: 0, label: "Start of chase (0.0 ov) · 0/0" }];
  chase.overEnds.forEach((seq, i) => {
    if (seq > viewingSeq) return;
    const snap = snapshotAt(chase, seq);
    const overLabel = snap.inningsComplete && snap.legalBalls % 6 !== 0 ? `${snap.overs} ov (end of chase)` : `End of over ${i + 1}`;
    options.push({ seq, label: `${overLabel} · ${snap.runs}/${snap.wickets}` });
  });
  return options;
}

export type ReplayStep = "start" | "prev-over" | "next-ball" | "next-over" | "current";

/** Where a replay control moves to. Never goes before 0 or past the final delivery. */
export function stepTarget(chase: Chase, seq: number, step: ReplayStep): number {
  assertCheckpoint(chase, seq);
  const end = lastSeq(chase);
  switch (step) {
    case "start":
      return 0;
    case "current":
      return seq;
    case "next-ball":
      return Math.min(seq + 1, end);
    case "next-over":
      return chase.overEnds.find((overEnd) => overEnd > seq) ?? end;
    case "prev-over":
      return [...chase.overEnds].reverse().find((overEnd) => overEnd < seq) ?? 0;
  }
}

/** Over-end checkpoint for a 1-based over number (used for defaults and tests). */
export function endOfOver(chase: Chase, over: number): number {
  const seq = chase.overEnds[over - 1];
  if (seq === undefined) throw new CheckpointError(`Over ${over} does not exist`);
  return seq;
}

export function describeDelivery(d: Delivery): string {
  const parts: string[] = [];
  if (d.boundary === 6) parts.push("SIX");
  else if (d.boundary === 4) parts.push("FOUR");
  else if (d.batterRuns > 0) parts.push(`${d.batterRuns} run${d.batterRuns === 1 ? "" : "s"}`);
  if (d.extras.wides) parts.push(`${d.extras.wides} wide${d.extras.wides === 1 ? "" : "s"}`);
  if (d.extras.noballs) parts.push("no-ball");
  if (d.extras.byes) parts.push(`${d.extras.byes} bye${d.extras.byes === 1 ? "" : "s"}`);
  if (d.extras.legbyes) parts.push(`${d.extras.legbyes} leg-bye${d.extras.legbyes === 1 ? "" : "s"}`);
  if (parts.length === 0) parts.push("dot ball");
  for (const w of d.dismissals) parts.push(`WICKET: ${w.playerOut} ${w.text}`);
  return parts.join(", ");
}

/** Compact scoring symbol for a ball-by-ball strip. */
export function deliverySymbol(d: Delivery): string {
  if (d.dismissals.length) return "W";
  if (d.extras.wides) return `${d.extras.wides}wd`;
  if (d.extras.noballs) return `nb${d.batterRuns ? `+${d.batterRuns}` : ""}`;
  if (d.extras.byes) return `${d.extras.byes}b`;
  if (d.extras.legbyes) return `${d.extras.legbyes}lb`;
  return String(d.batterRuns);
}
