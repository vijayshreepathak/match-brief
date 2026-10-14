import {
  describeDelivery,
  deliveriesUpTo,
  deliverySymbol,
  lastSeenOptions,
  lastSeq,
  snapshotAt,
  type CheckpointOption,
} from "@/lib/cricket/engine";
import type { Chase, Snapshot } from "@/lib/cricket/types";

// Everything the browser is allowed to see at one viewing checkpoint.

export interface EventView {
  id: string;
  seq: number;
  ballLabel: string;
  bowler: string;
  batter: string;
  totalRuns: number;
  symbol: string;
  description: string;
  isWicket: boolean;
  isBoundary: boolean;
  isExtra: boolean;
}

export interface MatchInfo {
  title: string;
  competition: string;
  venue: string;
  date: string;
  battingTeam: string;
  bowlingTeam: string;
  target: number;
  firstInnings: string;
}

export interface ReplayView {
  match: MatchInfo;
  viewing: { seq: number; label: string };
  snapshot: Snapshot;
  /** Deliveries up to and including the viewing checkpoint, oldest first. */
  events: EventView[];
  lastSeenOptions: CheckpointOption[];
  canAdvance: boolean;
}

export function matchInfo(chase: Chase): MatchInfo {
  const f = chase.firstInnings;
  return {
    title: `${chase.battingTeam} chasing ${chase.target} v ${chase.bowlingTeam}`,
    competition: chase.competition,
    venue: chase.venue,
    date: chase.date,
    battingTeam: chase.battingTeam,
    bowlingTeam: chase.bowlingTeam,
    target: chase.target,
    firstInnings: `${f.team} ${f.runs}/${f.wickets} (20 ov)`,
  };
}

export function buildReplayView(chase: Chase, seq: number): ReplayView {
  const snapshot = snapshotAt(chase, seq);
  return {
    match: matchInfo(chase),
    viewing: { seq, label: snapshot.label },
    snapshot,
    events: deliveriesUpTo(chase, seq).map((d) => ({
      id: d.id,
      seq: d.seq,
      ballLabel: d.ballLabel,
      bowler: d.bowler,
      batter: d.batter,
      totalRuns: d.totalRuns,
      symbol: deliverySymbol(d),
      description: describeDelivery(d),
      isWicket: d.dismissals.length > 0,
      isBoundary: d.boundary !== null,
      isExtra: d.extrasTotal > 0,
    })),
    lastSeenOptions: lastSeenOptions(chase, seq),
    // Derivable from the past alone: the chase is over or it is not.
    canAdvance: seq < lastSeq(chase) && !snapshot.inningsComplete,
  };
}
