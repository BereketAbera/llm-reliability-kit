import { containsVerbatim } from "../coach/text";
import { ANSWER_BANK } from "../content/answer-bank";
import { getLine } from "../content/catalog";
import { DEFAULT_BACKOFF } from "../reliability/backoff";
import { createNaiveClient, createResilientClient, type CoachResult } from "../reliability/clients";
import { VirtualClock } from "../reliability/clock";
import { SimulatedProvider } from "../reliability/provider";
import { seededRandom, type Random } from "../reliability/random";
import { BURST_QUESTIONS, DEFAULT_PARAMS, approvedLineId, buildMessages } from "../reliability/scenario";

export type RunOutcome = "answered" | "answered-after-wait" | "busy-retry" | "failed";

export interface RunRecord {
  /** Minutes since the start of the simulated day (07:00). */
  minute: number;
  rep: string;
  intent: string;
  path: "answer-bank" | "retrieval" | "no-match";
  /** The client that called the model; "none" when no model call was needed. */
  client: "naive" | "resilient" | "none";
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
  /** Questions the rep never got an answer to: hard failures plus calm "try again" messages. */
  unanswered: number;
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
/** When the retry queue shipped in the simulated day (12:30). */
export const DEPLOY_MINUTE = 5 * 60 + 30;
export const ERROR_RATE_THRESHOLD = 0.05;
/** An answer that took longer than this counts as "answered after a wait". */
const WAIT_MS = 8_000;

export const ALERT_RULES: AlertRule[] = [
  { id: "unanswered", name: "Unanswered questions", severity: "critical", description: "3 or more questions go unanswered within 5 minutes (failed, or told to try again)." },
  { id: "error-rate", name: "Error rate", severity: "critical", description: "More than 5% of questions go unanswered in a 15-minute window (at least 10 questions)." },
  { id: "slow-answers", name: "Slow answers", severity: "warning", description: "The slowest 5% of answers take more than 20 seconds in a 15-minute window." },
  { id: "guard-restored", name: "Paraphrase caught", severity: "info", description: "The verbatim guard replaced a model paraphrase with the approved line." },
];

export function clockLabel(minute: number): string {
  const total = DAY_START_HOUR * 60 + Math.floor(minute);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const REPS = ["Rep A", "Rep B", "Rep C", "Rep D", "Rep E", "Rep F", "Rep G", "Rep H", "Rep J", "Rep K", "Rep L", "Rep M"];
/** Assumed mix: how often a question hits the answer bank, goes to retrieval, or has no approved line. */
export const PATH_MIX = { bank: 0.68, retrieval: 0.28 };

/** Questions per 15 minutes across a working day: a morning peak and an afternoon peak. */
function trafficAt(minute: number): number {
  const hour = minute / 60 + DAY_START_HOUR;
  const morning = Math.exp(-((hour - 10) ** 2) / 2.2);
  const afternoon = Math.exp(-((hour - 14.5) ** 2) / 2.6);
  return Math.round(6 + 44 * Math.max(morning, afternoon * 0.95));
}

interface Arrival {
  atMs: number;
  rep: string;
  path: RunRecord["path"];
  question: string;
  intent: string;
}

/** Arrival times: singles spread over each window, plus huddles of 2 to 4 reps asking within seconds. */
function arrivals(random: Random): Arrival[] {
  const out: Arrival[] = [];
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  for (let start = 0; start < DAY_MINUTES; start += BUCKET_MINUTES) {
    let remaining = trafficAt(start);
    const busyness = remaining / 50;
    while (remaining > 0) {
      const huddle = remaining >= 2 && random() < 0.25 + 0.45 * busyness;
      const size = huddle ? Math.min(remaining, 2 + Math.floor(random() * 3)) : 1;
      const t0 = (start + random() * BUCKET_MINUTES) * 60_000;
      for (let i = 0; i < size; i++) {
        const roll = random();
        const path: RunRecord["path"] = roll < PATH_MIX.bank ? "answer-bank" : roll < PATH_MIX.bank + PATH_MIX.retrieval ? "retrieval" : "no-match";
        const question = path === "retrieval" ? pick(BURST_QUESTIONS) : "";
        const intent =
          path === "answer-bank" ? pick(ANSWER_BANK).intent : path === "retrieval" ? getLine(approvedLineId(question) ?? "OPN-3.2").section.title : "No approved line";
        out.push({ atMs: Math.round(t0 + (huddle ? random() * 6_000 : 0)), rep: pick(REPS), path, question, intent });
      }
      remaining -= size;
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/**
 * A seeded day of coaching traffic, run through the real clients. Answer-bank hits
 * and declines never call the model. Every retrieval question goes to the
 * simulated provider through today's client before 12:30 and the retry queue
 * after it, so the error rate is what those clients actually produce.
 */
export async function simulateDay(seed = 11): Promise<RunRecord[]> {
  const random = seededRandom(seed);
  const rewrites = seededRandom(seed * 31 + 1);
  const clock = new VirtualClock();
  const limits = { tpm: DEFAULT_PARAMS.tpm, rpm: DEFAULT_PARAMS.rpm };
  const provider = new SimulatedProvider({ tier: { label: "Simulated tier", ...limits }, clock, rewrites: () => rewrites() < 0.05 });
  const naive = createNaiveClient({ transport: provider.transport, clock });
  const resilient = createResilientClient({ transport: provider.transport, clock, random: seededRandom(seed * 7 + 3), limits, maxConcurrency: 4, policy: DEFAULT_BACKOFF, maxWaitMs: 45_000 });

  const runs: RunRecord[] = [];
  const modelCalls: Array<Promise<void>> = [];
  let id = 0;
  const day = async () => {
    for (const arrival of arrivals(random)) {
      const minute = arrival.atMs / 60_000;
      const base = { minute, rep: arrival.rep, intent: arrival.intent, path: arrival.path };
      if (arrival.path !== "retrieval") {
        // Approved text or an honest decline, straight from the coach: no model call, nothing to rate-limit.
        runs.push({ ...base, client: "none", outcome: "answered", latencyMs: Math.round(250 + random() * 450), attempts: 0 });
        continue;
      }
      await clock.sleep(arrival.atMs - clock.now());
      const after = arrival.atMs >= DEPLOY_MINUTE * 60_000;
      const client = after ? resilient : naive;
      const lineId = approvedLineId(arrival.question);
      const request = { id: ++id, question: arrival.question, messages: buildMessages(arrival.question, DEFAULT_PARAMS.promptTokens), maxTokens: DEFAULT_PARAMS.maxOutputTokens };
      modelCalls.push(
        client.complete(request, () => undefined).then((result: CoachResult) => {
          const restored = result.ok && lineId !== undefined && !containsVerbatim(result.text, getLine(lineId).line.text);
          runs.push({
            ...base,
            client: after ? "resilient" : "naive",
            outcome: result.ok ? (result.latencyMs > WAIT_MS ? "answered-after-wait" : "answered") : result.error?.code === "busy" ? "busy-retry" : "failed",
            latencyMs: Math.round(result.latencyMs),
            attempts: result.attempts,
            providerStatus: result.error?.providerStatus,
            guardRestored: restored || undefined,
          });
        }),
      );
    }
    await Promise.all(modelCalls);
  };
  await clock.run(day());
  return runs.sort((a, b) => a.minute - b.minute);
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

const unanswered = (run: RunRecord) => run.outcome === "failed" || run.outcome === "busy-retry";

// excerpt:start error-rate
/**
 * A question is unanswered if the rep never got an answer: a hard failure, or a
 * calm "try again". Both count toward the error rate and the alerts.
 */
export function bucketize(runs: RunRecord[], bucketMinutes = BUCKET_MINUTES, dayMinutes = DAY_MINUTES): Bucket[] {
  const buckets: Bucket[] = [];
  for (let start = 0; start < dayMinutes; start += bucketMinutes) {
    const inside = runs.filter((run) => run.minute >= start && run.minute < start + bucketMinutes);
    const failed = inside.filter((run) => run.outcome === "failed").length;
    const busy = inside.filter((run) => run.outcome === "busy-retry").length;
    buckets.push({
      start,
      requests: inside.length,
      failed,
      busy,
      unanswered: failed + busy,
      errorRate: inside.length ? (failed + busy) / inside.length : 0,
      p95Ms: p95(inside.filter((run) => !unanswered(run)).map((run) => run.latencyMs)),
    });
  }
  return buckets;
}
// excerpt:end error-rate

/** Groups consecutive breaching windows into one alert that fires and later resolves. */
function windowAlerts(buckets: Bucket[], breach: (b: Bucket) => boolean, make: (first: Bucket, worst: Bucket) => Omit<Alert, "firedAt" | "resolvedAt">, worse: (a: Bucket, b: Bucket) => boolean): Alert[] {
  const alerts: Alert[] = [];
  let open: { first: Bucket; worst: Bucket } | null = null;
  for (const bucket of buckets) {
    if (breach(bucket)) {
      if (!open) open = { first: bucket, worst: bucket };
      else if (worse(bucket, open.worst)) open.worst = bucket;
    } else if (open) {
      alerts.push({ ...make(open.first, open.worst), firedAt: open.first.start, resolvedAt: bucket.start });
      open = null;
    }
  }
  if (open) alerts.push({ ...make(open.first, open.worst), firedAt: open.first.start });
  return alerts;
}

const unique = (values: string[]) => values.filter((value, index) => values.indexOf(value) === index);

export function evaluateAlerts(runs: RunRecord[], buckets: Bucket[]): Alert[] {
  const alerts: Alert[] = [];
  const misses = runs.filter(unanswered);
  // 3+ unanswered inside any 5-minute window. One alert per window, no repeats within 30 minutes.
  let lastFired = -Infinity;
  for (let i = 0; i < misses.length; i++) {
    const inWindow = misses.filter((f) => f.minute >= misses[i].minute && f.minute < misses[i].minute + 5);
    if (inWindow.length >= 3 && misses[i].minute >= lastFired + 30) {
      const hard = inWindow.filter((f) => f.outcome === "failed");
      alerts.push({
        ruleId: "unanswered",
        severity: "critical",
        title: `${inWindow.length} unanswered questions in 5 minutes`,
        detail: hard.length
          ? `Provider returned 429 to ${unique(hard.map((f) => f.rep)).join(", ")}. Reps saw "The coaching response could not finish".`
          : `The budget was full for ${unique(inWindow.map((f) => f.rep)).join(", ")}. Reps were told to try again.`,
        firedAt: misses[i].minute,
        resolvedAt: inWindow[inWindow.length - 1].minute + 5,
      });
      lastFired = misses[i].minute;
    }
  }
  alerts.push(
    ...windowAlerts(
      buckets,
      (b) => b.requests >= 10 && b.errorRate > ERROR_RATE_THRESHOLD,
      (_first, worst) => ({
        ruleId: "error-rate",
        severity: "critical",
        title: `Error rate ${Math.round(worst.errorRate * 100)}% (threshold 5%)`,
        detail: `${worst.unanswered} of ${worst.requests} questions went unanswered between ${clockLabel(worst.start)} and ${clockLabel(worst.start + BUCKET_MINUTES)}.`,
      }),
      (a, b) => a.errorRate > b.errorRate,
    ),
    ...windowAlerts(
      buckets,
      (b) => b.requests >= 10 && b.p95Ms > 20_000,
      (_first, worst) => ({
        ruleId: "slow-answers",
        severity: "warning",
        title: `Slowest answers took ${Math.round(worst.p95Ms / 1000)} s`,
        detail: "Reps waited in the queue. Smaller prompts or a higher tier remove the wait.",
      }),
      (a, b) => a.p95Ms > b.p95Ms,
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

export interface PeriodStats {
  requests: number;
  failed: number;
  busy: number;
  unanswered: number;
  errorRate: number;
  modelCalls: number;
}

export interface MonitoringSnapshot {
  runs: RunRecord[];
  buckets: Bucket[];
  alerts: Alert[];
  before: PeriodStats;
  after: PeriodStats;
  /** Share of all questions answered from the bank, which never calls the model. */
  bankShare: number;
}

function stats(list: RunRecord[]): PeriodStats {
  const failed = list.filter((r) => r.outcome === "failed").length;
  const busy = list.filter((r) => r.outcome === "busy-retry").length;
  return {
    requests: list.length,
    failed,
    busy,
    unanswered: failed + busy,
    errorRate: (failed + busy) / Math.max(1, list.length),
    modelCalls: list.filter((r) => r.client !== "none").length,
  };
}

const cache = new Map<number, Promise<MonitoringSnapshot>>();

export function monitoringSnapshot(seed = 11): Promise<MonitoringSnapshot> {
  let snapshot = cache.get(seed);
  if (!snapshot) {
    snapshot = simulateDay(seed).then((runs) => {
      const buckets = bucketize(runs);
      return {
        runs,
        buckets,
        alerts: evaluateAlerts(runs, buckets),
        before: stats(runs.filter((r) => r.minute < DEPLOY_MINUTE)),
        after: stats(runs.filter((r) => r.minute >= DEPLOY_MINUTE)),
        bankShare: runs.filter((r) => r.path === "answer-bank").length / Math.max(1, runs.length),
      };
    });
    cache.set(seed, snapshot);
  }
  return snapshot;
}
