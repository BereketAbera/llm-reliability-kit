import { BellRing, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { ErrorRateChart } from "@/components/monitoring/error-rate-chart";
import { LocalRuns } from "@/components/monitoring/local-runs";
import { PageHeader, Stat } from "@/components/site/page-header";
import { Badge } from "@/components/ui/badge";
import { percent, seconds } from "@/lib/format";
import { ALERT_RULES, DEPLOY_MINUTE, clockLabel, monitoringSnapshot, type RunRecord } from "@/lib/monitoring/monitor";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Monitoring" };

const OUTCOME: Record<RunRecord["outcome"], { label: string; className: string }> = {
  answered: { label: "Answered", className: "text-ok" },
  "answered-after-wait": { label: "Answered after a wait", className: "text-ok" },
  "busy-retry": { label: "Busy, asked to retry", className: "text-warn" },
  failed: { label: "Failed (429)", className: "text-bad font-medium" },
};

export default function MonitoringPage() {
  const snapshot = monitoringSnapshot();
  const critical = snapshot.alerts.filter((a) => a.severity === "critical");
  const criticalAfter = critical.filter((a) => a.firedAt >= DEPLOY_MINUTE).length;
  const log = [
    // 09:30 (before the fix) and 14:30 (after it), as minutes since 07:00
    ...snapshot.runs.filter((r) => r.minute >= 150 && r.minute < 160).slice(0, 6),
    ...snapshot.runs.filter((r) => r.minute >= 450 && r.minute < 460).slice(0, 6),
  ];
  return (
    <>
      <PageHeader eyebrow="Simulated: a seeded day of traffic, not real users" title="Monitoring">
        <p>
          Every answer is logged with its path, outcome, latency and attempts. From that log come two views the founder can read at a glance: the error
          rate over time, and alerts when answers fail. The resilient client ships at {clockLabel(DEPLOY_MINUTE)} in this simulated day.
        </p>
      </PageHeader>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Answers requested" value={(snapshot.before.requests + snapshot.after.requests).toLocaleString("en-US")} hint="07:00 to 19:00" />
        <Stat
          label={`Error rate before ${clockLabel(DEPLOY_MINUTE)}`}
          value={percent(snapshot.before.errorRate)}
          hint={`${snapshot.before.failed} failed answers`}
          tone="bad"
        />
        <Stat
          label={`Error rate after ${clockLabel(DEPLOY_MINUTE)}`}
          value={percent(snapshot.after.errorRate)}
          hint={`${snapshot.after.failed} failed · ${snapshot.after.busy} asked to retry`}
          tone="ok"
        />
        <Stat label="Alerts" value={snapshot.alerts.length} hint={`${critical.length} critical, ${criticalAfter === 0 ? "all before the fix" : `${criticalAfter} after the fix`}`} tone="warn" />
      </dl>

      <section aria-labelledby="rate-title" className="mt-8 rounded-xl border bg-background p-4 sm:p-5">
        <h2 id="rate-title" className="text-xl font-semibold tracking-tight">
          Error rate over time
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">15-minute windows. A failed answer is one the rep never got; a calm &ldquo;busy, retry&rdquo; is counted separately.</p>
        <ErrorRateChart buckets={snapshot.buckets} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="alerts-title" className="rounded-xl border bg-background p-4 sm:p-5">
          <h2 id="alerts-title" className="text-xl font-semibold tracking-tight">
            Alerts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Newest first. Simulated: in production these post to a chat channel or email through a webhook.</p>
          <ol className="mt-4 space-y-3">
            {snapshot.alerts.slice(0, 9).map((alert, index) => (
              <li key={`${alert.ruleId}-${alert.firedAt}-${index}`} className="flex gap-3 rounded-lg border p-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    alert.severity === "critical" ? "bg-bad-soft text-bad" : alert.severity === "warning" ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                  )}
                >
                  {alert.severity === "critical" ? <BellRing className="size-3.5" aria-hidden /> : alert.severity === "warning" ? <TriangleAlert className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{alert.title}</span>
                    <Badge variant="outline" className="font-normal capitalize">
                      {alert.severity}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{alert.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular">
                    Fired {clockLabel(alert.firedAt)}
                    {alert.resolvedAt !== undefined && alert.resolvedAt !== alert.firedAt ? ` · resolved ${clockLabel(alert.resolvedAt)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Showing 9 of {snapshot.alerts.length}.</p>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="rules-title" className="rounded-xl border bg-background p-4 sm:p-5">
            <h2 id="rules-title" className="text-base font-semibold">
              Alert rules
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              {ALERT_RULES.map((rule) => (
                <li key={rule.id}>
                  <span className="font-medium">{rule.name}</span> <span className="text-xs text-muted-foreground capitalize">({rule.severity})</span>
                  <span className="block text-muted-foreground">{rule.description}</span>
                </li>
              ))}
            </ul>
          </section>
          <LocalRuns />
        </div>
      </div>

      <section aria-labelledby="log-title" className="mt-8">
        <h2 id="log-title" className="text-xl font-semibold tracking-tight">
          Run log
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">Two slices of the day: the morning peak before the fix and the afternoon peak after it.</p>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Run log</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                <th scope="col" className="px-3 py-2 font-medium">Rep</th>
                <th scope="col" className="px-3 py-2 font-medium">Question</th>
                <th scope="col" className="px-3 py-2 font-medium">Path</th>
                <th scope="col" className="px-3 py-2 font-medium">Client</th>
                <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Time to answer</th>
              </tr>
            </thead>
            <tbody>
              {log.map((run, index) => (
                <tr key={`${run.minute}-${index}`} className="border-t">
                  <td className="px-3 py-2 tabular">{clockLabel(run.minute)}</td>
                  <td className="px-3 py-2">{run.rep}</td>
                  <td className="px-3 py-2">{run.intent}</td>
                  <td className="px-3 py-2 text-muted-foreground">{run.path === "answer-bank" ? "Answer bank" : run.path === "retrieval" ? "Retrieval" : "No match"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{run.client}</td>
                  <td className={cn("px-3 py-2", OUTCOME[run.outcome].className)}>{OUTCOME[run.outcome].label}</td>
                  <td className="px-3 py-2 text-right tabular">{run.outcome === "failed" ? "–" : seconds(run.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
