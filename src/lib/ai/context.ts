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

/** Which checkpoint or interval a fact describes. */
export type FactScope = "now" | "then" | "window" | "match";

export interface Fact {
  id: string;
  /** Machine-readable kind of fact, e.g. "runs_needed" or "batter". */
  type: string;
  scope: FactScope;
  /** Human label for the scope, e.g. "as of 18.0 ov" or "10.0–18.0 ov". */
  scopeLabel: string;
  label: string;
  /** Canonical value calculated in code. The only place numbers come from. */
  value: string;
  /** Deliveries that support the fact. */
  eventIds: string[];
  /** Short label for an evidence chip. */
  chip: string;
}

/** What a delivery is, so a cited event can be checked against the claim made about it. */
export const EVENT_KINDS = ["wicket", "six", "four", "wide", "no_ball", "bye", "leg_bye", "runs", "dot"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export function eventKinds(d: Delivery): EventKind[] {
  const kinds: EventKind[] = [];
  if (d.dismissals.length) kinds.push("wicket");
  if (d.boundary === 6) kinds.push("six");
  if (d.boundary === 4) kinds.push("four");
  if (d.extras.wides) kinds.push("wide");
  if (d.extras.noballs) kinds.push("no_ball");
  if (d.extras.byes) kinds.push("bye");
  if (d.extras.legbyes) kinds.push("leg_bye");
  if (d.batterRuns > 0 && d.boundary === null) kinds.push("runs");
  if (d.totalRuns === 0) kinds.push("dot");
  return kinds;
}

export interface ModelContext {
  op: "catchup" | "ask";
  asOf: AsOf;
  snapshot: Snapshot;
  interval: IntervalSummary | null;
  facts: Fact[];
  factsById: Map<string, Fact>;
  /** Deliveries shown to the model: the window for catch-up, everything so far for questions. */
  deliveries: Delivery[];
  /** Every past delivery the model may cite (includes deliveries supporting a fact). */
  citableEvents: Map<string, Delivery>;
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

function slug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

type FactInput = Omit<Fact, "scope" | "scopeLabel" | "eventIds" | "chip"> & { eventIds?: string[]; chip: string };

function scoped(scope: FactScope, scopeLabel: string, facts: FactInput[]): Fact[] {
  return facts.map((f) => ({ ...f, scope, scopeLabel, eventIds: f.eventIds ?? [] }));
}

function nowFacts(chase: Chase, s: Snapshot, past: Delivery[]): FactInput[] {
  const team = chase.battingTeam;
  const facts: FactInput[] = [
    { id: "F_SCORE", type: "score", chip: "Score", label: "Score", value: `${team} ${s.runs}/${s.wickets} after ${s.overs} overs` },
    {
      id: "F_RUNS_NEEDED",
      type: "runs_needed",
      chip: "Runs needed",
      label: "Runs needed",
      value: s.runsNeeded === 0 ? "0 (target reached)" : `${s.runsNeeded} (${chase.target} - ${s.runs})`,
    },
    {
      id: "F_BALLS_LEFT",
      type: "balls_remaining",
      chip: "Balls left",
      label: "Balls remaining",
      value: `${s.ballsRemaining} (${chase.maxLegalBalls} - ${s.legalBalls} legal balls bowled)`,
    },
    { id: "F_WICKETS_LEFT", type: "wickets_in_hand", chip: "Wickets in hand", label: "Wickets in hand", value: `${chase.maxWickets - s.wickets}` },
    {
      id: "F_CRR",
      type: "current_run_rate",
      chip: "Run rate",
      label: "Current run rate",
      value:
        s.currentRunRate === null
          ? "not defined yet (no legal balls bowled)"
          : `${formatRate(s.currentRunRate)} per over (${s.runs} x 6 / ${s.legalBalls} legal balls)`,
    },
    {
      id: "F_RRR",
      type: "required_run_rate",
      chip: "Required rate",
      label: "Required run rate",
      value:
        s.requiredRunRate === null
          ? "not applicable (chase complete)"
          : `${formatRate(s.requiredRunRate)} per over (${s.runsNeeded} x 6 / ${s.ballsRemaining} balls)`,
    },
    {
      id: "F_STATUS",
      type: "chase_status",
      chip: "Chase status",
      label: "Chase status",
      value: s.inningsComplete ? `Chase complete: ${s.resultText}` : `In progress: ${equation(s)}`,
    },
    {
      id: "F_EXTRAS",
      type: "extras",
      chip: "Extras so far",
      label: `Extras conceded by ${chase.bowlingTeam}`,
      value: `${s.extras.total} (wides ${s.extras.wides}, no-balls ${s.extras.noballs}, byes ${s.extras.byes}, leg-byes ${s.extras.legbyes})`,
      eventIds: past.filter((d) => d.extrasTotal > 0).map((d) => d.id),
    },
    {
      id: "F_BOUNDARIES",
      type: "boundaries",
      chip: "Boundaries so far",
      label: "Boundaries",
      value: `${plural(s.fours, "four")}, ${plural(s.sixes, "six", "sixes")}`,
      eventIds: past.filter((d) => d.boundary !== null).map((d) => d.id),
    },
  ];

  if (s.batters.length) {
    facts.push({
      id: "F_BATTING",
      type: "batting_card",
      chip: "Batting card",
      label: `${team} batting (* = not out)`,
      value: s.batters
        .map((b) => `${b.name} ${b.runs}${b.out ? "" : "*"} (${b.balls} balls, ${b.fours}x4, ${b.sixes}x6)${b.dismissal ? ` ${b.dismissal}` : ""}`)
        .join("; "),
    });
    for (const b of s.batters) {
      facts.push({
        id: `F_BAT_${slug(b.name)}`,
        type: "batter",
        chip: b.name,
        label: `${b.name} batting`,
        value: `${b.runs}${b.out ? "" : " not out"} off ${plural(b.balls, "ball")}, ${plural(b.fours, "four")}, ${plural(b.sixes, "six", "sixes")}${b.dismissal ? `; ${b.dismissal}` : ""}`,
        eventIds: past.filter((d) => d.dismissals.some((w) => w.playerOut === b.name)).map((d) => d.id),
      });
    }
    facts.push({
      id: "F_BOWLING",
      type: "bowling_card",
      chip: "Bowling card",
      label: `${chase.bowlingTeam} bowling`,
      value: s.bowlers.map((b) => `${b.name} ${b.overs} overs, ${b.runs} runs, ${plural(b.wickets, "wicket")}`).join("; "),
    });
    for (const b of s.bowlers) {
      facts.push({
        id: `F_BOWL_${slug(b.name)}`,
        type: "bowler",
        chip: b.name,
        label: `${b.name} bowling`,
        value: `${b.overs} overs, ${b.runs} runs, ${plural(b.wickets, "wicket")}`,
      });
    }
    facts.push({
      id: "F_PARTNERSHIP",
      type: "partnership",
      chip: "Partnership",
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
      type: "last_wicket",
      chip: "Last wicket",
      label: "Most recent wicket",
      value: `${s.lastWicket.text} at ${s.lastWicket.score}, ball ${s.lastWicket.ballLabel}`,
      eventIds: [s.lastWicket.eventId],
    });
  }
  return facts;
}

function windowFacts(chase: Chase, i: IntervalSummary, window: Delivery[]): FactInput[] {
  const rate = i.legalBalls > 0 ? ` (${formatRate((i.runs * 6) / i.legalBalls)} per over)` : "";
  return [
    {
      id: "F_INT_WINDOW",
      type: "window",
      chip: "Catch-up window",
      label: "Catch-up window",
      value: `${plural(i.deliveries, "delivery", "deliveries")}, ${plural(i.legalBalls, "legal ball")} (${formatOvers(i.legalBalls)} overs), from ${i.before.runs}/${i.before.wickets} to ${i.after.runs}/${i.after.wickets}`,
    },
    { id: "F_INT_RUNS", type: "window_runs", chip: "Runs in window", label: "Runs scored", value: `${i.runs}${rate}` },
    {
      id: "F_INT_WICKETS",
      type: "window_wickets",
      chip: "Wickets in window",
      label: "Wickets lost",
      value: plural(i.wickets, "wicket"),
      eventIds: i.wicketIds,
    },
    {
      id: "F_INT_BOUNDARIES",
      type: "window_boundaries",
      chip: "Boundaries in window",
      label: "Boundaries",
      value: `${plural(i.fourIds.length, "four")}, ${plural(i.sixIds.length, "six", "sixes")}`,
      eventIds: [...i.fourIds, ...i.sixIds],
    },
    {
      id: "F_INT_EXTRAS",
      type: "window_extras",
      chip: "Extras in window",
      label: "Extras conceded",
      value: `${i.extras.total} (wides ${i.extras.wides}, no-balls ${i.extras.noballs}, byes ${i.extras.byes}, leg-byes ${i.extras.legbyes})`,
      eventIds: window.filter((d) => d.extrasTotal > 0).map((d) => d.id),
    },
    {
      id: "F_INT_EQUATION",
      type: "equation_change",
      chip: "Equation change",
      label: "Chase equation",
      // Each half is labelled with its own checkpoint so it cannot be read as the other.
      value: `at ${i.before.overs} ov: ${equation(i.before)}; at ${i.after.overs} ov: ${equation(i.after)}`,
    },
    {
      id: "F_INT_BATTING",
      type: "window_batting",
      chip: "Batting in window",
      label: `${chase.battingTeam} batting`,
      value: i.batters.map((b) => `${b.name} ${b.runs} off ${plural(b.balls, "ball")}`).join("; ") || "none",
    },
    {
      id: "F_INT_BOWLING",
      type: "window_bowling",
      chip: "Bowling in window",
      label: `${chase.bowlingTeam} bowling`,
      value: i.bowlers.map((b) => `${b.name} ${b.overs} overs, ${b.runs} runs, ${plural(b.wickets, "wicket")}`).join("; ") || "none",
    },
  ];
}

/** The text shown to fans for a fact: label, the checkpoint/interval it describes, and its value. */
export function factStatement(f: Fact): string {
  return f.scope === "match" ? `${f.label}: ${f.value}` : `${f.label} (${f.scopeLabel}): ${f.value}`;
}

export function deliveryLine(d: Delivery): string {
  return `${d.id} | ${d.ballLabel} | ${d.bowler} to ${d.batter} | ${describeDelivery(d)} | kinds: ${eventKinds(d).join(", ")}`;
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
  const past = deliveriesUpTo(chase, viewingSeq);
  const interval = lastSeenSeq < viewingSeq ? intervalBetween(chase, lastSeenSeq, viewingSeq) : null;
  const window = deliveriesBetween(chase, lastSeenSeq, viewingSeq);
  const nowLabel = viewingSeq === 0 ? "at the start of the chase" : `as of ${snapshot.overs} ov`;

  const f = chase.firstInnings;
  const facts: Fact[] = [
    ...scoped("match", "match", [
      {
        id: "F_TARGET",
        type: "target",
        chip: "Target",
        label: "Target",
        value: `${chase.target} (${f.team} scored ${f.runs}/${f.wickets} in 20 overs; target = ${f.runs} + 1)`,
      },
    ]),
    ...scoped("now", nowLabel, nowFacts(chase, snapshot, past)),
  ];
  if (interval) {
    facts.push(
      ...scoped("then", `when you left, ${interval.before.overs} ov`, [
        {
          id: "F_THEN_SCORE",
          type: "score",
          chip: "Score when you left",
          label: "Score",
          value: `${chase.battingTeam} ${interval.before.runs}/${interval.before.wickets} after ${interval.before.overs} overs; ${equation(interval.before)}`,
        },
      ]),
      ...scoped("window", `${interval.before.overs}–${interval.after.overs} ov`, windowFacts(chase, interval, window)),
    );
  }

  // Catch-up sees the window's deliveries; questions may refer to anything that has happened so far.
  const deliveries = op === "catchup" ? window : past;
  const citableEvents = new Map<string, Delivery>(deliveries.map((d) => [d.id, d]));
  const pastById = new Map(past.map((d) => [d.id, d]));
  for (const fact of facts) for (const id of fact.eventIds) citableEvents.set(id, pastById.get(id)!);

  const evidence = new Map<string, EvidenceItem>();
  for (const fact of facts) {
    evidence.set(fact.id, {
      id: fact.id,
      kind: "fact",
      chip: fact.chip,
      title: fact.scope === "match" ? fact.label : `${fact.label} (${fact.scopeLabel})`,
      detail: fact.value,
    });
  }
  for (const d of [...citableEvents.values()].sort((a, b) => a.seq - b.seq)) evidence.set(d.id, eventEvidence(d));

  const asOf = asOfFor(chase, lastSeenSeq, viewingSeq);
  const payload = {
    replay: "Historical match replay. Only deliveries up to the viewing checkpoint are included.",
    match: {
      competition: chase.competition,
      venue: chase.venue,
      date: chase.date,
      batting_team: chase.battingTeam,
      bowling_team: chase.bowlingTeam,
    },
    checkpoints: {
      fan_last_saw: asOf.lastSeenLabel,
      viewing_now: asOf.viewingLabel,
      window: interval ? "deliveries after fan_last_saw up to and including viewing_now" : "no new deliveries",
    },
    facts: facts.map((x) => ({ id: x.id, type: x.type, scope: x.scopeLabel, label: x.label, value: x.value, event_ids: x.eventIds })),
    deliveries_scope: op === "catchup" ? "deliveries in the catch-up window" : "every delivery of the chase so far",
    deliveries: deliveries.map(deliveryLine),
  };

  return {
    op,
    asOf,
    snapshot,
    interval,
    facts,
    factsById: new Map(facts.map((x) => [x.id, x])),
    deliveries,
    citableEvents,
    payload,
    evidence,
  };
}
