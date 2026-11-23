import { BellRing, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { ErrorRateChart } from "@/components/monitoring/error-rate-chart";
import { LocalRuns } from "@/components/monitoring/local-runs";
import { PageHeader, Stat } from "@/components/site/page-header";
import { percent, seconds } from "@/lib/format";
import { ALERT_RULES, BUCKET_MINUTES, DEPLOY_MINUTE, clockLabel, monitoringSnapshot, type Bucket, type RunRecord } from "@/lib/monitoring/monitor";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Monitoring" };

const OUTCOME: Record<RunRecord["outcome"], { label: string; className: string }> = {
  answered: { label: "Answered", className: "text-ok" },
  "answered-after-wait": { label: "Answered after a wait", className: "text-ok" },
  "busy-retry": { label: "Told to try again", className: "text-warn font-medium" },
  failed: { label: "Failed (429)", className: "text-bad font-medium" },
};
const PATH: Record<RunRecord["path"], string> = { "answer-bank": "Answer bank", retrieval: "Retrieval", "no-match": "No match" };
const CLIENT: Record<RunRecord["client"], string> = { naive: "today's client", resilient: "retry queue", none: "no model call" };

/** A slice of the log around the worst window: every miss, plus a few answers for context. */
function slice(runs: RunRecord[], bucket: Bucket): RunRecord[] {
  const inside = runs.filter((r) => r.minute >= bucket.start && r.minute < bucket.start + BUCKET_MINUTES);
  const misses = inside.filter((r) => r.outcome === "failed" || r.outcome === "busy-retry");
  const rest = inside.filter((r) => !misses.includes(r)).slice(0, Math.max(2, 7 - misses.length));
  return [...misses, ...rest].sort((a, b) => a.minute - b.minute).slice(0, 8);
}

export default async function MonitoringPage() {
  const snapshot = await monitoringSnapshot();
  const { before, after } = snapshot;
  const critical = snapshot.alerts.filter((a) => a.severity === "critical");
  const criticalAfter = critical.filter((a) => a.firedAt >= DEPLOY_MINUTE).length;
  const worst = (list: Bucket[]) => list.reduce((a, b) => (b.unanswered > a.unanswered || (b.unanswered === a.unanswered && b.p95Ms > a.p95Ms) ? b : a), list[0]);
  const worstBefore = worst(snapshot.buckets.filter((b) => b.start < DEPLOY_MINUTE));
  const worstAfter = worst(snapshot.buckets.filter((b) => b.start >= DEPLOY_MINUTE));
  const log = [...slice(snapshot.runs, worstBefore), ...slice(snapshot.runs, worstAfter)];
  return (
    <>
      <PageHeader eyebrow="Simulated day · task 5" title="Monitoring">
        <p>
          In production every answer is logged with its path, outcome, wait and attempts. This page builds that log from a seeded day of simulated
          questions sent through the same clients as the 429 page: today&apos;s client until {clockLabel(DEPLOY_MINUTE)}, the retry queue after it.
          Answer-bank hits ({percent(snapshot.bankShare)} of questions) never call the model. A question counts as unanswered if the rep got an error
          or was told to try again.
        </p>
      </PageHeader>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Questions asked" value={(before.requests + after.requests).toLocaleString("en-US")} hint={`${before.modelCalls + after.modelCalls} needed the model`} />
        <Stat label={`Unanswered before ${clockLabel(DEPLOY_MINUTE)}`} value={percent(before.errorRate)} hint={`${before.failed} hard errors, ${before.busy} told to try again`} tone="bad" />
        <Stat
          label={`Unanswered after ${clockLabel(DEPLOY_MINUTE)}`}
          value={percent(after.errorRate)}
          hint={`${after.failed} hard errors, ${after.busy} told to try again`}
          tone={after.unanswered ? "warn" : "ok"}
        />
        <Stat label="Alerts" value={snapshot.alerts.length} hint={`${critical.length} critical, ${criticalAfter === 0 ? "all before the fix" : `${criticalAfter} after the fix`}`} tone="warn" />
      </dl>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] xl:items-start">
        <section aria-labelledby="rate-title" className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 id="rate-title" className="text-base font-semibold">
            Error rate over time
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            15-minute windows. After the fix, hard errors stop; at the afternoon peak the budget is still too small, so some reps are told to try
            again. Smaller prompts or a higher tier would remove that.
          </p>
          <ErrorRateChart buckets={snapshot.buckets} />
          <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Latest alerts</h3>
          <ol className="mt-2 divide-y">
            {snapshot.alerts.slice(0, 3).map((alert, index) => (
              <li key={`${alert.ruleId}-${alert.firedAt}-${index}`} className="py-2 text-sm">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{alert.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{clockLabel(alert.firedAt)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="sr-only">{alert.severity}: </span>
                  {alert.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="alerts-title" className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 id="alerts-title" className="text-base font-semibold">
            Alerts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Each rule, evaluated over the log. In production these post to a chat channel or email through a webhook.</p>
          <ul className="mt-3 divide-y rounded-lg border">
            {ALERT_RULES.map((rule) => {
              const fired = snapshot.alerts.filter((a) => a.ruleId === rule.id);
              const last = fired[0];
              return (
                <li key={rule.id} className="flex items-start gap-2.5 p-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      rule.severity === "critical" ? "bg-bad-soft text-bad" : rule.severity === "warning" ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                    )}
                  >
                    {rule.severity === "critical" ? <BellRing className="size-3.5" aria-hidden /> : rule.severity === "warning" ? <TriangleAlert className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-medium">
                        {rule.name} <span className="text-xs font-normal text-muted-foreground capitalize">{rule.severity}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular">{fired.length === 0 ? "never fired" : `${fired.length}× · last ${clockLabel(last.firedAt)}`}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
                    {last ? <p className="mt-1 text-xs">Last: {last.title}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{snapshot.alerts.length} alerts in the simulated day.</p>
        </section>
      </div>

      <div className="mt-8">
        <LocalRuns />
      </div>

      <section aria-labelledby="log-title" className="mt-8">
        <h2 id="log-title" className="text-xl font-semibold tracking-tight">
          Run log
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          The worst window before the fix ({clockLabel(worstBefore.start)}) and after it ({clockLabel(worstAfter.start)}): every miss, plus a few answers.
        </p>
        <ul className="space-y-2 sm:hidden" aria-label="Run log">
          {log.map((run, index) => (
            <li key={`${run.minute}-${index}`} className="rounded-xl border bg-background p-3 text-sm">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{run.intent}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">{clockLabel(run.minute)}</span>
              </p>
              <p className={cn("mt-1", OUTCOME[run.outcome].className)}>
                {OUTCOME[run.outcome].label}
                {run.outcome === "failed" || run.outcome === "busy-retry" ? "" : ` · ${seconds(run.latencyMs)}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {run.rep} · {PATH[run.path]} · {CLIENT[run.client]}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-xl border bg-background sm:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Run log</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                <th scope="col" className="px-3 py-2 font-medium">Rep</th>
                <th scope="col" className="px-3 py-2 font-medium">Question</th>
                <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Path</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Model call</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Wait</th>
              </tr>
            </thead>
            <tbody>
              {log.map((run, index) => (
                <tr key={`${run.minute}-${index}`} className="border-t">
                  <td className="px-3 py-2 tabular">{clockLabel(run.minute)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{run.rep}</td>
                  <td className="px-3 py-2">{run.intent}</td>
                  <td className={cn("px-3 py-2", OUTCOME[run.outcome].className)}>{OUTCOME[run.outcome].label}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{PATH[run.path]}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{CLIENT[run.client]}</td>
                  <td className="px-3 py-2 text-right tabular">{run.outcome === "failed" || run.outcome === "busy-retry" ? "–" : seconds(run.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
