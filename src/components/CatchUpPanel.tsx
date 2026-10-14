"use client";

import type { CatchUpResponse } from "@/lib/ai/types";
import type { ReplayView } from "@/lib/match/view";
import { EvidenceChips, EvidencePanel, useEvidenceFocus } from "./Evidence";
import { AsOfLabel, FactLines, ModeBadge } from "./ResponseMeta";

export type RecapState =
  | { status: "idle"; notice?: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: CatchUpResponse };

export function CatchUpPanel({
  view,
  lastSeenSeq,
  onLastSeenChange,
  recap,
  onCatchUp,
}: {
  view: ReplayView;
  lastSeenSeq: number;
  onLastSeenChange: (seq: number) => void;
  recap: RecapState;
  onCatchUp: () => void;
}) {
  const loading = recap.status === "loading";
  return (
    <section aria-labelledby="catchup-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 id="catchup-heading" className="text-lg font-bold text-slate-900">
        Catch up
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <label htmlFor="last-seen" className="block text-sm font-medium text-slate-800">
            I last watched until…
          </label>
          <select
            id="last-seen"
            value={lastSeenSeq}
            onChange={(e) => onLastSeenChange(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {view.lastSeenOptions.map((o) => (
              <option key={o.seq} value={o.seq}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onCatchUp}
          disabled={loading}
          aria-busy={loading}
          className="rounded-xl bg-emerald-700 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? "Catching you up…" : "Catch me up"}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Viewing now: <span className="font-medium text-slate-900">{view.viewing.label}</span>
      </p>

      <div className="mt-4" aria-live="polite">
        <RecapBody recap={recap} view={view} />
      </div>
    </section>
  );
}

function RecapBody({ recap, view }: { recap: RecapState; view: ReplayView }) {
  if (recap.status === "idle") {
    return (
      <div className="space-y-2 text-sm text-slate-600">
        {recap.notice && (
          <p role="status" className="rounded-md bg-slate-100 px-3 py-2 font-medium text-slate-800">
            {recap.notice}
          </p>
        )}
        <p>Choose when you stopped watching, then press Catch me up. Playing the replay never calls the AI by itself.</p>
      </div>
    );
  }
  if (recap.status === "loading") {
    return (
      <div className="space-y-2" aria-label="Loading recap">
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }
  if (recap.status === "error") {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
        {recap.message} Press Catch me up to try again.
      </p>
    );
  }
  return <RecapResult data={recap.data} view={view} />;
}

function RecapResult({ data, view }: { data: CatchUpResponse; view: ReplayView }) {
  const focus = useEvidenceFocus();
  const { recap, evidence } = data;
  const windowEvents = view.events.filter((e) => e.seq > data.asOf.lastSeenSeq && e.seq <= data.asOf.viewingSeq);
  const card = "rounded-xl border border-slate-200 p-3";

  return (
    <div className="space-y-3" data-testid="recap">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ModeBadge mode={data.mode} provider={data.provider} model={data.model} fallbackReason={data.fallbackReason} cached={data.cached} generatedAt={data.generatedAt} />
        <AsOfLabel asOf={data.asOf} currentViewingSeq={view.viewing.seq} showWindow />
      </div>
      <h3 className="text-xl font-bold text-slate-900">{recap.headline}</h3>

      <article className={card}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">What changed</h4>
        <ul className="mt-1 list-disc space-y-2 pl-5 text-slate-900">
          {recap.whatChanged.map((item, i) => (
            <li key={i}>
              {item.text}
              <FactLines facts={item.facts} />
              <EvidenceChips ids={item.evidence} evidence={evidence} onSelect={focus.select} />
            </li>
          ))}
        </ul>
      </article>

      <article className={card}>
        <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          {recap.whyItMatters.kind === "interpretation" ? "Why it matters" : "What the numbers say"}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-700">
            {recap.whyItMatters.kind === "interpretation" ? "Interpretation, not a statistic" : "Calculated"}
          </span>
        </h4>
        <p className="mt-1 text-slate-900">{recap.whyItMatters.text}</p>
        <FactLines facts={recap.whyItMatters.facts} />
        <EvidenceChips ids={recap.whyItMatters.evidence} evidence={evidence} onSelect={focus.select} />
      </article>

      <article className={card}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">What to watch next</h4>
        <p className="mt-1 text-slate-900">{recap.watchNext.text}</p>
        <FactLines facts={recap.watchNext.facts} />
        <EvidenceChips ids={recap.watchNext.evidence} evidence={evidence} onSelect={focus.select} />
      </article>

      <EvidencePanel
        scope="recap"
        evidence={evidence}
        windowEvents={windowEvents}
        open={focus.open}
        onToggle={focus.setOpen}
        focusId={focus.focusId}
        nonce={focus.nonce}
      />
    </div>
  );
}
