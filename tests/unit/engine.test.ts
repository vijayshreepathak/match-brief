import { describe, expect, it } from "vitest";
import {
  CheckpointError,
  deliveriesBetween,
  endOfOver,
  formatOvers,
  intervalBetween,
  lastSeenOptions,
  runRate,
  snapshotAt,
  stepTarget,
} from "@/lib/cricket/engine";
import { buildReplayView } from "@/lib/match/view";
import { loadChase } from "../support/fixture";

const chase = loadChase();
const at = (over: number) => snapshotAt(chase, endOfOver(chase, over));

describe("overs and rates", () => {
  it("formats legal balls as overs notation, not decimals", () => {
    expect(formatOvers(0)).toBe("0.0");
    expect(formatOvers(5)).toBe("0.5");
    expect(formatOvers(6)).toBe("1.0");
    expect(formatOvers(104)).toBe("17.2");
    expect(formatOvers(120)).toBe("20.0");
  });

  it("computes run rates from legal balls and avoids division by zero", () => {
    expect(runRate(0, 0)).toBeNull();
    // 17.4 overs is 106 legal balls, not 17.4 overs as a decimal.
    expect(runRate(106, 106)).toBe(6);
    expect(runRate(129, 108)).toBeCloseTo(7.1667, 4);
  });
});

describe("known score checkpoints", () => {
  it("start of the chase", () => {
    const s = snapshotAt(chase, 0);
    expect(s).toMatchObject({ runs: 0, wickets: 0, legalBalls: 0, overs: "0.0", runsNeeded: 160, ballsRemaining: 120 });
    expect(s.currentRunRate).toBeNull();
    expect(s.requiredRunRate).toBe(8);
    expect(s.status).toBe("in_progress");
    expect(s.label).toBe("Start of chase (0.0 ov)");
  });

  it.each([
    [7, "33/4", 127, 78],
    [10, "45/4", 115, 60],
    [12, "74/4", 86, 48],
    [15, "100/4", 60, 30],
    [18, "129/4", 31, 12],
    [19, "144/4", 16, 6],
  ])("end of over %i is %s needing %i off %i", (over, score, needed, balls) => {
    const s = at(over);
    expect(`${s.runs}/${s.wickets}`).toBe(score);
    expect(s.runsNeeded).toBe(needed);
    expect(s.ballsRemaining).toBe(balls);
    expect(s.overs).toBe(`${over}.0`);
  });

  it("calculates current and required run rates at the end of over 18", () => {
    const s = at(18);
    expect(s.currentRunRate).toBeCloseTo(129 / 18, 6);
    expect(s.requiredRunRate).toBeCloseTo(15.5, 6);
  });

  it("final state: chase complete, no negative or undefined maths", () => {
    const s = snapshotAt(chase, 125);
    expect(s.runsNeeded).toBe(0);
    expect(s.ballsRemaining).toBe(0);
    expect(s.requiredRunRate).toBeNull();
    expect(s.inningsComplete).toBe(true);
    expect(s.extras).toEqual({ wides: 6, noballs: 1, byes: 3, legbyes: 1, total: 11 });
  });
});

describe("deliveries versus legal balls", () => {
  it("over 16 has seven deliveries because of a wide, but six legal balls", () => {
    const over16 = chase.deliveries.filter((d) => d.overIndex === 15);
    expect(over16).toHaveLength(7);
    expect(over16.filter((d) => d.isLegal)).toHaveLength(6);
    expect(over16.find((d) => !d.isLegal)?.extras.wides).toBe(3);
    expect(at(16).legalBalls).toBe(96);
  });

  it("the final over has nine deliveries: a no-ball and two wides share ball labels", () => {
    const last = chase.deliveries.filter((d) => d.overIndex === 19);
    expect(last.map((d) => `${d.id}:${d.ballLabel}:${d.isLegal ? "L" : "X"}`)).toEqual([
      "E117:19.1:L",
      "E118:19.2:L",
      "E119:19.3:L",
      "E120:19.4:X",
      "E121:19.4:X",
      "E122:19.4:L",
      "E123:19.5:L",
      "E124:19.6:X",
      "E125:19.6:L",
    ]);
    expect(chase.deliveries[119].extras.noballs).toBe(1);
    expect(chase.deliveries[119].batterRuns).toBe(6);
    expect(chase.deliveries[121].extras.byes).toBe(3);
    expect(chase.deliveries[122].dismissals[0].kind).toBe("stumped");
  });

  it("a no-ball counts as a ball faced; a wide does not", () => {
    const kohli = (seq: number) => snapshotAt(chase, seq).batters.find((b) => b.name === "V Kohli")!;
    expect(kohli(120).balls).toBe(kohli(119).balls + 1); // no-ball, hit for six
    expect(kohli(120).runs).toBe(kohli(119).runs + 6);
    expect(kohli(121).balls).toBe(kohli(120).balls); // wide
  });

  it("byes are not charged to the bowler, wides and no-balls are", () => {
    const nawaz = (seq: number) => snapshotAt(chase, seq).bowlers.find((b) => b.name === "Mohammad Nawaz")!;
    expect(nawaz(120).runs - nawaz(119).runs).toBe(7); // 6 + no-ball
    expect(nawaz(121).runs - nawaz(120).runs).toBe(1); // wide
    expect(nawaz(122).runs - nawaz(121).runs).toBe(0); // 3 byes
    expect(nawaz(123).wickets - nawaz(122).wickets).toBe(1); // stumping credited to bowler
  });

  it("a run out is not credited to the bowler", () => {
    const shadab = snapshotAt(chase, endOfOver(chase, 7)).bowlers.find((b) => b.name === "Shadab Khan")!;
    expect(chase.deliveries[36].dismissals[0].kind).toBe("run out");
    expect(shadab.wickets).toBe(0);
  });
});

