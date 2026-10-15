import { ChevronsLeft, ChevronsRight, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import type { ReplayStep } from "@/lib/cricket/engine";
import type { ReplayView } from "@/lib/match/view";
import { buttonPrimary, buttonSecondary } from "./ui";

// Replay controls. "Playing" means stepping through the recorded match, never a live feed.

export function ReplayToolbar({
  view,
  playing,
  busy,
  error,
  failedStep,
  onStep,
  onTogglePlay,
}: {
  view: ReplayView;
  playing: boolean;
  busy: boolean;
  error: string | null;
  failedStep: ReplayStep | null;
  onStep: (step: ReplayStep) => void;
  onTogglePlay: () => void;
}) {
  const atStart = view.viewing.seq === 0;
  const state = playing ? "Playing replay" : view.canAdvance ? "Paused" : "End of chase";

  return (
    <div className="border-t border-border px-4 py-3">
      <h3 className="sr-only">Replay controls</h3>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Replay controls" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button type="button" className={buttonSecondary} onClick={() => onStep("start")} disabled={busy || atStart}>
            <RotateCcw aria-hidden className="size-4" />
            Restart
          </button>
          <button type="button" className={buttonSecondary} onClick={() => onStep("prev-over")} disabled={busy || atStart}>
            <ChevronsLeft aria-hidden className="size-4" />
            Back 1 over
          </button>
          <button
            type="button"
            className={`${buttonPrimary} col-span-2 min-w-[6.5rem] sm:col-span-1`}
            aria-pressed={playing}
            onClick={onTogglePlay}
            disabled={!view.canAdvance}
          >
            {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className={buttonSecondary} onClick={() => onStep("next-ball")} disabled={busy || !view.canAdvance}>
            <StepForward aria-hidden className="size-4" />
            Next ball
          </button>
          <button type="button" className={buttonSecondary} onClick={() => onStep("next-over")} disabled={busy || !view.canAdvance}>
            <ChevronsRight aria-hidden className="size-4" />
            Next over
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              playing ? "border-success-border bg-success-bg text-success-fg" : "border-border bg-surface-muted text-muted"
            }`}
          >
            {state}
          </span>
          <p className="tabular-nums text-foreground" aria-live="polite" data-testid="replay-position">
            Replay position: {view.viewing.label}
            {view.viewing.seq > 0 ? ` (delivery ${view.viewing.seq})` : ""}
            {!view.canAdvance ? " · end of chase" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          <span>Could not move the replay: {error}</span>
          {failedStep && (
            <button
              type="button"
              className="rounded-md border border-danger-border px-2 py-1 font-semibold hover:bg-surface"
              onClick={() => onStep(failedStep)}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
