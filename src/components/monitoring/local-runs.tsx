"use client";

import { BellRing, Flag, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearLocalRuns, readLocalRuns, type LocalRun } from "@/lib/local-runs";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const KIND_LABEL: Record<LocalRun["kind"], string> = { burst: "Burst", ask: "Ask", flag: "Flagged" };

export function LocalRuns() {
  const [runs, setRuns] = useState<LocalRun[] | null>(null);

  useEffect(() => {
    setRuns(readLocalRuns());
  }, []);

  const list = runs ?? [];
  const harsh = list.reduce((sum, run) => sum + (run.harshFailures ?? 0), 0);
  const unanswered = list.reduce((sum, run) => sum + run.failed, 0);
  const caught = list.filter((run) => run.paraphraseCaught).length;
  const flagged = list.filter((run) => run.kind === "flag");

  return (
    <section aria-labelledby="local-title" className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="local-title" className="text-base font-semibold">
          Runs from this browser
        </h2>
        {list.length ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearLocalRuns();
              setRuns([]);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Your own runs on the 429 and Ask pages, kept in this browser only.</p>
      {unanswered > 0 || caught > 0 || flagged.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {unanswered > 0 ? (
            <li className="flex items-start gap-2 rounded-lg bg-bad-soft p-3 text-bad" role="status">
              <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Your burst runs left {unanswered} question{unanswered > 1 ? "s" : ""} unanswered
                {harsh ? ` (${harsh} as hard errors from today's client)` : ""}. In production each one counts toward the unanswered-questions alert.
              </span>
            </li>
          ) : null}
          {caught > 0 ? (
            <li className="flex items-start gap-2 rounded-lg bg-info-soft p-3 text-info">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Info: the verbatim guard caught {caught} paraphrase{caught > 1 ? "s" : ""} in your questions and showed the approved line instead.
              </span>
            </li>
          ) : null}
          {flagged.length > 0 ? (
            <li className="rounded-lg border p-3">
              <p className="flex items-center gap-2 font-medium">
                <Flag className="size-4 shrink-0" aria-hidden /> Trainer&apos;s review queue
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-6 text-muted-foreground">
                {flagged.slice(0, 5).map((run) => (
                  <li key={run.at + run.label} className="[overflow-wrap:anywhere]">
                    {run.label}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
      {runs === null ? null : list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing yet. Run a burst on the <Link className="font-medium text-primary underline underline-offset-4" href="/burst">429 page</Link> or ask
          the <Link className="font-medium text-primary underline underline-offset-4" href="/ask">coach</Link> a question, then come back.
        </p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {list.slice(0, 8).map((run) => (
            <li key={run.at + run.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[3.25rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline">
              <span className="text-xs text-muted-foreground tabular">{time(run.at)}</span>
              <span className="hidden text-xs text-muted-foreground sm:block">{KIND_LABEL[run.kind]}</span>
              <span className="min-w-0 truncate font-medium" title={run.label}>
                {run.label}
              </span>
              <span className="col-start-2 min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:col-start-auto">{run.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
