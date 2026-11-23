import { Check, X } from "lucide-react";
import type { RequestTimeline, SegmentKind } from "@/lib/reliability/timeline";
import { seconds } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEGMENT_CLASS: Record<SegmentKind, string> = {
  queued: "bg-seg-queued stripes",
  waiting: "bg-seg-waiting",
  streaming: "bg-seg-streaming",
  backoff: "bg-seg-backoff stripes",
};

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  queued: "Waiting in line (local budget)",
  waiting: "Sent, waiting for first token",
  streaming: "Streaming the answer",
  backoff: "Backing off after a 429",
};

function niceStep(maxMs: number): number {
  const steps = [500, 1000, 2000, 5000, 10_000, 15_000, 20_000, 30_000];
  return steps.find((step) => maxMs / step <= 6) ?? 60_000;
}

function describe(t: RequestTimeline): string {
  const parts = [`Rep ${t.id}`];
  const queued = t.segments.filter((s) => s.kind === "queued").reduce((sum, s) => sum + (s.to - s.from), 0);
  if (queued > 0) parts.push(`waited ${seconds(queued)} in line`);
  if (t.rateLimits.length) parts.push(`${t.rateLimits.length} rate-limit response${t.rateLimits.length > 1 ? "s" : ""}`);
  if (t.outcome === "done") parts.push(`answered after ${seconds(t.latencyMs)}`);
  else if (t.outcome === "error") parts.push(`failed after ${seconds(t.latencyMs)}: ${t.error?.userMessage ?? "error"}`);
  else parts.push("in progress");
  return parts.join(", ");
}

/** Bars and ticks share one grid column, so a tick sits exactly where its time falls on the bars. */
const ROW = "grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[3.75rem_minmax(0,1fr)_7rem]";

export function TimelineChart({ timelines, maxMs, now, unfinished }: { timelines: RequestTimeline[]; maxMs: number; now?: number; unfinished?: string }) {
  const scale = Math.max(maxMs, 2_000);
  const step = niceStep(scale);
  const ticks: number[] = [];
  for (let t = 0; t <= scale + 1; t += step) ticks.push(t);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / scale) * 100))}%`;

  return (
    <div>
      <ul className="space-y-2">
        {timelines.map((t) => {
          const openTo = t.outcome === "pending" && now !== undefined ? now : undefined;
          return (
            <li key={t.id} className={cn(ROW, "gap-y-0.5")}>
              <span className="text-xs font-medium text-muted-foreground">Rep {t.id}</span>
              <div className="relative h-6 rounded bg-muted" role="img" aria-label={describe(t)}>
                {t.segments.map((segment, index) => (
                  <span
                    key={index}
                    className={cn("absolute inset-y-0.5 rounded-[3px]", SEGMENT_CLASS[segment.kind])}
                    style={{ left: pct(segment.from), width: `max(2px, ${pct(segment.to - segment.from)})` }}
                  />
                ))}
                {openTo !== undefined && (t.phase === "queued" || t.phase === "waiting" || t.phase === "streaming" || t.phase === "backoff") ? (
                  <span
                    className={cn("absolute inset-y-0.5 rounded-[3px] opacity-80", SEGMENT_CLASS[t.phase])}
                    style={{ left: pct(t.phaseSince), width: `max(2px, ${pct(openTo - t.phaseSince)})` }}
                  />
                ) : null}
                {t.outcome !== "pending" && t.endedAt !== undefined ? (
                  <span
                    className={cn(
                      "absolute top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-white ring-2 ring-background",
                      t.outcome === "done" ? "bg-ok" : t.error?.code === "busy" ? "bg-warn" : "bg-bad",
                    )}
                    style={{ left: `clamp(0px, calc(${pct(t.endedAt)} - 8px), calc(100% - 16px))` }}
                  >
                    {t.outcome === "done" ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                  </span>
                ) : null}
                {t.rateLimits.map((at, index) => (
                  <span
                    key={`r${index}`}
                    title="429 from the provider"
                    className="absolute top-0 z-10 size-2.5 -translate-y-1/2 rotate-45 bg-bad ring-2 ring-background"
                    style={{ left: `clamp(0px, calc(${pct(at)} - 5px), calc(100% - 10px))` }}
                  />
                ))}
              </div>
              <span
                className={cn(
                  "col-start-2 text-xs whitespace-nowrap tabular sm:col-start-auto sm:text-right",
                  t.outcome === "done" ? "text-foreground" : t.outcome === "error" ? (t.error?.code === "busy" ? "text-warn" : "text-bad") : unfinished ? "text-warn" : "text-muted-foreground",
                )}
              >
                {t.outcome === "done"
                  ? `Answered ${seconds(t.latencyMs)}`
                  : t.outcome === "error"
                    ? t.error?.code === "busy"
                      ? "Told to try again"
                      : "Failed (429)"
                    : (unfinished ?? "Running…")}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={cn(ROW, "mt-1")} aria-hidden>
        <span />
        <div className="relative h-5">
          {ticks.map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground tabular" style={{ left: pct(tick) }}>
              {tick === 0 ? "0" : `${tick / 1000} s`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {(Object.keys(SEGMENT_LABEL) as SegmentKind[]).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span className={cn("inline-block h-3 w-5 rounded-[3px]", SEGMENT_CLASS[kind])} aria-hidden />
          {SEGMENT_LABEL[kind]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rotate-45 bg-bad" aria-hidden />
        429 from provider
      </li>
    </ul>
  );
}
