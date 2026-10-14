import { MatchBrief } from "@/components/MatchBrief";
import { defaultCheckpoints, getChase } from "@/lib/match/fixture.server";
import { buildReplayView } from "@/lib/match/view";

export default function Home() {
  const chase = getChase();
  const { viewingSeq, lastSeenSeq } = defaultCheckpoints(chase);
  // Only the view at the default checkpoint (past deliveries) is sent to the browser.
  const view = buildReplayView(chase, viewingSeq);

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 pb-5 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">MatchBrief</h1>
          <span
            role="note"
            className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-950"
          >
            Historical match replay — not live data
          </span>
        </div>
        <p className="mt-1 text-lg font-semibold text-emerald-800">Missed a few overs? Understand what changed.</p>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">
          Tell MatchBrief when you stopped watching. It explains what changed in the chase, why it matters, and what to
          watch next, with links to the deliveries and calculations behind each point.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          {view.match.competition} · {view.match.venue} · {view.match.date} · Ball-by-ball data:{" "}
          <a className="underline" href="https://cricsheet.org/" target="_blank" rel="noreferrer">
            Cricsheet
          </a>{" "}
          (ODC-By 1.0)
        </p>
      </header>

      <MatchBrief initialView={view} initialLastSeenSeq={lastSeenSeq} />

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 text-xs text-slate-600">
          <p>
            Independent assignment prototype. Not affiliated with or endorsed by Dream11, the ICC, or either team.
          </p>
          <p>
            Ball-by-ball data from{" "}
            <a className="underline" href="https://cricsheet.org/" target="_blank" rel="noreferrer">
              Cricsheet
            </a>{" "}
            (match 1298150), used under the{" "}
            <a className="underline" href="https://opendatacommons.org/licenses/by/1-0/" target="_blank" rel="noreferrer">
              Open Data Commons Attribution License v1.0
            </a>
            . Scores are calculated in code; the AI writes the wording. Checks reduce errors but cannot catch every wrong interpretation.
          </p>
        </div>
      </footer>
    </div>
  );
}
