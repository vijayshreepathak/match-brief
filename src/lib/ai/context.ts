import {
  assertInterval,
  deliveriesBetween,
  deliveriesUpTo,
  describeDelivery,
  formatOvers,
  formatRate,
  intervalBetween,
  snapshotAt,
} from "@/lib/cricket/engine";
import type { Chase, Delivery, IntervalSummary, Snapshot } from "@/lib/cricket/types";
import type { AsOf, EvidenceItem } from "./types";

// Builds everything the model may see for one (lastSeen, viewing] request.
// The server always rebuilds this from canonical data; nothing comes from the browser.

export interface Fact {
  id: string;
  label: string;
  value: string;
}

const FACT_CHIPS: Record<string, string> = {
  F_SCORE: "Score",
  F_TARGET: "Target",
  F_RUNS_NEEDED: "Runs needed",
  F_BALLS_LEFT: "Balls left",
  F_WICKETS_LEFT: "Wickets in hand",
  F_CRR: "Run rate",
  F_RRR: "Required rate",
  F_STATUS: "Chase status",
  F_EXTRAS: "Extras so far",
  F_BOUNDARIES: "Boundaries so far",
  F_BATTING: "Batting card",
  F_BOWLING: "Bowling card",
  F_PARTNERSHIP: "Partnership",
  F_LAST_WICKET: "Last wicket",
  F_INT_WINDOW: "Catch-up window",
  F_INT_RUNS: "Runs in window",
  F_INT_WICKETS: "Wickets in window",
  F_INT_BOUNDARIES: "Boundaries in window",
  F_INT_EXTRAS: "Extras in window",
  F_INT_EQUATION: "Equation change",
  F_INT_BATTING: "Batting in window",
  F_INT_BOWLING: "Bowling in window",
};

export interface ModelContext {
  op: "catchup" | "ask";
  asOf: AsOf;
  snapshot: Snapshot;
  interval: IntervalSummary | null;
  facts: Fact[];
  deliveries: Delivery[];
  /** Serialized for the model. */
  payload: Record<string, unknown>;
  /** Every ID the model may cite, resolved for display. */
  evidence: Map<string, EvidenceItem>;
}

function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

function equation(s: Snapshot): string {
  if (s.inningsComplete) return s.resultText ?? "chase complete";
  return `need ${s.runsNeeded} off ${plural(s.ballsRemaining, "ball")} (required rate ${formatRate(s.requiredRunRate)})`;
}

