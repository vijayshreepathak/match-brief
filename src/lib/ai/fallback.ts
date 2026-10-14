import { formatOvers, formatRate } from "@/lib/cricket/engine";
import type { Chase } from "@/lib/cricket/types";
import { factStatement, type ModelContext } from "./context";
import type { AnswerResult, BoundFact, CatchUpRecap } from "./types";

// Rule-based text built only from calculated facts. Always labelled as fallback in the UI.

function statements(ctx: ModelContext, ids: string[]): BoundFact[] {
  return ids.flatMap((id) => {
    const fact = ctx.factsById.get(id);
    return fact ? [{ id, statement: factStatement(fact) }] : [];
  });
}

function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

function requirement(chase: Chase, ctx: ModelContext): string {
  const s = ctx.snapshot;
  if (s.inningsComplete) return `The chase is complete: ${s.resultText}.`;
  return `${chase.battingTeam} need ${s.runsNeeded} off ${plural(s.ballsRemaining, "ball")} (${formatRate(s.requiredRunRate)} per over) with ${plural(chase.maxWickets - s.wickets, "wicket")} in hand.`;
}

export function noChangeRecap(chase: Chase, ctx: ModelContext): CatchUpRecap {
  return {
    headline: "Nothing new since you left",
    whatChanged: [
      {
        text: `No deliveries have been bowled since ${ctx.asOf.lastSeenLabel}. The score is still ${ctx.snapshot.runs}/${ctx.snapshot.wickets}.`,
        facts: [],
        evidence: ["F_SCORE"],
      },
    ],
    whyItMatters: { kind: "calculated", text: "The chase equation has not moved.", facts: [], evidence: ["F_RUNS_NEEDED"] },
    watchNext: { text: requirement(chase, ctx), facts: [], evidence: ["F_RUNS_NEEDED", "F_BALLS_LEFT", "F_RRR"] },
  };
}

export function fallbackRecap(chase: Chase, ctx: ModelContext): CatchUpRecap {
  const i = ctx.interval;
  if (!i) return noChangeRecap(chase, ctx);
  const team = chase.battingTeam;

  const whatChanged: CatchUpRecap["whatChanged"] = [
    {
      text: `${team} scored ${i.runs} for ${plural(i.wickets, "wicket")} in ${formatOvers(i.legalBalls)} overs, moving from ${i.before.runs}/${i.before.wickets} to ${i.after.runs}/${i.after.wickets}.`,
      facts: [],
      evidence: ["F_INT_WINDOW", "F_INT_RUNS", "F_INT_WICKETS"],
    },
  ];
  if (i.wickets > 0) {
    const outs = ctx.deliveries
      .filter((d) => d.dismissals.length)
      .flatMap((d) => d.dismissals.map((w) => `${w.playerOut} (${d.ballLabel})`));
    whatChanged.push({ text: `Wickets: ${outs.join(", ")}.`, facts: [], evidence: i.wicketIds.slice(0, 10) });
  }
  if (i.fourIds.length + i.sixIds.length > 0) {
    whatChanged.push({
      text: `Boundaries: ${plural(i.fourIds.length, "four")} and ${plural(i.sixIds.length, "six", "sixes")}.`,
      facts: [],
      evidence: ["F_INT_BOUNDARIES"],
    });
  }
  if (i.extras.total > 0 && whatChanged.length < 4) {
    whatChanged.push({ text: `Extras added ${i.extras.total}.`, facts: [], evidence: ["F_INT_EXTRAS"] });
  }

  const before = i.before;
  const after = i.after;
  const whyText = after.inningsComplete
    ? `The chase ended in this window: ${after.resultText}.`
    : `The requirement moved from ${before.runsNeeded} off ${before.ballsRemaining} (${formatRate(before.requiredRunRate)} per over) to ${after.runsNeeded} off ${after.ballsRemaining} (${formatRate(after.requiredRunRate)} per over).`;

  return {
    headline: `${team} ${i.runs}/${i.wickets} since you left`,
    whatChanged,
    whyItMatters: { kind: "calculated", text: whyText, facts: [], evidence: ["F_INT_EQUATION"] },
    watchNext: {
      text: requirement(chase, ctx),
      facts: [],
      evidence: after.inningsComplete ? ["F_STATUS"] : ["F_RUNS_NEEDED", "F_BALLS_LEFT", "F_RRR"],
    },
  };
}

const UNSUPPORTED = /\b(injur\w*|hurt|fitness|fit|pitch|weather|dew|crowd|umpire|why was|reason|captain think|plan|intend\w*|feel\w*)\b/i;
const PREDICTION =
  /\b(who (?:will )?wins?|who won|winner|result|will (?:they|\w+) win|going to win|predict\w*|chances?|probabilit\w*|odds|bet\w*|fantasy)\b/i;

const TOPICS: { pattern: RegExp; ids: string[] }[] = [
  { pattern: /\b(extra|extras|wide|wides|no-?balls?|byes?|leg-?byes?)\b/i, ids: ["F_EXTRAS", "F_INT_EXTRAS"] },
  { pattern: /\b(need|needs|required|target|equation|rate|chase|win|how many runs)\b/i, ids: ["F_RUNS_NEEDED", "F_BALLS_LEFT", "F_RRR"] },
  { pattern: /\b(wickets?|out|dismiss\w*)\b/i, ids: ["F_LAST_WICKET", "F_INT_WICKETS", "F_WICKETS_LEFT"] },
  { pattern: /\b(partnership|stand)\b/i, ids: ["F_PARTNERSHIP"] },
  { pattern: /\b(boundar\w*|fours?|sixes|six)\b/i, ids: ["F_BOUNDARIES", "F_INT_BOUNDARIES"] },
  { pattern: /\b(bowl\w*|economy|spell)\b/i, ids: ["F_BOWLING"] },
  { pattern: /\b(bat\w*|scor\w*|runs|top)\b/i, ids: ["F_BATTING"] },
];

export function fallbackAnswer(question: string, ctx: ModelContext): AnswerResult {
  if (PREDICTION.test(question) && !ctx.snapshot.inningsComplete) {
    return {
      status: "declined",
      text: "The result is not known at this checkpoint, and MatchBrief does not predict outcomes.",
      facts: statements(ctx, ["F_STATUS"]),
      evidence: ["F_STATUS"],
    };
  }
  if (UNSUPPORTED.test(question)) {
    return {
      status: "not_in_data",
      text: "That is not available in the supplied match data. The replay records deliveries, runs, extras, and dismissals, but not injuries, conditions, intentions, or the reasons for umpiring calls.",
      facts: [],
      evidence: [],
    };
  }
  const ids = new Set<string>();
  for (const topic of TOPICS) if (topic.pattern.test(question)) topic.ids.forEach((id) => ids.add(id));
  if (ids.size === 0) ["F_SCORE", "F_RUNS_NEEDED", "F_BALLS_LEFT"].forEach((id) => ids.add(id));
  const available = [...ids].filter((id) => ctx.factsById.has(id)).slice(0, 4);
  return {
    status: "facts_only",
    text: "The fallback cannot interpret questions, so here are the calculated facts closest to it.",
    facts: statements(ctx, available),
    evidence: available,
  };
}
