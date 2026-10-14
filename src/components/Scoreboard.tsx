import { formatRate } from "@/lib/cricket/engine";
import type { EventView, ReplayView } from "@/lib/match/view";

// Match summary: every value comes from the server-built view; nothing is recalculated here.

function badgeClass(e: EventView): string {
  if (e.isWicket) return "border-danger-border bg-danger-bg text-danger-fg";
  if (e.isBoundary) return "border-success-border bg-success-bg text-success-fg";
  if (e.isExtra) return "border-warning-border bg-warning-bg text-warning-fg";
  return "border-border bg-surface-muted text-foreground";
}

export function Scoreboard({ view }: { view: ReplayView }) {
  const s = view.snapshot;
  const m = view.match;
  const atCrease = s.batters.filter((b) => !b.out);
  const lastEvent = view.events.at(-1);
  const bowler = lastEvent ? s.bowlers.find((b) => b.name === lastEvent.bowler) : undefined;
  const recent = view.events.slice(-8);
  const stats: [string, string][] = [
    ["Run rate", formatRate(s.currentRunRate)],
    ["Required rate", formatRate(s.requiredRunRate)],
    ["Wickets in hand", String(10 - s.wickets)],
  ];

  return (
    <div>
      <h2 id="score-heading" className="sr-only">
        Match summary
      </h2>
      <p className="px-4 pt-3 text-xs text-muted">
        {m.competition} · {m.venue} · {m.date}
      </p>

      <div className="grid gap-3 p-4 pt-2 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="rounded-xl bg-ink px-4 py-3 text-ink-foreground md:min-w-[13rem]">
          <p className="text-sm font-semibold text-ink-muted">
            {m.battingTeam} <span className="font-normal">chasing {m.target}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2" data-testid="score">
            <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">
              {s.runs}/{s.wickets}
            </span>
            <span className="text-base text-ink-muted tabular-nums">({s.overs} ov)</span>
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xl font-bold leading-snug text-primary tabular-nums" data-testid="equation" aria-live="polite">
            {s.inningsComplete
              ? s.resultText
              : `Need ${s.runsNeeded} off ${s.ballsRemaining} ball${s.ballsRemaining === 1 ? "" : "s"}`}
          </p>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            Target {m.target} · {m.firstInnings}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 md:col-span-2 lg:col-span-1">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface-muted px-3 py-2 lg:min-w-[6.5rem]">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-lg font-bold leading-tight tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-3 border-t border-border px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="tabular-nums">
            <span className="text-muted">Batting: </span>
            {s.seq === 0 ? "openers yet to face" : atCrease.map((b) => `${b.name} ${b.runs}* (${b.balls})`).join(" · ")}
            {s.seq > 0 && !s.inningsComplete && atCrease.length < 2 ? " · new batter yet to face" : ""}
          </p>
          {bowler && (
            <p className="tabular-nums">
              <span className="text-muted">Last ball bowled by: </span>
              {bowler.name} ({bowler.overs} ov, {bowler.runs} runs, {bowler.wickets} wkt{bowler.wickets === 1 ? "" : "s"})
            </p>
          )}
        </div>

        {recent.length > 0 && (
          <div className="min-w-0">
            <p className="text-xs text-muted" id="recent-heading">
              Recent deliveries, oldest to newest (W wicket · wd wide · nb no-ball · b/lb byes)
            </p>
            <ol aria-labelledby="recent-heading" className="mt-1 flex flex-wrap gap-1.5">
              {recent.map((e) => (
                <li
                  key={e.id}
                  title={`${e.ballLabel}: ${e.description}`}
                  aria-label={`${e.ballLabel}: ${e.description}`}
                  className={`min-w-9 rounded-md border px-1.5 py-1 text-center text-xs font-bold tabular-nums ${badgeClass(e)}`}
                >
                  {e.symbol}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
