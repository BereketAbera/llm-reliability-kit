import { answerQuestion } from "../coach/coach";
import { ANSWER_BANK } from "../content/answer-bank";
import { CATALOG } from "../content/catalog";
import { DEFAULT_BACKOFF } from "./backoff";
import { createNaiveClient, createResilientClient, type ClientEvent, type CoachClient, type CoachRequest } from "./clients";
import { VirtualClock, realSleep } from "./clock";
import { CHARS_PER_TOKEN, estimatePromptTokens } from "./estimate";
import { SimulatedProvider, type ProviderStats } from "./provider";
import { seededRandom } from "./random";
import { buildTimelines, summarize, type RequestTimeline, type VariantSummary } from "./timeline";
import type { ChatMessage } from "./types";

export type VariantKey = "naive" | "resilient" | "trimmed";
export const VARIANT_KEYS: VariantKey[] = ["naive", "resilient", "trimmed"];

export interface ScenarioParams {
  /** Reps asking within the same second. */
  concurrency: number;
  /** Prompt size with whole documents pasted in. */
  promptTokens: number;
  /** Prompt size with trimmed retrieval context. */
  trimmedTokens: number;
  maxOutputTokens: number;
  tpm: number;
  rpm: number;
  /** Tokens per minute other traffic already uses on the same key. */
  otherTrafficTpm: number;
  seed: number;
}

export const DEFAULT_PARAMS: ScenarioParams = {
  concurrency: 3,
  promptTokens: 14_500,
  trimmedTokens: 4_000,
  maxOutputTokens: 500,
  tpm: 30_000,
  rpm: 500,
  otherTrafficTpm: 0,
  seed: 7,
};

export const LIMITS = {
  concurrency: { min: 1, max: 12 },
  promptTokens: { min: 1_000, max: 28_000 },
  trimmedTokens: { min: 500, max: 12_000 },
  maxOutputTokens: { min: 100, max: 4_000 },
  tpm: { min: 10_000, max: 2_000_000 },
  rpm: { min: 10, max: 10_000 },
  otherTrafficTpm: { min: 0, max: 25_000 },
  seed: { min: 1, max: 9_999 },
} as const;

export interface Preset {
  key: string;
  label: string;
  description: string;
  params: ScenarioParams;
}

export const PRESETS: Preset[] = [
  {
    key: "post",
    label: "Three at once",
    description: "The scenario from the logs: three reps ask together, about 14,500 prompt tokens each, on a 30,000 tokens-per-minute tier.",
    params: DEFAULT_PARAMS,
  },
  {
    key: "shared-key",
    label: "Shared key, busy hour",
    description: "Six reps at once while another app instance spends 9,000 tokens a minute on the same key. The client cannot see that traffic, so 429s get through and must be retried.",
    params: { ...DEFAULT_PARAMS, concurrency: 6, otherTrafficTpm: 9_000 },
  },
  {
    key: "higher-tier",
    label: "Higher usage tier",
    description: "The same three requests against a 450,000 tokens-per-minute tier.",
    params: { ...DEFAULT_PARAMS, tpm: 450_000, rpm: 5_000 },
  },
];

