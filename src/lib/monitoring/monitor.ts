import { seededRandom } from "../reliability/random";

export type RunOutcome = "answered" | "answered-after-wait" | "busy-retry" | "failed";

export interface RunRecord {
  /** Minutes since the start of the simulated day (07:00). */
  minute: number;
  rep: string;
  intent: string;
  path: "answer-bank" | "retrieval" | "no-match";
  client: "naive" | "resilient";
  outcome: RunOutcome;
  latencyMs: number;
  attempts: number;
  providerStatus?: number;
  guardRestored?: boolean;
}

export interface Bucket {
  start: number;
  requests: number;
  failed: number;
  busy: number;
  errorRate: number;
  p95Ms: number;
}

export interface AlertRule {
  id: string;
  name: string;
  severity: "critical" | "warning" | "info";
  description: string;
}

export interface Alert {
  ruleId: string;
  severity: AlertRule["severity"];
  title: string;
  detail: string;
  firedAt: number;
  resolvedAt?: number;
}

export const DAY_START_HOUR = 7;
export const DAY_MINUTES = 12 * 60;
export const BUCKET_MINUTES = 15;
/** When the resilient client shipped in the simulated day (12:30). */
export const DEPLOY_MINUTE = 5 * 60 + 30;
export const ERROR_RATE_THRESHOLD = 0.05;

export const ALERT_RULES: AlertRule[] = [
  { id: "failed-answers", name: "Failed answers", severity: "critical", description: "3 or more answers fail within 5 minutes." },
  { id: "error-rate", name: "Error rate", severity: "critical", description: "More than 5% of answers fail in a 15-minute window (at least 10 requests)." },
  { id: "slow-answers", name: "Slow answers", severity: "warning", description: "p95 answer time above 20 seconds in a 15-minute window." },
  { id: "guard-restored", name: "Paraphrase caught", severity: "info", description: "The verbatim guard replaced a model paraphrase with the approved line." },
];

