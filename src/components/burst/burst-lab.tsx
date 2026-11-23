"use client";

import { AlertTriangle, CircleCheck, Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { recordLocalRun } from "@/lib/local-runs";
import { percent, seconds, thousands } from "@/lib/format";
import type { ClientEvent } from "@/lib/reliability/clients";
import type { ProviderStats } from "@/lib/reliability/provider";
import type { Preset, ScenarioParams, VariantKey } from "@/lib/reliability/scenario";
import { readSSE } from "@/lib/reliability/sse";
import { applyEvent, type RequestTimeline, type VariantSummary } from "@/lib/reliability/timeline";
import { cn } from "@/lib/utils";
import { TimelineChart, TimelineLegend } from "./timeline-chart";

export interface VariantSnapshot {
  timelines: RequestTimeline[];
  summary?: VariantSummary;
  provider?: ProviderStats;
  promptTokens: number;
  status: "idle" | "running" | "done" | "error";
  now: number;
  message?: string;
}

type VariantInfo = Record<VariantKey, { title: string; summary: string }>;

const ORDER: VariantKey[] = ["naive", "resilient", "trimmed"];
const TIERS = [30_000, 90_000, 450_000];
const SPEED = 12;

function sameParams(a: ScenarioParams, b: ScenarioParams) {
  return (Object.keys(a) as Array<keyof ScenarioParams>).every((key) => a[key] === b[key]);
}

function cloneTimeline(t: RequestTimeline): RequestTimeline {
  return { ...t, segments: [...t.segments], rateLimits: [...t.rateLimits] };
}

function repMessage(t: RequestTimeline): { tone: "ok" | "bad" | "warn" | "muted"; text: string } {
  if (t.outcome === "done") return { tone: "ok", text: t.text };
  if (t.outcome === "error") {
    if (t.error?.code === "busy") return { tone: "warn", text: t.error.userMessage };
    return { tone: "bad", text: t.error?.userMessage ?? "Error" };
  }
  if (t.phase === "queued" || t.phase === "backoff") {
    const wait = t.lastWaitMs ? ` Starting in about ${Math.max(1, Math.round(t.lastWaitMs / 1000))} s.` : "";
    return { tone: "muted", text: `Busy moment. Your answer is queued.${wait}` };
  }
  if (t.phase === "streaming") return { tone: "muted", text: t.text || "…" };
  return { tone: "muted", text: "Thinking…" };
}

export function BurstLab({
  initial,
  initialParams,
  presets,
  variants,
}: {
  initial: Record<VariantKey, VariantSnapshot>;
  initialParams: ScenarioParams;
  presets: Preset[];
  variants: VariantInfo;
}) {
  const [params, setParams] = useState<ScenarioParams>(initialParams);
  const [shownParams, setShownParams] = useState<ScenarioParams>(initialParams);
  const [presetKey, setPresetKey] = useState<string>("post");
  const [snapshots, setSnapshots] = useState<Record<VariantKey, VariantSnapshot>>(initial);
  const [running, setRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stale = !sameParams(params, shownParams);

  const streamVariant = useCallback(async (variant: VariantKey, run: ScenarioParams, signal: AbortSignal) => {
    const query = new URLSearchParams({ variant, speed: String(SPEED) });
    for (const [key, value] of Object.entries(run)) query.set(key, String(value));
    const timelines = new Map<number, RequestTimeline>();
    let now = 0;
    let frame = 0;
    const flush = (patch: Partial<VariantSnapshot> = {}) => {
      setSnapshots((prev) => ({
        ...prev,
        [variant]: { ...prev[variant], timelines: [...timelines.values()].sort((a, b) => a.id - b.id).map(cloneTimeline), now, ...patch },
      }));
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        flush();
      });
    };
    const response = await fetch(`/api/burst?${query.toString()}`, { signal, cache: "no-store" });
    if (!response.ok || !response.body) throw new Error(`Burst request failed (${response.status})`);
    for await (const message of readSSE(response.body)) {
      if (message.event === "scenario") {
        const data = JSON.parse(message.data) as { params: ScenarioParams };
        const promptTokens = variant === "trimmed" ? Math.min(data.params.trimmedTokens, data.params.promptTokens) : data.params.promptTokens;
        setSnapshots((prev) => ({ ...prev, [variant]: { ...prev[variant], promptTokens } }));
        continue;
      }
      if (message.event === "summary") {
        const data = JSON.parse(message.data) as { summary: VariantSummary; provider: ProviderStats };
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        flush({ summary: data.summary, provider: data.provider, status: "done" });
        return data.summary;
      }
      if (message.event === "run_error") {
        const data = JSON.parse(message.data) as { message: string };
        flush({ status: "error", message: data.message });
        return undefined;
      }
      const event = JSON.parse(message.data) as ClientEvent;
      now = Math.max(now, event.t);
      applyEvent(timelines, event);
      schedule();
    }
    return undefined;
  }, []);

  const run = useCallback(
    async (runParams: ScenarioParams) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setShownParams(runParams);
      setAnnouncement("Running all three clients against the simulated provider.");
      setSnapshots((prev) => {
        const next = { ...prev };
        for (const key of ORDER) next[key] = { ...prev[key], timelines: [], summary: undefined, provider: undefined, status: "running", now: 0, message: undefined };
        return next;
      });
      try {
        const results = await Promise.all(ORDER.map((key) => streamVariant(key, runParams, controller.signal)));
        const [naive, resilient, trimmed] = results;
        if (naive && resilient && trimmed) {
          setAnnouncement(
            `Done. Naive answered ${naive.succeeded} of ${naive.total}; resilient ${resilient.succeeded} of ${resilient.total}; trimmed ${trimmed.succeeded} of ${trimmed.total}.`,
          );
          recordLocalRun({
            kind: "burst",
            label: `Burst: ${runParams.concurrency} reps, ${thousands(runParams.promptTokens)} tokens`,
            failed: naive.failed + resilient.failed + trimmed.failed,
            total: naive.total + resilient.total + trimmed.total,
            detail: `naive ${naive.succeeded}/${naive.total}, resilient ${resilient.succeeded}/${resilient.total}, trimmed ${trimmed.succeeded}/${trimmed.total}`,
            harshFailures: naive.failed,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) setAnnouncement(`The run stopped: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (abortRef.current === controller) {
          setRunning(false);
          abortRef.current = null;
        }
      }
    },
    [streamVariant],
  );

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setAnnouncement("Stopped.");
  };

  const choosePreset = (preset: Preset) => {
    setPresetKey(preset.key);
    setParams(preset.params);
    void run(preset.params);
  };

  const update = (patch: Partial<ScenarioParams>) => {
    setPresetKey("custom");
    setParams((prev) => ({ ...prev, ...patch }));
  };

  const maxMs = useMemo(() => {
    const ends = ORDER.flatMap((key) => [snapshots[key].summary?.finishedAtMs ?? 0, snapshots[key].now]);
    return Math.max(2_000, ...ends);
  }, [snapshots]);

  const perRequest = shownParams.promptTokens + shownParams.maxOutputTokens;
  const wanted = shownParams.concurrency * perRequest;
  const budget = Math.max(0, shownParams.tpm - shownParams.otherTrafficTpm);
  const preset = presets.find((p) => p.key === presetKey);

  return (
    <div className="space-y-8">
      <section aria-labelledby="controls-title" className="rounded-xl border bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 id="controls-title" className="text-base font-semibold">
              Scenario
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {preset ? preset.description : "Custom settings. Run to see what each client does with them."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Scenario presets">
            {presets.map((p) => (
              <Button key={p.key} variant={presetKey === p.key ? "default" : "outline"} aria-pressed={presetKey === p.key} onClick={() => choosePreset(p)} disabled={running}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <SliderField id="reps" label="Reps asking at once" value={params.concurrency} display={String(params.concurrency)} min={1} max={12} step={1} onChange={(v) => update({ concurrency: v })} disabled={running} />
          <SliderField
            id="prompt"
            label="Prompt tokens per request"
            value={params.promptTokens}
            display={thousands(params.promptTokens)}
            min={2_000}
            max={20_000}
            step={500}
            onChange={(v) => update({ promptTokens: v })}
            disabled={running}
          />
          <SliderField
            id="other"
            label="Other traffic on the same key"
            value={params.otherTrafficTpm}
            display={`${thousands(params.otherTrafficTpm)} TPM`}
            min={0}
            max={20_000}
            step={1_000}
            onChange={(v) => update({ otherTrafficTpm: v })}
            disabled={running}
          />
          <div className="space-y-2">
            <Label htmlFor="tier">Usage tier (tokens per minute)</Label>
            <Select value={String(params.tpm)} onValueChange={(v) => update({ tpm: Number(v), rpm: Number(v) >= 450_000 ? 5_000 : 500 })} disabled={running}>
              <SelectTrigger id="tier" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((tier) => (
                  <SelectItem key={tier} value={String(tier)}>
                    {thousands(tier)} TPM
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Virtual clock with seed {params.seed}: the same settings give the same result every time. Played back about {SPEED}x faster, long waits shortened.
          </p>
          <div className="flex gap-2">
            {running ? (
              <Button variant="outline" onClick={stop}>
                <Square aria-hidden /> Stop
              </Button>
            ) : null}
            <Button size="lg" onClick={() => void run(params)} disabled={running}>
              {running ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {running ? "Running…" : "Run live"}
            </Button>
          </div>
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <section aria-labelledby="why-title" className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border bg-background p-4 sm:p-5">
          <h2 id="why-title" className="text-base font-semibold">
            Why requests fail
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The provider charges the prompt plus the requested max output against the per-minute budget the moment a request arrives.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Each request</dt>
              <dd className="font-semibold tabular">
                {thousands(shownParams.promptTokens)} + {thousands(shownParams.maxOutputTokens)} = {thousands(perRequest)}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">{shownParams.concurrency} at once need</dt>
              <dd className={cn("font-semibold tabular", wanted > budget ? "text-bad" : "text-ok")}>{thousands(wanted)} tokens</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Budget this minute</dt>
              <dd className="font-semibold tabular">{thousands(budget)} tokens</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">
            {wanted > budget
              ? `Only ${Math.floor(budget / perRequest)} of ${shownParams.concurrency} fit in the first minute. Without a queue, the rest come back as 429.`
              : "Everything fits in one minute, so nothing should be rejected."}
          </p>
        </div>
        <ComparisonTable snapshots={snapshots} variants={variants} />
      </section>

      {stale && !running ? (
        <p className="rounded-lg border border-dashed bg-background p-3 text-sm text-muted-foreground" role="status">
          Settings changed. Select Run live to see what each client does with them.
        </p>
      ) : null}

      <section aria-label="Timelines" className={cn("space-y-4", stale && !running && "opacity-60")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Per-request timelines</h2>
          <TimelineLegend />
        </div>
        {ORDER.map((key) => (
          <VariantPanel key={key} variant={key} info={variants[key]} snapshot={snapshots[key]} maxMs={maxMs} />
        ))}
      </section>
    </div>
  );
}

function SliderField({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label id={`${id}-label`}>{label}</Label>
        <span className="text-sm font-semibold tabular">{display}</span>
      </div>
      <Slider aria-labelledby={`${id}-label`} valueText={display} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} disabled={disabled} />
    </div>
  );
}

function ComparisonTable({ snapshots, variants }: { snapshots: Record<VariantKey, VariantSnapshot>; variants: VariantInfo }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <table className="w-full text-sm">
        <caption className="sr-only">Results for each client</caption>
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Client
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Answered
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              429s
            </th>
            <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">
              Retries
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              p50
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              p95
            </th>
          </tr>
        </thead>
        <tbody>
          {ORDER.map((key) => {
            const s = snapshots[key].summary;
            const status = snapshots[key].status;
            return (
              <tr key={key} className="border-t">
                <th scope="row" className="px-3 py-2.5 text-left text-[13px] font-medium sm:text-sm">
                  {variants[key].title}
                </th>
                {s ? (
                  <>
                    <td className={cn("px-2 py-2.5 whitespace-nowrap tabular", s.failed ? "text-bad font-semibold" : "text-ok font-semibold")}>
                      {s.succeeded}/{s.total} <span className="sr-only sm:not-sr-only font-normal text-muted-foreground">({percent(s.successRate)})</span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap tabular">{s.rateLimited}</td>
                    <td className="hidden px-2 py-2.5 tabular sm:table-cell">{s.retries}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap tabular">{seconds(s.p50Ms)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular">{seconds(s.p95Ms)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="px-2 py-2.5 text-muted-foreground">
                    {status === "running" ? "Running…" : status === "error" ? "Run failed" : "Not run yet"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">p50 and p95 are answer times for answered requests, from the rep asking to the last word.</p>
    </div>
  );
}

function VariantPanel({ variant, info, snapshot, maxMs }: { variant: VariantKey; info: { title: string; summary: string }; snapshot: VariantSnapshot; maxMs: number }) {
  const s = snapshot.summary;
  const headingId = `variant-${variant}`;
  return (
    <article aria-labelledby={headingId} className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <h3 id={headingId} className="flex items-center gap-2 font-semibold">
            {info.title}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular">{thousands(snapshot.promptTokens)}-token prompts</span>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{info.summary}</p>
        </div>
        {s ? (
          <div className={cn("flex shrink-0 items-center gap-1.5 text-sm font-medium", s.failed ? (variant === "naive" ? "text-bad" : "text-warn") : "text-ok")}>
            {s.failed ? <AlertTriangle className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
            {s.succeeded} of {s.total} answered · {s.rateLimited} × 429
          </div>
        ) : snapshot.status === "running" ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Running
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          {snapshot.timelines.length ? (
            <TimelineChart timelines={snapshot.timelines} maxMs={maxMs} now={snapshot.status === "running" ? snapshot.now : undefined} />
          ) : (
            <p className="text-sm text-muted-foreground">{snapshot.status === "running" ? "Waiting for the first event…" : snapshot.message ?? "No run yet."}</p>
          )}
        </div>
        {snapshot.timelines.length ? (
          <div className="min-w-0 border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">What each rep sees</h4>
            <ul className="space-y-1.5">
              {snapshot.timelines.map((t) => {
                const m = repMessage(t);
                return (
                  <li key={t.id} className="flex gap-2 text-sm">
                    <span className="w-11 shrink-0 text-xs leading-5 font-medium text-muted-foreground">Rep {t.id}</span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 rounded px-2 leading-5",
                        m.tone === "bad" && "bg-bad-soft font-medium text-bad",
                        m.tone === "warn" && "bg-warn-soft text-warn",
                        m.tone === "ok" && "line-clamp-2 text-foreground",
                        m.tone === "muted" && "line-clamp-2 text-muted-foreground",
                      )}
                      title={m.text}
                    >
                      {m.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}
