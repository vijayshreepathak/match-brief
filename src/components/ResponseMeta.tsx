import { Calculator, Clock, Sparkles, TriangleAlert } from "lucide-react";
import { FALLBACK_REASON_TEXT, type AsOf, type BoundFact, type FallbackReason, type ResponseMode } from "@/lib/ai/types";

export function ModeBadge({
  mode,
  provider,
  model,
  fallbackReason,
  cached = false,
  generatedAt = null,
}: {
  mode: ResponseMode;
  provider: string | null;
  model: string | null;
  fallbackReason: FallbackReason | null;
  cached?: boolean;
  generatedAt?: string | null;
}) {
  if (mode === "ai") {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-success-border bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-soft-foreground">
          <Sparkles aria-hidden className="size-3.5" />
          {provider} · {model}
          {cached ? " · cached" : ""}
        </span>
        <span className="text-xs text-muted" data-testid="provenance">
          Wording by AI; numbers calculated from the match data.
          {cached && generatedAt ? ` Cached answer first generated at ${new Date(generatedAt).toLocaleTimeString()}.` : ""}
        </span>
      </span>
    );
  }
  if (mode === "no_change") {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
        No new deliveries · no AI call needed
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-warning-border bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-fg">
        <TriangleAlert aria-hidden className="size-3.5" />
        Rule-based fallback
      </span>
      {fallbackReason && <span className="text-xs font-medium text-warning-fg">{FALLBACK_REASON_TEXT[fallbackReason]}</span>}
    </span>
  );
}

/** Canonical facts rendered by the server, labelled with the checkpoint they describe. */
export function FactLines({ facts }: { facts: BoundFact[] }) {
  if (facts.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5" aria-label="Calculated from the match data">
      {facts.map((f) => (
        <li key={f.id} className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm text-foreground">
          <Calculator aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted" />
          <span data-fact-statement={f.id} className="min-w-0 tabular-nums">
            {f.statement}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AsOfLabel({ asOf, currentViewingSeq, showWindow }: { asOf: AsOf; currentViewingSeq: number; showWindow: boolean }) {
  const stale = asOf.viewingSeq !== currentViewingSeq;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs text-muted tabular-nums">
        <Clock aria-hidden className="size-3.5 shrink-0" />
        <span data-testid="as-of">
          As of {asOf.viewingLabel}
          {showWindow ? ` · since ${asOf.lastSeenLabel}` : ""}
        </span>
      </p>
      {stale && (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-bg px-2.5 py-1.5 text-xs font-medium text-warning-fg"
          data-testid="stale-notice"
        >
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>The replay has moved on since this was written. It describes {asOf.viewingLabel}, not the current score.</span>
        </p>
      )}
    </div>
  );
}
