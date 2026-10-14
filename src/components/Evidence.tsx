"use client";

import { ChevronDown, CircleDot, Hash } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EvidenceItem } from "@/lib/ai/types";
import type { EventView } from "@/lib/match/view";

// Evidence chips under each claim, and an inline disclosure showing what a chip refers to.
// Each response owns its own evidence map, so an older answer's evidence is never mixed in.

export function EvidenceChips({
  ids,
  evidence,
  onSelect,
}: {
  ids: string[];
  evidence: Record<string, EvidenceItem>;
  onSelect: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const item = evidence[id];
        if (!item) return null;
        const Icon = item.kind === "event" ? CircleDot : Hash;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            data-evidence-chip={id}
            aria-label={`Show evidence: ${item.title}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-success-border bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-foreground transition-colors duration-150 hover:border-primary"
          >
            <Icon aria-hidden className="size-3" />
            {item.chip}
          </button>
        );
      })}
    </span>
  );
}

/** Lets a parent open the panel and highlight one item when a chip is clicked. */
export function useEvidenceFocus() {
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  return {
    open,
    setOpen,
    focusId,
    nonce,
    select(id: string) {
      setOpen(true);
      setFocusId(id);
      setNonce((n) => n + 1);
    },
  };
}

export function EvidencePanel({
  scope,
  evidence,
  windowEvents,
  open,
  onToggle,
  focusId,
  nonce,
}: {
  scope: string;
  evidence: Record<string, EvidenceItem>;
  /** Deliveries in the explained window, for the expandable timeline. */
  windowEvents?: EventView[];
  open: boolean;
  onToggle: (open: boolean) => void;
  focusId: string | null;
  nonce: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = Object.values(evidence).sort((a, b) =>
    a.kind === b.kind ? (a.seq ?? 0) - (b.seq ?? 0) : a.kind === "fact" ? -1 : 1,
  );

  useEffect(() => {
    if (!open || !focusId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-evidence-item="${focusId}"]`);
    // Smooth scrolling only when the fan has not asked for reduced motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  }, [open, focusId, nonce]);

  return (
    <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className="group rounded-xl border border-border bg-surface-muted">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground select-none [&::-webkit-details-marker]:hidden">
        <span>
          Evidence ({items.length} cited{windowEvents ? ` · ${windowEvents.length} deliveries in window` : ""})
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div ref={listRef} className="space-y-3 px-3 pb-3" id={`${scope}-evidence`}>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              tabIndex={-1}
              data-evidence-item={item.id}
              aria-current={focusId === item.id ? "true" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                focusId === item.id ? "border-primary bg-primary-soft ring-2 ring-primary/40" : "border-border bg-surface"
              }`}
            >
              <p className="font-semibold text-foreground">
                <span className="mr-2 rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted">
                  {item.id}
                </span>
                {item.title}
              </p>
              <p className="mt-0.5 break-words text-foreground tabular-nums">{item.detail}</p>
            </li>
          ))}
        </ul>
        {windowEvents && windowEvents.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted">Every delivery in this window</h4>
            <ol className="mt-1 max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-xs">
              {windowEvents.map((e) => (
                <li
                  key={e.id}
                  className={`flex gap-2 rounded px-1.5 py-1 ${evidence[e.id] ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "text-foreground"}`}
                >
                  <span className="w-10 shrink-0 font-mono text-muted tabular-nums">{e.ballLabel}</span>
                  <span className="min-w-0 break-words">
                    {e.bowler} to {e.batter}: {e.description}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
