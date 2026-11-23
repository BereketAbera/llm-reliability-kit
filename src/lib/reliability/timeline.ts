import type { ClientEvent, CoachError } from "./clients";

export type SegmentKind = "queued" | "waiting" | "streaming" | "backoff";

export interface Segment {
  kind: SegmentKind;
  from: number;
  to: number;
}

export interface RequestTimeline {
  id: number;
  question: string;
  /** The approved line this question is answered with. */
  lineId?: string;
  promptTokens: number;
  arrivedAt: number;
  segments: Segment[];
  /** Times a 429 came back. */
  rateLimits: number[];
  attempts: number;
  outcome: "pending" | "done" | "error";
  endedAt?: number;
  latencyMs?: number;
  text: string;
  error?: CoachError;
  /** Current phase, for drawing a run that is still going. */
  phase: SegmentKind | "idle" | "done" | "error";
  phaseSince: number;
  lastWaitMs?: number;
}

const SEGMENT_KINDS = new Set<string>(["queued", "waiting", "streaming", "backoff"]);

function closePhase(timeline: RequestTimeline, t: number) {
  if (SEGMENT_KINDS.has(timeline.phase) && t > timeline.phaseSince) {
    timeline.segments.push({ kind: timeline.phase as SegmentKind, from: timeline.phaseSince, to: t });
  }
}

function enter(timeline: RequestTimeline, phase: RequestTimeline["phase"], t: number) {
  closePhase(timeline, t);
  timeline.phase = phase;
  timeline.phaseSince = t;
}

/** Folds client events into per-request timelines. Used live in the browser and in tests. */
export function applyEvent(timelines: Map<number, RequestTimeline>, event: ClientEvent): void {
  if (event.type === "arrive") {
    timelines.set(event.id, {
      id: event.id,
      question: event.question,
      lineId: event.lineId,
      promptTokens: event.promptTokens,
      arrivedAt: event.t,
      segments: [],
      rateLimits: [],
      attempts: 0,
      outcome: "pending",
      text: "",
      phase: "queued",
      phaseSince: event.t,
    });
    return;
  }
  const timeline = timelines.get(event.id);
  if (!timeline) return;
  switch (event.type) {
    case "queued":
      if (timeline.phase !== "queued") enter(timeline, "queued", event.t);
      if (event.waitMs !== undefined) timeline.lastWaitMs = event.waitMs;
      break;
    case "send":
      enter(timeline, "waiting", event.t);
      timeline.attempts = event.attempt + 1;
      break;
    case "rate_limited":
      enter(timeline, "idle", event.t);
      timeline.rateLimits.push(event.t);
      break;
    case "backoff":
      enter(timeline, "backoff", event.t);
      timeline.lastWaitMs = event.delayMs;
      break;
    case "first_token":
      enter(timeline, "streaming", event.t);
      break;
    case "delta":
      timeline.text += event.text;
      break;
    case "done":
      enter(timeline, "done", event.t);
      timeline.outcome = "done";
      timeline.endedAt = event.t;
      timeline.latencyMs = event.latencyMs;
      timeline.attempts = event.attempts;
      timeline.text = event.text;
      break;
    case "error":
      enter(timeline, "error", event.t);
      timeline.outcome = "error";
      timeline.endedAt = event.t;
      timeline.latencyMs = event.latencyMs;
      timeline.attempts = Math.max(timeline.attempts, event.attempts);
      timeline.error = event.error;
      break;
  }
}

export function buildTimelines(events: ClientEvent[]): RequestTimeline[] {
  const map = new Map<number, RequestTimeline>();
  for (const event of events) applyEvent(map, event);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export interface VariantSummary {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  rateLimited: number;
  retries: number;
  /** Typical answer time (median) for answered requests. */
  p50Ms?: number;
  p95Ms?: number;
  /** Slowest answer time for answered requests. */
  maxMs?: number;
  finishedAtMs: number;
}

export function summarize(timelines: RequestTimeline[]): VariantSummary {
  const done = timelines.filter((t) => t.outcome === "done");
  const failed = timelines.filter((t) => t.outcome === "error");
  const latencies = done.map((t) => t.latencyMs ?? 0);
  return {
    total: timelines.length,
    succeeded: done.length,
    failed: failed.length,
    successRate: timelines.length ? done.length / timelines.length : 0,
    rateLimited: timelines.reduce((sum, t) => sum + t.rateLimits.length, 0),
    retries: timelines.reduce((sum, t) => sum + Math.max(0, t.attempts - 1), 0),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: latencies.length ? Math.max(...latencies) : undefined,
    finishedAtMs: Math.max(0, ...timelines.map((t) => t.endedAt ?? 0)),
  };
}
