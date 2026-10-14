import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotAt } from "@/lib/cricket/engine";
import { FixtureError, normalizeCricsheetMatch } from "@/lib/cricket/normalize";
import { FIXTURE_PATH, loadChase, loadRawFixture } from "../support/fixture";

type Raw = ReturnType<typeof loadRawFixture> & {
  info: Record<string, unknown> & { outcome: Record<string, unknown> };
  innings: { team: string; overs: { over: number; deliveries: Record<string, unknown>[] }[]; target?: { runs: number; overs: number } }[];
};

const raw = () => loadRawFixture() as Raw;

describe("bundled Cricsheet fixture", () => {
  it("matches the checksum recorded in the data manifest", () => {
    const manifest = JSON.parse(readFileSync(path.join(path.dirname(FIXTURE_PATH), "manifest.json"), "utf8"));
    const sha = createHash("sha256").update(readFileSync(FIXTURE_PATH)).digest("hex");
    expect(sha).toBe(manifest.sha256);
  });

  it("normalizes into a chase with unique sequential delivery IDs", () => {
    const chase = loadChase();
    expect(chase.battingTeam).toBe("India");
    expect(chase.bowlingTeam).toBe("Pakistan");
    expect(chase.deliveries).toHaveLength(125);
    const ids = chase.deliveries.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    chase.deliveries.forEach((d, i) => {
      expect(d.seq).toBe(i + 1);
      expect(d.id).toBe(`E${i + 1}`);
    });
  });

  it("sets the target to the first-innings total + 1 and agrees with Cricsheet's target", () => {
    const chase = loadChase();
    expect(chase.firstInnings).toEqual({ team: "Pakistan", runs: 159, wickets: 8, legalBalls: 120 });
    expect(chase.target).toBe(160);
    expect(raw().innings[1].target).toEqual({ runs: 160, overs: 20 });
  });

  it("reconciles the computed final score with Cricsheet's recorded outcome", () => {
    const chase = loadChase();
    const final = snapshotAt(chase, chase.deliveries.length);
    expect(`${final.runs}/${final.wickets}`).toBe("160/6");
    expect(final.overs).toBe("20.0");
    expect(final.status).toBe("won");
    // Outcome metadata is read here, in the test only, never by the app.
    const outcome = raw().info.outcome as { winner: string; by: { wickets: number } };
    expect(outcome.winner).toBe(chase.battingTeam);
    expect(chase.maxWickets - final.wickets).toBe(outcome.by.wickets);
    expect(final.resultText).toContain("won by 4 wickets");
  });

  it("never copies outcome, player of the match, or toss into the normalized data", () => {
    const text = JSON.stringify(loadChase());
    for (const leak of ["player_of_match", "outcome", "winner", "toss", "registry"]) {
      expect(text).not.toContain(leak);
    }
  });
});

describe("fixture validation rejects unsupported matches", () => {
  const variants: [string, (r: Raw) => void, RegExp][] = [
    ["a DLS result", (r) => (r.info.outcome.method = "D/L"), /D\/L/],
    ["a Super Over", (r) => (r.info.outcome.eliminator = "India"), /Super Over/],
    ["a no result", (r) => (r.info.outcome = { result: "no result" }), /no result/],
    ["a reduced-overs target", (r) => (r.innings[1].target = { runs: 160, overs: 18 }), /reduced overs/],
    ["a target that is not first innings + 1", (r) => (r.innings[1].target = { runs: 150, overs: 20 }), /does not equal/],
    ["a 50-over match", (r) => (r.info.overs = 50), /20-over/],
    [
      "an unsupported dismissal",
      (r) => (r.innings[1].overs[0].deliveries[0].wickets = [{ kind: "retired hurt", player_out: "KL Rahul" }]),
      /retired hurt/,
    ],
    [
      "penalty runs",
      (r) => {
        const d = r.innings[1].overs[0].deliveries[0] as { runs: { extras: number; total: number }; extras?: object };
        d.extras = { penalty: 5 };
        d.runs.extras = 5;
        d.runs.total += 5;
      },
      /penalty/,
    ],
    [
      "deliveries after the chase ended",
      (r) => {
        const last = r.innings[1].overs.at(-1)!;
        last.deliveries.push(structuredClone(last.deliveries[0]));
      },
      /after the chase ended/,
    ],
  ];

  it.each(variants)("rejects %s", (_name, mutate, message) => {
    const r = raw();
    mutate(r);
    expect(() => normalizeCricsheetMatch(r, "test")).toThrow(FixtureError);
    expect(() => normalizeCricsheetMatch(r, "test")).toThrow(message);
  });
});

describe("ordinary extras are not confused with penalty runs", () => {
  it("accepts the fixture's wides, no-balls, byes and leg-byes", () => {
    const chase = loadChase();
    const kinds = new Set(chase.deliveries.flatMap((d) => Object.entries(d.extras).filter(([, n]) => n > 0).map(([k]) => k)));
    expect([...kinds].sort()).toEqual(["byes", "legbyes", "noballs", "wides"]);
  });

  it("treats an explicit zero penalty as no penalty", () => {
    const r = raw();
    const d = r.innings[1].overs[0].deliveries[0] as { extras?: object };
    d.extras = { penalty: 0 };
    expect(() => normalizeCricsheetMatch(r, "test")).not.toThrow();
  });
});