function snapshotFacts(chase: Chase, s: Snapshot): Fact[] {
  const team = chase.battingTeam;
  const facts: Fact[] = [
    { id: "F_SCORE", label: "Score", value: `${team} ${s.runs}/${s.wickets} after ${s.overs} overs` },
    {
      id: "F_TARGET",
      label: "Target",
      value: `${chase.target} (${chase.firstInnings.team} scored ${chase.firstInnings.runs}/${chase.firstInnings.wickets} in 20 overs; target = ${chase.firstInnings.runs} + 1)`,
    },
    {
      id: "F_RUNS_NEEDED",
      label: "Runs needed",
      value: s.runsNeeded === 0 ? "0 (target reached)" : `${s.runsNeeded} (${chase.target} - ${s.runs})`,
    },
    {
      id: "F_BALLS_LEFT",
      label: "Balls remaining",
      value: `${s.ballsRemaining} (${chase.maxLegalBalls} - ${s.legalBalls} legal balls bowled)`,
    },
    {
      id: "F_WICKETS_LEFT",
      label: "Wickets in hand",
      value: `${chase.maxWickets - s.wickets}`,
    },
    {
      id: "F_CRR",
      label: "Current run rate",
      value:
        s.currentRunRate === null
          ? "not defined yet (no legal balls bowled)"
          : `${formatRate(s.currentRunRate)} per over (${s.runs} x 6 / ${s.legalBalls} legal balls)`,
    },
    {
      id: "F_RRR",
      label: "Required run rate",
      value:
        s.requiredRunRate === null
          ? "not applicable (chase complete)"
          : `${formatRate(s.requiredRunRate)} per over (${s.runsNeeded} x 6 / ${s.ballsRemaining} balls)`,
    },
    {
      id: "F_STATUS",
      label: "Chase status",
      value: s.inningsComplete ? `Chase complete: ${s.resultText}` : `In progress: ${equation(s)}`,
    },
    {
      id: "F_EXTRAS",
      label: `Extras conceded by ${chase.bowlingTeam} so far`,
      value: `${s.extras.total} (wides ${s.extras.wides}, no-balls ${s.extras.noballs}, byes ${s.extras.byes}, leg-byes ${s.extras.legbyes})`,
    },
    { id: "F_BOUNDARIES", label: "Boundaries so far", value: `${plural(s.fours, "four")}, ${plural(s.sixes, "six", "sixes")}` },
  ];

  if (s.batters.length) {
    facts.push({
      id: "F_BATTING",
      label: `${team} batting so far (* = not out)`,
      value: s.batters
        .map((b) => `${b.name} ${b.runs}${b.out ? "" : "*"} (${b.balls} balls, ${b.fours}x4, ${b.sixes}x6)${b.dismissal ? ` ${b.dismissal}` : ""}`)
        .join("; "),
    });
    facts.push({
      id: "F_BOWLING",
      label: `${chase.bowlingTeam} bowling so far`,
      value: s.bowlers.map((b) => `${b.name} ${b.overs} overs, ${b.runs} runs, ${plural(b.wickets, "wicket")}`).join("; "),
    });
    facts.push({
      id: "F_PARTNERSHIP",
      label: "Current partnership",
      value:
        s.partnership.legalBalls === 0 && s.partnership.runs === 0
          ? "0 runs (no deliveries since the last wicket)"
          : `${s.partnership.runs} runs off ${plural(s.partnership.legalBalls, "legal ball")} (${s.partnership.batters.join(" and ")})`,
    });
  }
  if (s.lastWicket) {
    facts.push({
      id: "F_LAST_WICKET",
      label: "Most recent wicket",
      value: `${s.lastWicket.text} at ${s.lastWicket.score}, ball ${s.lastWicket.ballLabel} (${s.lastWicket.eventId})`,
    });
  }
  return facts;
}

function idsText(ids: string[]): string {
  return ids.length ? ` (${ids.join(", ")})` : "";
}

function intervalFacts(chase: Chase, i: IntervalSummary): Fact[] {
  const rate = i.legalBalls > 0 ? ` (${formatRate((i.runs * 6) / i.legalBalls)} per over)` : "";
  const wicketText =
    i.wickets === 0
      ? "0"
      : `${i.wickets}${idsText(i.wicketIds)}`;
  return [
    {
      id: "F_INT_WINDOW",
      label: "Catch-up window",
      value: `After ${i.before.label} up to ${i.after.label}: ${plural(i.deliveries, "delivery", "deliveries")}, ${plural(i.legalBalls, "legal ball")} (${formatOvers(i.legalBalls)} overs)`,
    },
    { id: "F_INT_RUNS", label: "Runs scored in the window", value: `${i.runs}${rate}` },
    { id: "F_INT_WICKETS", label: "Wickets lost in the window", value: wicketText },
    {
      id: "F_INT_BOUNDARIES",
      label: "Boundaries in the window",
      value: `${plural(i.fourIds.length, "four")}${idsText(i.fourIds)}, ${plural(i.sixIds.length, "six", "sixes")}${idsText(i.sixIds)}`,
    },
    {
      id: "F_INT_EXTRAS",
      label: `Extras conceded in the window`,
      value: `${i.extras.total} (wides ${i.extras.wides}, no-balls ${i.extras.noballs}, byes ${i.extras.byes}, leg-byes ${i.extras.legbyes})`,
    },
    {
      id: "F_INT_EQUATION",
      label: "How the chase equation changed",
      value: `Before: ${equation(i.before)}. Now: ${equation(i.after)}.`,
    },
    {
      id: "F_INT_BATTING",
      label: `${chase.battingTeam} batting in the window`,
      value: i.batters.map((b) => `${b.name} ${b.runs} off ${plural(b.balls, "ball")}`).join("; ") || "none",
    },
    {
      id: "F_INT_BOWLING",
      label: `${chase.bowlingTeam} bowling in the window`,
      value: i.bowlers.map((b) => `${b.name} ${b.overs} overs, ${b.runs} runs, ${plural(b.wickets, "wicket")}`).join("; ") || "none",
    },
  ];
}

