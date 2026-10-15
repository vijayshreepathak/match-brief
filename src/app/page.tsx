import { CodeXml } from "lucide-react";
import { MatchBrief } from "@/components/MatchBrief";
import { ThemeToggle } from "@/components/ThemeToggle";
import { defaultCheckpoints, getChase } from "@/lib/match/fixture.server";
import { buildReplayView } from "@/lib/match/view";

const REPO_URL = "https://github.com/vijayshreepathak/match-brief";

function Logo() {
  // Original mark: a ball with a seam. No team or Dream11 branding.
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-9 shrink-0">
      <circle cx="16" cy="16" r="15" className="fill-primary" />
      <path d="M10 5c4.2 5.4 4.2 16.6 0 22M22 5c-4.2 5.4-4.2 16.6 0 22" className="stroke-primary-foreground" strokeWidth="1.8" strokeDasharray="2.2 2.2" fill="none" />
    </svg>
  );
}

export default function Home() {
  const chase = getChase();
  const { viewingSeq, lastSeenSeq } = defaultCheckpoints(chase);
  // Only the view at the default checkpoint (past deliveries) is sent to the browser.
  const view = buildReplayView(chase, viewingSeq);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        {/* Phones: wordmark + controls, then tagline, then the replay label, each on its own row.
            md and up: tagline sits under the wordmark; label and controls share the first row. */}
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <h1 className="text-xl font-extrabold leading-tight tracking-tight">MatchBrief</h1>
          </div>
          <p className="col-span-2 row-start-2 text-sm leading-snug text-muted md:col-span-1 md:-mt-2 md:pl-12">
            Missed a few overs? Understand what changed.
          </p>
          <p
            role="note"
            className="col-span-2 row-start-3 justify-self-start rounded-full border border-warning-border bg-warning-bg px-3 py-1 text-xs font-semibold text-warning-fg md:col-span-1 md:col-start-2 md:row-span-2 md:row-start-1"
          >
            Historical match replay — not live data
          </p>
          <div className="col-start-2 row-start-1 flex items-center gap-2 md:col-start-3 md:row-span-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Source code on GitHub"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-foreground"
            >
              <CodeXml aria-hidden className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <MatchBrief initialView={view} initialLastSeenSeq={lastSeenSeq} />

      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 text-xs leading-relaxed text-muted">
          <p>
            Independent assignment prototype. Not affiliated with or endorsed by Dream11, the ICC, or either team.{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={REPO_URL} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
            .
          </p>
          <p>
            Ball-by-ball data from{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://cricsheet.org/" target="_blank" rel="noreferrer">
              Cricsheet
            </a>{" "}
            (match 1298150), used under the{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://opendatacommons.org/licenses/by/1-0/"
              target="_blank"
              rel="noreferrer"
            >
              Open Data Commons Attribution License v1.0
            </a>
            . Scores are calculated in code; the AI writes the wording. Checks reduce errors but cannot catch every wrong interpretation.
          </p>
        </div>
      </footer>
    </div>
  );
}
