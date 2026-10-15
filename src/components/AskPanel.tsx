"use client";

import { Ban, Calculator, CircleAlert, CircleCheck, Info, Send, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { MAX_QUESTION_LENGTH, type AnswerStatus, type AskResponse } from "@/lib/ai/types";
import type { ReplayView } from "@/lib/match/view";
import { EvidenceChips, EvidencePanel, useEvidenceFocus } from "./Evidence";
import { AsOfLabel, FactLines, ModeBadge } from "./ResponseMeta";
import { buttonPrimary, buttonSecondary, card, inputField } from "./ui";

export interface QaItem {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  data?: AskResponse;
  error?: string;
}

const STATUS: Record<AnswerStatus, { text: string; icon: LucideIcon; tone: string }> = {
  answered: { text: "Answered from match data", icon: CircleCheck, tone: "border-success-border bg-success-bg text-success-fg" },
  not_in_data: { text: "Not in the match data", icon: Info, tone: "border-border bg-surface-muted text-foreground" },
  declined: { text: "Declined", icon: Ban, tone: "border-border bg-surface-muted text-foreground" },
  facts_only: { text: "Calculated facts only", icon: Calculator, tone: "border-border bg-surface-muted text-foreground" },
};

function suggestions(view: ReplayView): string[] {
  const team = view.match.battingTeam;
  if (view.snapshot.inningsComplete) {
    return [`How did ${team} finish the chase?`, "Who top-scored?", "How many extras were conceded?"];
  }
  return [
    `What do ${team} need from here?`,
    "How many extras have been conceded?",
    "How is the current partnership going?",
    "Who will win?",
  ];
}

export function AskPanel({
  view,
  items,
  busy,
  notice,
  onAsk,
}: {
  view: ReplayView;
  items: QaItem[];
  busy: boolean;
  notice: string | null;
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const trimmed = question.trim();

  function submit(text: string) {
    if (busy || !text.trim()) return;
    onAsk(text.trim());
    setQuestion("");
  }

  return (
    <section aria-labelledby="ask-heading" className={`${card} p-5`}>
      <h2 id="ask-heading" className="text-lg font-bold">
        Ask about this moment
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        Answers use only deliveries up to <span className="font-semibold text-foreground tabular-nums">{view.viewing.label}</span>.
        Questions and answers are not saved.
      </p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Your question about the match
        </label>
        <div className="flex gap-2">
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="e.g. How many wides have there been?"
            autoComplete="off"
            aria-describedby="question-count"
            className={`${inputField} flex-1`}
          />
          <button type="submit" disabled={busy || !trimmed} className={buttonPrimary}>
            <Send aria-hidden className="size-4" />
            {busy ? "Asking…" : "Ask"}
          </button>
        </div>
        <p id="question-count" className="mt-1 text-right text-xs text-muted tabular-nums">
          {question.length}/{MAX_QUESTION_LENGTH}
        </p>
      </form>

      <div role="group" aria-label="Suggested questions" className="mt-1">
        <p className="text-xs font-semibold text-muted">Try asking</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {suggestions(view).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => submit(s)}
              className="min-h-9 rounded-full border border-border-strong bg-surface px-3 py-1 text-left text-sm text-foreground transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
          {notice}
        </p>
      )}

      {/* Always mounted so screen readers announce the first answer too. */}
      <ol
        className={items.length > 0 ? "mt-5 divide-y divide-border border-t border-border" : ""}
        aria-live="polite"
        aria-label="Your questions and answers"
      >
          {items.map((item) => (
            <li key={item.id} className="py-4" data-testid="qa-item">
              <p className="text-xs font-semibold text-muted">You asked</p>
              <p className="font-semibold leading-snug">{item.question}</p>
              {item.status === "loading" && (
                <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <span aria-hidden className="size-2 animate-pulse rounded-full bg-primary" />
                  Checking the match data…
                </p>
              )}
              {item.status === "error" && (
                <div
                  role="alert"
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
                >
                  <CircleAlert aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{item.error}</span>
                  <button type="button" disabled={busy} onClick={() => onAsk(item.question)} className={`${buttonSecondary} h-9`}>
                    Retry
                  </button>
                </div>
              )}
              {item.status === "done" && item.data && <Answer data={item.data} view={view} scope={`qa-${item.id}`} />}
            </li>
          ))}
      </ol>
    </section>
  );
}

function Answer({ data, view, scope }: { data: AskResponse; view: ReplayView; scope: string }) {
  const focus = useEvidenceFocus();
  const status = STATUS[data.answer.status];
  const StatusIcon = status.icon;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <ModeBadge mode={data.mode} provider={data.provider} model={data.model} fallbackReason={data.fallbackReason} cached={data.cached} generatedAt={data.generatedAt} />
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>
            <StatusIcon aria-hidden className="size-3.5" />
            <span data-testid="answer-status">{status.text}</span>
          </span>
        </div>
        <AsOfLabel asOf={data.asOf} currentViewingSeq={view.viewing.seq} showWindow={false} />
      </div>
      <p className="leading-relaxed" data-testid="answer-text">
        {data.answer.text}
      </p>
      <FactLines facts={data.answer.facts} />
      <EvidenceChips ids={data.answer.evidence} evidence={data.evidence} onSelect={focus.select} />
      {data.answer.evidence.length > 0 && (
        <EvidencePanel
          scope={scope}
          evidence={data.evidence}
          open={focus.open}
          onToggle={focus.setOpen}
          focusId={focus.focusId}
          nonce={focus.nonce}
        />
      )}
    </div>
  );
}
