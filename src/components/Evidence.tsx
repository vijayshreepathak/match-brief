"use client";

import { useEffect, useRef, useState } from "react";
import type { EvidenceItem } from "@/lib/ai/types";
import type { EventView } from "@/lib/match/view";

// Evidence chips under each claim, and an expandable panel that shows what a chip refers to.

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
    <span className="mt-1 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const item = evidence[id];
        if (!item) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            data-evidence-chip={id}
            aria-label={`Show evidence: ${item.title}`}
            className="rounded-full border border-emerald-700/30 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
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
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }, [open, focusId, nonce]);

  return (
    <details
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
      className="rounded-xl border border-slate-200 bg-slate-50"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-800">
        Evidence ({items.length} cited{windowEvents ? ` · ${windowEvents.length} deliveries in window` : ""})
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
                focusId === item.id ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/40" : "border-slate-200 bg-white"
              }`}
            >
              <p className="font-medium text-slate-900">
                <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{item.id}</span>
                {item.title}
              </p>
              <p className="mt-0.5 break-words text-slate-700">{item.detail}</p>
            </li>
          ))}
        </ul>
        {windowEvents && windowEvents.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Every delivery in this window
            </h4>
            <ol className="mt-1 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-xs">
              {windowEvents.map((e) => (
                <li
                  key={e.id}
                  className={`flex gap-2 rounded px-1 py-0.5 ${evidence[e.id] ? "bg-emerald-50 font-medium" : ""}`}
                >
                  <span className="w-10 shrink-0 font-mono text-slate-500">{e.ballLabel}</span>
                  <span className="min-w-0 break-words text-slate-800">
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