describe("catch-up interval boundaries", () => {
  it("covers deliveries after last-seen up to and including viewing", () => {
    const from = endOfOver(chase, 10);
    const to = endOfOver(chase, 18);
    const window = deliveriesBetween(chase, from, to);
    expect(window[0].id).toBe(`E${from + 1}`);
    expect(window.at(-1)!.id).toBe(`E${to}`);
    const i = intervalBetween(chase, from, to);
    expect(i).toMatchObject({ deliveries: 50, legalBalls: 48, runs: 84, wickets: 0 });
    expect(i.fourIds).toHaveLength(7);
    expect(i.sixIds).toEqual(["E67", "E70", "E72"]);
    expect(i.before.runsNeeded).toBe(115);
    expect(i.after.runsNeeded).toBe(31);
  });

  it("captures a wicket-heavy start", () => {
    const i = intervalBetween(chase, 0, endOfOver(chase, 7));
    expect(i.wickets).toBe(4);
    expect(i.wicketIds).toEqual(["E11", "E20", "E33", "E37"]);
  });

  it("is empty when nothing new has happened", () => {
    const seq = endOfOver(chase, 18);
    const i = intervalBetween(chase, seq, seq);
    expect(i).toMatchObject({ deliveries: 0, legalBalls: 0, runs: 0, wickets: 0 });
  });

  it.each([
    [-1, 10],
    [0, 126],
    [1.5, 10],
    [Number.NaN, 10],
  ])("rejects invalid checkpoints (%s, %s)", (from, to) => {
    expect(() => intervalBetween(chase, from, to)).toThrow(CheckpointError);
  });

  it("rejects reversed intervals", () => {
    expect(() => intervalBetween(chase, 110, 60)).toThrow(/must not be after/);
  });
});

describe("replay navigation", () => {
  it("steps by ball and over without going past the end", () => {
    expect(stepTarget(chase, 110, "next-ball")).toBe(111);
    expect(stepTarget(chase, 110, "next-over")).toBe(116);
    expect(stepTarget(chase, 116, "next-over")).toBe(125);
    expect(stepTarget(chase, 125, "next-ball")).toBe(125);
    expect(stepTarget(chase, 125, "next-over")).toBe(125);
  });

  it("rewinds to the previous completed over or the start", () => {
    expect(stepTarget(chase, 113, "prev-over")).toBe(110);
    expect(stepTarget(chase, 110, "prev-over")).toBe(103);
    expect(stepTarget(chase, 3, "prev-over")).toBe(0);
    expect(stepTarget(chase, 90, "start")).toBe(0);
  });

  it("offers last-seen options only up to the viewing checkpoint", () => {
    const options = lastSeenOptions(chase, 113);
    expect(options[0].seq).toBe(0);
    expect(options.at(-1)!.seq).toBe(110);
    expect(options.every((o) => o.seq <= 113)).toBe(true);
    expect(lastSeenOptions(chase, 0)).toHaveLength(1);
  });

  it("the browser view contains only past deliveries", () => {
    const view = buildReplayView(chase, 110);
    expect(view.events).toHaveLength(110);
    expect(view.events.at(-1)!.id).toBe("E110");
    expect(view.canAdvance).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/KD Karthik|R Ashwin|E111\b|player_of_match|won by/);
    expect(buildReplayView(chase, 125).canAdvance).toBe(false);
  });
});
