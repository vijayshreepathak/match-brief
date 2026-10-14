import { formatRate } from "@/lib/cricket/engine";
import type { ReplayView } from "@/lib/match/view";

export function Scoreboard({ view }: { view: ReplayView }) {
  const s = view.snapshot;
  const team = view.match.battingTeam;
  const atCrease = s.batters.filter((b) => !b.out);
  const lastEvent = view.events.at(-1);
  const bowler = lastEvent ? s.bowlers.find((b) => b.name === lastEvent.bowler) : undefined;
  const recent = view.events.slice(-8);

  return (
    <section aria-labelledby="score-heading" className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
      <h2 id="score-heading" className="sr-only">
        Scorecard
      </h2>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-slate-300">{team} chasing {view.match.target}</p>
        <p className="text-sm text-slate-300">{view.match.firstInnings}</p>
      </div>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-3" data-testid="score">
        <span className="text-4xl font-bold tracking-tight">
          {s.runs}/{s.wickets}
        </span>
        <span className="text-lg text-slate-300">({s.overs} ov)</span>
      </p>

      <p className="mt-2 text-lg font-semibold text-emerald-300" data-testid="equation" aria-live="polite">
        {s.inningsComplete
          ? s.resultText
          : `Need ${s.runsNeeded} off ${s.ballsRemaining} ball${s.ballsRemaining === 1 ? "" : "s"}`}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Run rate", formatRate(s.currentRunRate)],
          ["Required", formatRate(s.requiredRunRate)],
          ["Wkts in hand", String(10 - s.wickets)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-800 px-2 py-2">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-1 text-sm">
        <p>
          <span className="text-slate-400">Batting: </span>
          {s.seq === 0
            ? "openers yet to face"
            : atCrease.map((b) => `${b.name} ${b.runs}* (${b.balls})`).join(" · ")}
          {s.seq > 0 && !s.inningsComplete && atCrease.length < 2 ? " · new batter yet to face" : ""}
        </p>
        {bowler && (
          <p>
            <span className="text-slate-400">Last ball bowled by: </span>
            {bowler.name} ({bowler.overs} ov, {bowler.runs} runs, {bowler.wickets} wkt{bowler.wickets === 1 ? "" : "s"})
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-slate-400">Recent deliveries (oldest to newest)</p>
          <ol className="mt-1 flex flex-wrap gap-1.5">
            {recent.map((e) => (
              <li
                key={e.id}
                title={`${e.ballLabel}: ${e.description}`}
                aria-label={`${e.ballLabel}: ${e.description}`}
                className={`min-w-9 rounded-md px-1.5 py-1 text-center text-xs font-semibold ${
                  e.isWicket
                    ? "bg-red-500 text-white"
                    : e.isBoundary
                      ? "bg-emerald-400 text-slate-950"
                      : e.isExtra
                        ? "bg-amber-300 text-slate-950"
                        : "bg-slate-700 text-white"
                }`}
              >
                {e.symbol}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
