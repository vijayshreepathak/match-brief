"use client";

import { ArrowRight, CircleAlert, Eye, Lightbulb, ListChecks, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { CatchUpResponse } from "@/lib/ai/types";
import type { ReplayView } from "@/lib/match/view";
import { EvidenceChips, EvidencePanel, useEvidenceFocus } from "./Evidence";
import { AsOfLabel, FactLines, ModeBadge } from "./ResponseMeta";
import { buttonPrimary, buttonPrimaryBusy, buttonSecondary, card, inputField } from "./ui";

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
    <section aria-labelledby="catchup-heading" className={`${card} p-5`}>
      <h2 id="catchup-heading" className="text-lg font-bold">
        Catch up
      </h2>
      <p className="mt-0.5 text-sm text-muted">Pick when you stopped watching. MatchBrief explains what changed since then.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <div className="min-w-0">
          <label htmlFor="last-seen" className="block text-sm font-semibold">
            I last watched until…
          </label>
          <select
            id="last-seen"
            value={lastSeenSeq}
            onChange={(e) => onLastSeenChange(Number(e.target.value))}
            className={`${inputField} mt-1 cursor-pointer`}
          >
            {view.lastSeenOptions.map((o) => (
              <option key={o.seq} value={o.seq}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <ArrowRight aria-hidden className="mx-auto mb-3 hidden size-4 text-muted sm:block" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Viewing now</p>
          <p className="mt-1 flex h-11 items-center rounded-lg border border-border bg-surface-muted px-3 text-sm font-semibold tabular-nums">
            {view.viewing.label}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCatchUp}
        disabled={loading}
        aria-busy={loading}
        className={`${loading ? buttonPrimaryBusy : buttonPrimary} mt-3 h-12 w-full px-6 text-base sm:w-auto`}
      >
        {loading ? "Catching you up…" : "Catch me up"}
      </button>

      <div className="mt-5" aria-live="polite">
        <RecapBody recap={recap} view={view} onRetry={onCatchUp} />
      </div>
    </section>
  );
}

function RecapBody({ recap, view, onRetry }: { recap: RecapState; view: ReplayView; onRetry: () => void }) {
  if (recap.status === "idle") {
    return (
      <div className="space-y-2">
        {recap.notice && (
          <p role="status" className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
            {recap.notice}
          </p>
        )}
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm text-muted">
          <p className="font-medium text-foreground">Your recap covers what changed, why it matters, and what to watch next.</p>
          <p className="mt-1">Every number comes from the match data. Playing the replay never calls the AI by itself.</p>
        </div>
      </div>
    );
  }
  if (recap.status === "loading") {
    return (
      <div role="status" aria-label="Loading recap" className="space-y-3">
        <span className="sr-only">Preparing your recap…</span>
        <div className="h-5 w-40 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-surface-muted" />
        <div className="space-y-2 border-l-2 border-border pl-4">
          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="space-y-2 border-l-2 border-border pl-4">
          <div className="h-4 w-4/6 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (recap.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger-border bg-danger-bg px-3 py-2.5 text-sm text-danger-fg">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{recap.message}</span>
        <button type="button" onClick={onRetry} className={`${buttonSecondary} h-9`}>
          Try again
        </button>
      </div>
    );
  }
  return <RecapResult data={recap.data} view={view} />;
}

function RecapSection({ icon: Icon, title, tag, children }: { icon: LucideIcon; title: string; tag?: string; children: ReactNode }) {
  return (
    <article className="border-l-2 border-primary pl-4">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden className="size-4 text-primary" />
        {title}
        {tag && (
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">{tag}</span>
        )}
      </h4>
      <div className="mt-1.5">{children}</div>
    </article>
  );
}

function RecapResult({ data, view }: { data: CatchUpResponse; view: ReplayView }) {
  const focus = useEvidenceFocus();
  const { recap, evidence } = data;
  const windowEvents = view.events.filter((e) => e.seq > data.asOf.lastSeenSeq && e.seq <= data.asOf.viewingSeq);
  const interpretation = recap.whyItMatters.kind === "interpretation";

  return (
    <div className="space-y-4" data-testid="recap">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ModeBadge mode={data.mode} provider={data.provider} model={data.model} fallbackReason={data.fallbackReason} cached={data.cached} generatedAt={data.generatedAt} />
        <AsOfLabel asOf={data.asOf} currentViewingSeq={view.viewing.seq} showWindow />
      </div>
      <h3 className="text-xl font-bold leading-snug">{recap.headline}</h3>

      <RecapSection icon={ListChecks} title="What changed">
        <ul className="space-y-3">
          {recap.whatChanged.map((item, i) => (
            <li key={i}>
              <p className="leading-relaxed">{item.text}</p>
              <FactLines facts={item.facts} />
              <EvidenceChips ids={item.evidence} evidence={evidence} onSelect={focus.select} />
            </li>
          ))}
        </ul>
      </RecapSection>

      <RecapSection
        icon={Lightbulb}
        title={interpretation ? "Why it matters" : "What the numbers say"}
        tag={interpretation ? "Interpretation, not a statistic" : "Calculated"}
      >
        <p className="leading-relaxed">{recap.whyItMatters.text}</p>
        <FactLines facts={recap.whyItMatters.facts} />
        <EvidenceChips ids={recap.whyItMatters.evidence} evidence={evidence} onSelect={focus.select} />
      </RecapSection>

      <RecapSection icon={Eye} title="What to watch next">
        <p className="leading-relaxed">{recap.watchNext.text}</p>
        <FactLines facts={recap.watchNext.facts} />
        <EvidenceChips ids={recap.watchNext.evidence} evidence={evidence} onSelect={focus.select} />
      </RecapSection>

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