export function clockLabel(minute: number): string {
  const total = DAY_START_HOUR * 60 + Math.floor(minute);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const INTENTS = ["Price is too high", "No budget", "Send me information", "Need to talk to my boss", "Call me next quarter", "Follow-up email", "Cold call opener", "Ask for the next step", "Recap after a demo", "Voicemail"];
const REPS = ["Rep A", "Rep B", "Rep C", "Rep D", "Rep E", "Rep F", "Rep G", "Rep H", "Rep J", "Rep K", "Rep L", "Rep M"];

/** Requests per 15 minutes across a working day: a morning peak and an afternoon peak. */
function trafficAt(minute: number): number {
  const hour = minute / 60 + DAY_START_HOUR;
  const morning = Math.exp(-((hour - 10) ** 2) / 2.2);
  const afternoon = Math.exp(-((hour - 14.5) ** 2) / 2.6);
  return Math.round(6 + 34 * Math.max(morning, afternoon * 0.95));
}

/**
 * A seeded day of coaching traffic. Before the deploy, requests that land in a
 * burst fail with 429 about a third of the time; after it, they wait or retry.
 */
export function simulateDay(seed = 11): RunRecord[] {
  const random = seededRandom(seed);
  const runs: RunRecord[] = [];
  for (let start = 0; start < DAY_MINUTES; start += BUCKET_MINUTES) {
    const count = trafficAt(start);
    for (let i = 0; i < count; i++) {
      const minute = start + random() * BUCKET_MINUTES;
      const busyness = count / 40;
      const inBurst = random() < 0.25 + 0.5 * busyness;
      const after = minute >= DEPLOY_MINUTE;
      const roll = random();
      const pathRoll = random();
      const path: RunRecord["path"] = pathRoll < 0.68 ? "answer-bank" : pathRoll < 0.96 ? "retrieval" : "no-match";
      let outcome: RunOutcome = "answered";
      let latencyMs = 1_400 + random() * 1_400;
      let attempts = 1;
      let providerStatus: number | undefined;
      if (!after && inBurst && roll < 0.3) {
        outcome = "failed";
        latencyMs = 300 + random() * 500;
        providerStatus = 429;
      } else if (after && inBurst && roll < 0.22) {
        outcome = "answered-after-wait";
        latencyMs = 6_000 + random() * 20_000 * busyness;
        attempts = random() < 0.3 ? 2 : 1;
      } else if (after && inBurst && roll < 0.235 && busyness > 0.8) {
        outcome = "busy-retry";
        latencyMs = 45_000;
        attempts = 2;
      }
      runs.push({
        minute,
        rep: REPS[Math.floor(random() * REPS.length)],
        intent: INTENTS[Math.floor(random() * INTENTS.length)],
        path,
        client: after ? "resilient" : "naive",
        outcome,
        latencyMs: Math.round(latencyMs),
        attempts,
        providerStatus,
        guardRestored: path === "retrieval" && random() < 0.04,
      });
    }
  }
  return runs.sort((a, b) => a.minute - b.minute);
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

// excerpt:start error-rate
/** A failed answer is one the rep never got. A calm "busy, retry" is counted separately. */
export function bucketize(runs: RunRecord[], bucketMinutes = BUCKET_MINUTES, dayMinutes = DAY_MINUTES): Bucket[] {
  const buckets: Bucket[] = [];
  for (let start = 0; start < dayMinutes; start += bucketMinutes) {
    const inside = runs.filter((run) => run.minute >= start && run.minute < start + bucketMinutes);
    const failed = inside.filter((run) => run.outcome === "failed").length;
    buckets.push({
      start,
      requests: inside.length,
      failed,
      busy: inside.filter((run) => run.outcome === "busy-retry").length,
      errorRate: inside.length ? failed / inside.length : 0,
      p95Ms: p95(inside.filter((run) => run.outcome !== "failed").map((run) => run.latencyMs)),
    });
  }
  return buckets;
}
// excerpt:end error-rate

/** Groups consecutive breaching windows into one alert that fires and later resolves. */
function windowAlerts(buckets: Bucket[], breach: (b: Bucket) => boolean, make: (first: Bucket, worst: Bucket) => Omit<Alert, "firedAt" | "resolvedAt">): Alert[] {
  const alerts: Alert[] = [];
  let open: { first: Bucket; worst: Bucket } | null = null;
  for (const bucket of buckets) {
    if (breach(bucket)) {
      if (!open) open = { first: bucket, worst: bucket };
      else if (bucket.errorRate > open.worst.errorRate || bucket.p95Ms > open.worst.p95Ms) open.worst = bucket;
    } else if (open) {
      alerts.push({ ...make(open.first, open.worst), firedAt: open.first.start, resolvedAt: bucket.start });
      open = null;
    }
  }
  if (open) alerts.push({ ...make(open.first, open.worst), firedAt: open.first.start });
  return alerts;
}

export function evaluateAlerts(runs: RunRecord[], buckets: Bucket[]): Alert[] {
  const alerts: Alert[] = [];
  const failures = runs.filter((run) => run.outcome === "failed");
  // Failed answers: 3+ inside any 5-minute window. One alert per window, no repeats while it continues.
  let lastFired = -Infinity;
  for (let i = 0; i < failures.length; i++) {
    const windowEnd = failures[i].minute + 5;
    const inWindow = failures.filter((f) => f.minute >= failures[i].minute && f.minute < windowEnd);
    if (inWindow.length >= 3 && failures[i].minute >= lastFired + 30) {
      alerts.push({
        ruleId: "failed-answers",
        severity: "critical",
        title: `${inWindow.length} failed answers in 5 minutes`,
        detail: `Provider returned 429 to ${inWindow.map((f) => f.rep).filter((v, idx, all) => all.indexOf(v) === idx).join(", ")}. Reps saw "The coaching response could not finish".`,
        firedAt: failures[i].minute,
        resolvedAt: inWindow[inWindow.length - 1].minute + 5,
      });
      lastFired = failures[i].minute;
    }
  }
  alerts.push(
    ...windowAlerts(
      buckets,
      (b) => b.requests >= 10 && b.errorRate > ERROR_RATE_THRESHOLD,
      (first, worst) => ({
        ruleId: "error-rate",
        severity: "critical",
        title: `Error rate ${Math.round(worst.errorRate * 100)}% (threshold 5%)`,
        detail: `${worst.failed} of ${worst.requests} answers failed between ${clockLabel(worst.start)} and ${clockLabel(worst.start + BUCKET_MINUTES)}.`,
      }),
    ),
    ...windowAlerts(
      buckets,
      (b) => b.requests >= 10 && b.p95Ms > 20_000,
      (first, worst) => ({
        ruleId: "slow-answers",
        severity: "warning",
        title: `p95 answer time ${Math.round(worst.p95Ms / 1000)} s`,
        detail: "Nothing failed, but reps waited in the queue. Trimming the prompt or a higher tier removes the wait.",
      }),
    ),
  );
  for (const run of runs.filter((r) => r.guardRestored)) {
    alerts.push({
      ruleId: "guard-restored",
      severity: "info",
      title: "Paraphrase caught and replaced",
      detail: `The model reworded a library line for ${run.rep} (${run.intent}); the approved line was shown instead.`,
      firedAt: run.minute,
      resolvedAt: run.minute,
    });
  }
  return alerts.sort((a, b) => b.firedAt - a.firedAt);
}

export interface MonitoringSnapshot {
  runs: RunRecord[];
  buckets: Bucket[];
  alerts: Alert[];
  before: { requests: number; failed: number; errorRate: number };
  after: { requests: number; failed: number; busy: number; errorRate: number };
}

export function monitoringSnapshot(seed = 11): MonitoringSnapshot {
  const runs = simulateDay(seed);
  const buckets = bucketize(runs);
  const alerts = evaluateAlerts(runs, buckets);
  const beforeRuns = runs.filter((r) => r.minute < DEPLOY_MINUTE);
  const afterRuns = runs.filter((r) => r.minute >= DEPLOY_MINUTE);
  const failed = (list: RunRecord[]) => list.filter((r) => r.outcome === "failed").length;
  return {
    runs,
    buckets,
    alerts,
    before: { requests: beforeRuns.length, failed: failed(beforeRuns), errorRate: failed(beforeRuns) / Math.max(1, beforeRuns.length) },
    after: {
      requests: afterRuns.length,
      failed: failed(afterRuns),
      busy: afterRuns.filter((r) => r.outcome === "busy-retry").length,
      errorRate: failed(afterRuns) / Math.max(1, afterRuns.length),
    },
  };
}
