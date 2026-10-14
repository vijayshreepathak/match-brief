"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayStep } from "@/lib/cricket/engine";
import type { AskResponse, CatchUpResponse } from "@/lib/ai/types";
import { RequestAborted, fetchReplay, postJson } from "@/lib/client/api";
import type { ReplayView } from "@/lib/match/view";
import { AskPanel, type QaItem } from "./AskPanel";
import { CatchUpPanel, type RecapState } from "./CatchUpPanel";
import { ReplayToolbar } from "./ReplayToolbar";
import { Scoreboard } from "./Scoreboard";
import { card } from "./ui";

const PLAY_INTERVAL_MS = 1_200;
const MAX_ANSWERS = 4;

/** Keep the fan's last-seen choice if still valid, otherwise the latest completed over before now. */
function clampLastSeen(current: number, view: ReplayView): number {
  if (view.lastSeenOptions.some((o) => o.seq === current) && current <= view.viewing.seq) return current;
  const earlier = view.lastSeenOptions.filter((o) => o.seq < view.viewing.seq);
  return (earlier.at(-1) ?? view.lastSeenOptions[0]).seq;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function MatchBrief({ initialView, initialLastSeenSeq }: { initialView: ReplayView; initialLastSeenSeq: number }) {
  const [view, setView] = useState(initialView);
  const [lastSeenSeq, setLastSeenSeq] = useState(initialLastSeenSeq);
  const [playing, setPlaying] = useState(false);
  const [nav, setNav] = useState<{ busy: boolean; error: string | null; failedStep: ReplayStep | null }>({
    busy: false,
    error: null,
    failedStep: null,
  });
  const [recap, setRecap] = useState<RecapState>({ status: "idle" });
  const [answers, setAnswers] = useState<QaItem[]>([]);
  const [askBusy, setAskBusy] = useState(false);
  const [askNotice, setAskNotice] = useState<string | null>(null);

  // Refs hold the latest values for async callbacks.
  const viewingRef = useRef(initialView.viewing.seq);
  const navBusyRef = useRef(false);
  const recapRequestId = useRef(0);
  const recapAbort = useRef<AbortController | null>(null);
  const recapBusyRef = useRef(false);
  const askBusyRef = useRef(false);
  const askAborts = useRef(new Map<number, AbortController>());
  const qaCounter = useRef(0);
  const hadRecap = useRef(false);
  const hadAnswers = useRef(false);

  useEffect(() => {
    hadRecap.current = recap.status === "done" || recap.status === "loading";
    hadAnswers.current = answers.length > 0;
  }, [recap, answers]);

  /** Rewinding means stored answers may describe deliveries the fan has not "seen" yet. */
  const invalidateAnswers = useCallback(() => {
    recapRequestId.current += 1;
    recapAbort.current?.abort();
    askAborts.current.forEach((c) => c.abort());
    askAborts.current.clear();
    setRecap(
      hadRecap.current
        ? { status: "idle", notice: "Replay rewound: the previous recap was cleared because it described later deliveries." }
        : { status: "idle" },
    );
    setAskNotice(hadAnswers.current ? "Replay rewound: earlier answers were cleared because they described later deliveries." : null);
    setAnswers([]);
  }, []);

  const navigate = useCallback(
    async (step: ReplayStep) => {
      if (navBusyRef.current) return;
      navBusyRef.current = true;
      setNav({ busy: true, error: null, failedStep: null });
      try {
        const next = await fetchReplay(viewingRef.current, step);
        const previous = viewingRef.current;
        viewingRef.current = next.viewing.seq;
        if (next.viewing.seq < previous) invalidateAnswers();
        setView(next);
        setLastSeenSeq((current) => clampLastSeen(current, next));
        if (!next.canAdvance) setPlaying(false);
        setNav({ busy: false, error: null, failedStep: null });
      } catch (error) {
        setPlaying(false);
        setNav({ busy: false, error: errorMessage(error), failedStep: step });
      } finally {
        navBusyRef.current = false;
      }
    },
    [invalidateAnswers],
  );

  // Auto-advance only moves the replay. It never requests a recap or an answer.
  useEffect(() => {
    if (!playing || nav.busy || nav.error || !view.canAdvance) return;
    const timer = setTimeout(() => void navigate("next-ball"), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, nav.busy, nav.error, view, navigate]);

  const manualStep = (step: ReplayStep) => {
    setPlaying(false);
    void navigate(step);
  };

  async function catchUp() {
    // A ref, not state, so two clicks before a re-render still send one request.
    if (recapBusyRef.current) return;
    recapBusyRef.current = true;
    const request = { viewingSeq: viewingRef.current, lastSeenSeq };
    const id = ++recapRequestId.current;
    const controller = new AbortController();
    recapAbort.current = controller;
    setRecap({ status: "loading" });
    try {
      const data = await postJson<CatchUpResponse>("/api/catchup", request, controller.signal);
      // Ignore superseded responses and anything newer than what the fan is viewing.
      if (id !== recapRequestId.current || data.asOf.viewingSeq > viewingRef.current) return;
      setRecap({ status: "done", data });
    } catch (error) {
      if (error instanceof RequestAborted || id !== recapRequestId.current) return;
      setRecap({ status: "error", message: errorMessage(error) });
    } finally {
      recapBusyRef.current = false;
    }
  }

  async function ask(question: string) {
    if (askBusyRef.current) return;
    askBusyRef.current = true;
    setAskBusy(true);
    setAskNotice(null);
    const id = ++qaCounter.current;
    const request = { viewingSeq: viewingRef.current, lastSeenSeq, question };
    const controller = new AbortController();
    askAborts.current.set(id, controller);
    setAnswers((prev) =>
      [{ id, question, status: "loading" as const }, ...prev.filter((a) => !(a.status === "error" && a.question === question))].slice(
        0,
        MAX_ANSWERS,
      ),
    );
    try {
      const data = await postJson<AskResponse>("/api/ask", request, controller.signal);
      if (data.asOf.viewingSeq > viewingRef.current) {
        setAnswers((prev) => prev.filter((a) => a.id !== id));
        return;
      }
      setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, status: "done", data } : a)));
    } catch (error) {
      if (error instanceof RequestAborted) return;
      setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, status: "error", error: errorMessage(error) } : a)));
    } finally {
      askAborts.current.delete(id);
      askBusyRef.current = false;
      setAskBusy(false);
    }
  }

  // Match summary and replay toolbar on top; catch-up (7/12) and questions (5/12) below.
  // DOM order matches the mobile order: summary, controls, catch-up, questions.
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4">
      <section aria-labelledby="score-heading" className={card}>
        <Scoreboard view={view} />
        <ReplayToolbar
          view={view}
          playing={playing}
          busy={nav.busy}
          error={nav.error}
          failedStep={nav.failedStep}
          onStep={manualStep}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <CatchUpPanel
            view={view}
            lastSeenSeq={lastSeenSeq}
            onLastSeenChange={setLastSeenSeq}
            recap={recap}
            onCatchUp={() => void catchUp()}
          />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <AskPanel view={view} items={answers} busy={askBusy} notice={askNotice} onAsk={(q) => void ask(q)} />
        </div>
      </div>
    </main>
  );
}