export const VARIANTS: Record<VariantKey, { title: string; summary: string }> = {
  naive: {
    title: "Naive client",
    summary: "Sends every request the moment it arrives. No queue, no retry. A 429 reaches the rep as an error.",
  },
  resilient: {
    title: "Resilient client",
    summary: "Estimates tokens first and waits in a local token bucket, caps concurrency at 4, retries with full-jitter backoff that honors retry-after (4 retries max), and says \"busy, try again\" calmly when the wait would pass 45 seconds.",
  },
  trimmed: {
    title: "Resilient + trimmed context",
    summary: "The same client, but retrieval sends the matched section and top lines (about 4,000 tokens) instead of whole documents.",
  },
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeParams(input: Partial<Record<keyof ScenarioParams, unknown>>): ScenarioParams {
  const out = { ...DEFAULT_PARAMS };
  for (const key of Object.keys(LIMITS) as Array<keyof ScenarioParams>) {
    out[key] = clampInt(input[key] ?? DEFAULT_PARAMS[key], LIMITS[key].min, LIMITS[key].max, DEFAULT_PARAMS[key]);
  }
  return out;
}

export const SYSTEM_PROMPT = [
  `You are a sales coach for ${"the Clear Next Step method (fictional)"}.`,
  "Answer only from the approved material below. When an APPROVED LINE is given, quote it word for word.",
  "Never give generic sales advice. If nothing approved fits, say so.",
].join("\n");

/** Reference text in library order, used to pad prompts to a realistic size. */
function libraryText(): string {
  return CATALOG.documents
    .flatMap((doc) =>
      doc.sections.map(
        (section) => `## ${doc.title} v${doc.version}: ${section.title}\n${section.why.text}\n${section.scripts.map((l) => `- ${l.text}`).join("\n")}`,
      ),
    )
    .join("\n\n");
}

const LIBRARY_TEXT = libraryText();

/** Builds a prompt of `targetTokens` (by the shared estimate): instructions, the approved line, reference text, question. */
export function buildMessages(question: string, targetTokens: number): ChatMessage[] {
  const answer = answerQuestion(question);
  const approved = answer.quote ? `APPROVED LINE [${answer.quote.lineId}]: "${answer.quote.text}"` : "No approved line matched.";
  const base: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${approved}` },
    { role: "system", content: "Reference material:\n" },
    { role: "user", content: question },
  ];
  const missingTokens = targetTokens - estimatePromptTokens(base);
  if (missingTokens > 0) {
    let filler = "";
    const needChars = missingTokens * CHARS_PER_TOKEN;
    while (filler.length < needChars) filler += `${LIBRARY_TEXT}\n\n`;
    base[1] = { role: "system", content: `Reference material:\n${filler.slice(0, needChars)}` };
  }
  return base;
}

export interface VariantRun {
  variant: VariantKey;
  params: ScenarioParams;
  promptTokens: number;
  events: ClientEvent[];
  timelines: RequestTimeline[];
  summary: VariantSummary;
  provider: ProviderStats;
}

export interface RunOptions {
  onEvent?: (event: ClientEvent) => void;
  /** Real milliseconds per virtual millisecond. 0 runs instantly. */
  pace?: number;
  /** Longest real pause for one jump in virtual time. */
  maxPauseMs?: number;
  signal?: AbortSignal;
  /** Keep per-token delta events in the returned log (off keeps payloads small). */
  keepDeltas?: boolean;
}

export function questionsFor(count: number): string[] {
  return Array.from({ length: count }, (_, i) => ANSWER_BANK[(i * 7) % ANSWER_BANK.length].examples[0]);
}

/** Runs one variant on a fresh provider and a virtual clock. Same params and seed, same result. */
export async function runVariant(params: ScenarioParams, variant: VariantKey, options: RunOptions = {}): Promise<VariantRun> {
  const clock = new VirtualClock();
  const arrivals = seededRandom(params.seed);
  const jitter = seededRandom(params.seed * 7919 + VARIANT_KEYS.indexOf(variant));
  const provider = new SimulatedProvider({
    tier: { label: "Simulated tier", tpm: params.tpm, rpm: params.rpm },
    clock,
    otherTrafficTpm: params.otherTrafficTpm,
  });
  const client: CoachClient =
    variant === "naive"
      ? createNaiveClient({ transport: provider.transport, clock })
      : createResilientClient({
          transport: provider.transport,
          clock,
          random: jitter,
          limits: { tpm: params.tpm, rpm: params.rpm },
          maxConcurrency: 4,
          policy: DEFAULT_BACKOFF,
          maxWaitMs: 45_000,
        });
  const promptTokens = variant === "trimmed" ? Math.min(params.trimmedTokens, params.promptTokens) : params.promptTokens;
  const offsets = Array.from({ length: params.concurrency }, (_, i) => (i === 0 ? 0 : Math.floor(arrivals() * 400))).sort((a, b) => a - b);
  const requests: Array<CoachRequest & { at: number }> = questionsFor(params.concurrency).map((question, i) => ({
    id: i + 1,
    question,
    messages: buildMessages(question, promptTokens),
    maxTokens: params.maxOutputTokens,
    at: offsets[i],
  }));

  const events: ClientEvent[] = [];
  const emit = (event: ClientEvent) => {
    if (event.type !== "delta" || options.keepDeltas) events.push(event);
    options.onEvent?.(event);
  };
  const task = Promise.all(
    requests.map(async (request) => {
      await clock.sleep(request.at);
      emit({ type: "arrive", id: request.id, t: clock.now(), promptTokens: estimatePromptTokens(request.messages), question: request.question });
      return client.complete(request, emit);
    }),
  );
  const pace = options.pace ?? 0;
  const maxPause = options.maxPauseMs ?? 1_200;
  await clock.run(task, {
    signal: options.signal,
    onAdvance: pace > 0 ? (from, to) => realSleep(Math.min((to - from) * pace, maxPause)) : undefined,
  });
  const timelines = buildTimelines(events);
  return { variant, params, promptTokens, events, timelines, summary: summarize(timelines), provider: { ...provider.stats } };
}

export async function runComparison(params: ScenarioParams = DEFAULT_PARAMS): Promise<Record<VariantKey, VariantRun>> {
  const [naive, resilient, trimmed] = await Promise.all(VARIANT_KEYS.map((key) => runVariant(params, key)));
  return { naive, resilient, trimmed };
}

/** Requests that fit in one minute, and the TPM a group of reps needs. */
export function capacity(params: Pick<ScenarioParams, "tpm" | "promptTokens" | "maxOutputTokens">, reps: number) {
  const perRequest = params.promptTokens + params.maxOutputTokens;
  return {
    perRequest,
    requestsPerMinute: Math.floor(params.tpm / perRequest),
    neededTpm: reps * perRequest,
  };
}