export function deliveryLine(d: Delivery): string {
  return `${d.id} | ${d.ballLabel} | ${d.bowler} to ${d.batter} | ${describeDelivery(d)}`;
}

export function eventEvidence(d: Delivery): EvidenceItem {
  return {
    id: d.id,
    kind: "event",
    chip: `Ball ${d.ballLabel}`,
    title: `${d.ballLabel} · ${d.bowler} to ${d.batter}`,
    detail: `${describeDelivery(d)} (${d.totalRuns} run${d.totalRuns === 1 ? "" : "s"} to the total)`,
    seq: d.seq,
  };
}

export function asOfFor(chase: Chase, lastSeenSeq: number, viewingSeq: number): AsOf {
  return {
    viewingSeq,
    viewingLabel: snapshotAt(chase, viewingSeq).label,
    lastSeenSeq,
    lastSeenLabel: snapshotAt(chase, lastSeenSeq).label,
  };
}

export function buildModelContext(
  chase: Chase,
  op: "catchup" | "ask",
  lastSeenSeq: number,
  viewingSeq: number,
): ModelContext {
  assertInterval(chase, lastSeenSeq, viewingSeq);
  const snapshot = snapshotAt(chase, viewingSeq);
  const interval = lastSeenSeq < viewingSeq ? intervalBetween(chase, lastSeenSeq, viewingSeq) : null;
  const facts = [...snapshotFacts(chase, snapshot), ...(interval ? intervalFacts(chase, interval) : [])];

  // Catch-up sees the window's deliveries; questions may refer to anything that has happened so far.
  const deliveries =
    op === "catchup" ? deliveriesBetween(chase, lastSeenSeq, viewingSeq) : deliveriesUpTo(chase, viewingSeq);

  const evidence = new Map<string, EvidenceItem>();
  for (const f of facts) {
    evidence.set(f.id, { id: f.id, kind: "fact", chip: FACT_CHIPS[f.id] ?? f.label, title: f.label, detail: f.value });
  }
  for (const d of deliveries) evidence.set(d.id, eventEvidence(d));

  const asOf = asOfFor(chase, lastSeenSeq, viewingSeq);
  const payload = {
    replay: "Historical match replay. Only deliveries up to the viewing checkpoint are included.",
    match: {
      competition: chase.competition,
      venue: chase.venue,
      date: chase.date,
      batting_team: chase.battingTeam,
      bowling_team: chase.bowlingTeam,
      first_innings: `${chase.firstInnings.team} ${chase.firstInnings.runs}/${chase.firstInnings.wickets} (20 overs)`,
      target: chase.target,
    },
    checkpoints: {
      fan_last_saw: asOf.lastSeenLabel,
      viewing_now: asOf.viewingLabel,
      window: interval ? "deliveries after fan_last_saw up to and including viewing_now" : "no new deliveries",
    },
    facts: facts.map((f) => ({ id: f.id, label: f.label, value: f.value })),
    deliveries_scope: op === "catchup" ? "deliveries in the catch-up window" : "every delivery of the chase so far",
    deliveries: deliveries.map(deliveryLine),
  };

  return { op, asOf, snapshot, interval, facts, deliveries, payload, evidence };
}
