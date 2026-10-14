import { FALLBACK_REASON_TEXT, type AsOf, type FallbackReason, type ResponseMode } from "@/lib/ai/types";

export function ModeBadge({
  mode,
  model,
  fallbackReason,
}: {
  mode: ResponseMode;
  model: string | null;
  fallbackReason: FallbackReason | null;
}) {
  if (mode === "ai") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
        AI · {model}
      </span>
    );
  }
  if (mode === "no_change") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
        No new deliveries · no AI call needed
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
        Rule-based fallback
      </span>
      {fallbackReason && <span className="text-xs text-amber-900">{FALLBACK_REASON_TEXT[fallbackReason]}</span>}
    </span>
  );
}

export function AsOfLabel({ asOf, currentViewingSeq, showWindow }: { asOf: AsOf; currentViewingSeq: number; showWindow: boolean }) {
  const stale = asOf.viewingSeq !== currentViewingSeq;
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-600" data-testid="as-of">
        As of {asOf.viewingLabel}
        {showWindow ? ` · since ${asOf.lastSeenLabel}` : ""}
      </p>
      {stale && (
        <p role="status" className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900" data-testid="stale-notice">
          The replay has moved on since this was written. It describes {asOf.viewingLabel}, not the current score.
        </p>
      )}
    </div>
  );
}
