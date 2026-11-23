"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearLocalRuns, readLocalRuns, type LocalRun } from "@/lib/local-runs";

export function LocalRuns() {
  const [runs, setRuns] = useState<LocalRun[] | null>(null);

  useEffect(() => {
    setRuns(readLocalRuns());
  }, []);

  const harsh = (runs ?? []).reduce((sum, run) => sum + (run.harshFailures ?? 0), 0);

  return (
    <section aria-labelledby="local-title" className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="local-title" className="text-base font-semibold">
          Runs from this browser
        </h2>
        {runs && runs.length ? (
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
      <p className="mt-1 text-sm text-muted-foreground">Your own runs on the Burst lab and Ask pages, kept in this browser only.</p>
      {harsh > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-bad-soft p-3 text-sm text-bad" role="status">
          <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
          The naive client failed {harsh} answer{harsh > 1 ? "s" : ""} in your runs. In production each one would count toward the failed-answers alert.
        </p>
      ) : null}
      {runs === null ? null : runs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing yet. Run a burst on the <Link className="font-medium text-primary underline underline-offset-4" href="/burst">Burst lab</Link> or ask
          the <Link className="font-medium text-primary underline underline-offset-4" href="/ask">coach</Link> a question, then come back.
        </p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {runs.slice(0, 8).map((run) => (
            <li key={run.at + run.label} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground tabular">{new Date(run.at).toLocaleTimeString()}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{run.label}</span>
              <span className="text-xs text-muted-foreground">{run.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
