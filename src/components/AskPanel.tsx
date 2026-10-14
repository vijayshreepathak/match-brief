"use client";

import { useState } from "react";
import { MAX_QUESTION_LENGTH, type AnswerStatus, type AskResponse } from "@/lib/ai/types";
import type { ReplayView } from "@/lib/match/view";
import { EvidenceChips, EvidencePanel, useEvidenceFocus } from "./Evidence";
import { AsOfLabel, ModeBadge } from "./ResponseMeta";

export interface QaItem {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  data?: AskResponse;
  error?: string;
}

const STATUS_TEXT: Record<AnswerStatus, string> = {
  answered: "Answered from match data",
  not_in_data: "Not in the match data",
  declined: "Declined",
  facts_only: "Calculated facts only",
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
    <section aria-labelledby="ask-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 id="ask-heading" className="text-lg font-bold text-slate-900">
        Ask about this moment
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Answers use only deliveries up to {view.viewing.label}. Questions and answers are not saved.
      </p>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Your question about the match
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="e.g. How many wides have there been?"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <button
          type="submit"
          disabled={busy || !trimmed}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      <p className="mt-1 text-right text-xs text-slate-500">
        {question.length}/{MAX_QUESTION_LENGTH}
      </p>

      <div role="group" aria-label="Suggested questions" className="mt-1 flex flex-wrap gap-2">
        {suggestions(view).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => submit(s)}
            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
          {notice}
        </p>
      )}

      <ol className="mt-4 space-y-3" aria-live="polite">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-200 p-3" data-testid="qa-item">
            <p className="font-semibold text-slate-900">Q: {item.question}</p>
            {item.status === "loading" && <p className="mt-2 animate-pulse text-sm text-slate-600">Checking the match data…</p>}
            {item.status === "error" && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-900">
                <span>{item.error}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAsk(item.question)}
                  className="rounded-md border border-red-300 px-2 py-0.5 font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}
            {item.status === "done" && item.data && <Answer data={item.data} view={view} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Answer({ data, view }: { data: AskResponse; view: ReplayView }) {
  const focus = useEvidenceFocus();
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={data.mode} model={data.model} fallbackReason={data.fallbackReason} />
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700" data-testid="answer-status">
            {STATUS_TEXT[data.answer.status]}
          </span>
        </div>
        <AsOfLabel asOf={data.asOf} currentViewingSeq={view.viewing.seq} showWindow={false} />
      </div>
      <p className="text-slate-900" data-testid="answer-text">
        {data.answer.text}
      </p>
      <EvidenceChips ids={data.answer.evidence} evidence={data.evidence} onSelect={focus.select} />
      {data.answer.evidence.length > 0 && (
        <EvidencePanel
          scope={`qa`}
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
