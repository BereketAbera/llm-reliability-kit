import {
  DEFAULT_BACKOFF,
  DeadlineExceededError,
  RetriesExhaustedError,
  RetryableError,
  parseRetryAfter,
  withRetry,
  type BackoffPolicy,
} from "./backoff";
import type { Clock } from "./clock";
import { estimatePromptTokens } from "./estimate";
import type { Random } from "./random";
import { Semaphore } from "./semaphore";
import { readSSE } from "./sse";
import { perMinuteBucket, type TokenBucket } from "./token-bucket";
import type { ChatMessage, ChatRequestBody, RateLimits, Transport, Usage } from "./types";

export const CHAT_URL = "https://api.openai.com/v1/chat/completions";
/**
 * The scenario assumes a 30,000 tokens-per-minute limit, which is what OpenAI's
 * Tier 1 listed for gpt-4o-class models (gpt-4o-mini had far more). Confirm the
 * real number from x-ratelimit-limit-tokens on one of your own 429s.
 */
export const DEFAULT_MODEL = "gpt-4o";
export const HARSH_ERROR = "The coaching response could not finish";

export interface CoachRequest {
  id: number;
  question: string;
  messages: ChatMessage[];
  maxTokens: number;
}

export type CoachErrorCode = "provider_error" | "busy" | "too_large" | "interrupted";

export interface CoachError {
  code: CoachErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
  providerStatus?: number;
  /** Technical detail for logs. */
  message: string;
  /** What the rep sees. */
  userMessage: string;
}

export type ClientEvent =
  | { type: "arrive"; id: number; t: number; promptTokens: number; question: string; lineId?: string }
  | { type: "queued"; id: number; t: number; reason: "concurrency" | "tokens"; waitMs?: number }
  | { type: "send"; id: number; t: number; attempt: number; estimatedTokens: number }
  | {
      type: "rate_limited";
      id: number;
      t: number;
      attempt: number;
      status: number;
      retryAfterMs?: number;
      message: string;
    }
  | { type: "backoff"; id: number; t: number; attempt: number; delayMs: number }
  | { type: "first_token"; id: number; t: number }
  | { type: "delta"; id: number; t: number; text: string }
  | { type: "done"; id: number; t: number; latencyMs: number; attempts: number; text: string; usage?: Usage }
  | { type: "error"; id: number; t: number; latencyMs: number; attempts: number; error: CoachError };

export type Emit = (event: ClientEvent) => void;

export interface CoachResult {
  id: number;
  ok: boolean;
  text: string;
  attempts: number;
  latencyMs: number;
  error?: CoachError;
}

export interface CoachClient {
  readonly name: string;
  complete(request: CoachRequest, emit: Emit): Promise<CoachResult>;
}

function chatBody(request: CoachRequest, model: string): ChatRequestBody {
  return {
    model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}

function post(transport: Transport, url: string, body: ChatRequestBody, headers: Record<string, string>) {
  return transport(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Reads an OpenAI-style SSE body and forwards each piece as it arrives. */
async function consumeStream(
  response: Response,
  request: CoachRequest,
  clock: Clock,
  emit: Emit,
): Promise<{ text: string; usage?: Usage }> {
  if (!response.body) throw new Error("Empty response body");
  let text = "";
  let usage: Usage | undefined;
  let first = true;
  for await (const message of readSSE(response.body)) {
    if (message.data === "[DONE]") break;
    const chunk = JSON.parse(message.data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: Usage;
      error?: { message?: string };
    };
    if (chunk.error) throw new Error(chunk.error.message ?? "Stream error");
    const piece = chunk.choices?.[0]?.delta?.content ?? "";
    if (piece) {
      if (first) {
        emit({ type: "first_token", id: request.id, t: clock.now() });
        first = false;
      }
      text += piece;
      emit({ type: "delta", id: request.id, t: clock.now(), text: piece });
    }
    if (chunk.usage) usage = chunk.usage;
  }
  return { text, usage };
}

export interface ClientBaseOptions {
  transport: Transport;
  clock: Clock;
  model?: string;
  url?: string;
  headers?: Record<string, string>;
}

/** What many apps ship first: send immediately, no queue, no retry. */
export function createNaiveClient({ transport, clock, model = DEFAULT_MODEL, url = CHAT_URL, headers = {} }: ClientBaseOptions): CoachClient {
  return {
    name: "naive",
    async complete(request, emit) {
      const startedAt = clock.now();
      emit({ type: "send", id: request.id, t: startedAt, attempt: 0, estimatedTokens: estimatePromptTokens(request.messages) + request.maxTokens });
      const response = await post(transport, url, chatBody(request, model), headers);
      if (!response.ok) {
        const message = await readErrorMessage(response);
        const error: CoachError = {
          code: "provider_error",
          retryable: false,
          providerStatus: response.status,
          message,
          userMessage: HARSH_ERROR,
        };
        if (response.status === 429) {
          emit({ type: "rate_limited", id: request.id, t: clock.now(), attempt: 0, status: 429, retryAfterMs: parseRetryAfter(response.headers, clock.now()), message });
        }
        const latencyMs = clock.now() - startedAt;
        emit({ type: "error", id: request.id, t: clock.now(), latencyMs, attempts: 1, error });
        return { id: request.id, ok: false, text: "", attempts: 1, latencyMs, error };
      }
      const { text, usage } = await consumeStream(response, request, clock, emit);
      const latencyMs = clock.now() - startedAt;
      emit({ type: "done", id: request.id, t: clock.now(), latencyMs, attempts: 1, text, usage });
      return { id: request.id, ok: true, text, attempts: 1, latencyMs };
    },
  };
}

export interface ResilientClientOptions extends ClientBaseOptions {
  random: Random;
  limits: RateLimits;
  maxConcurrency?: number;
  policy?: BackoffPolicy;
  /** Longest a rep should wait before we say "busy, try again" instead of hanging. */
  maxWaitMs?: number;
}

class BusyError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate budget is full for the next ${Math.round(retryAfterMs)} ms`);
    this.name = "BusyError";
  }
}

/**
 * What a rep sees when the budget is full. It promises only what happens: nothing
 * is queued or retried for them, so it says when to tap Try again, and never
 * quotes a wait longer than the client would have waited itself.
 */
export function calmMessage(retryAfterMs?: number, maxWaitMs = 45_000): string {
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs)) {
    return "Lots of reps are asking right now. Tap Try again in a moment.";
  }
  if (retryAfterMs > maxWaitMs) return "Lots of reps are asking right now. Tap Try again in a minute or two.";
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Lots of reps are asking right now. Tap Try again in about ${seconds} seconds.`;
}

export const WAITING_MESSAGE = "Busy moment. Your answer is queued and will start shortly.";

/**
 * Token-aware admission (estimate before sending, local token bucket),
 * a concurrency cap, exponential backoff with full jitter that honors
 * retry-after, a retry cap, and a clean error the UI can turn into a calm message.
 */
export function createResilientClient(options: ResilientClientOptions): CoachClient {
  const {
    transport,
    clock,
    random,
    limits,
    model = DEFAULT_MODEL,
    url = CHAT_URL,
    headers = {},
    maxConcurrency = 4,
    policy = DEFAULT_BACKOFF,
    maxWaitMs = 45_000,
  } = options;
  const slots = new Semaphore(maxConcurrency);
  const admissionLine = new Semaphore(1);
  const tokens: TokenBucket = perMinuteBucket(limits.tpm, clock);
  const requests: TokenBucket = perMinuteBucket(limits.rpm, clock);
  /** Tokens wanted by requests that arrived but are not admitted yet. */
  let backlog = 0;

  // excerpt:start admission
  /** Wait until the local budget says the provider will accept this request, then reserve it. */
  async function waitForBudget(request: CoachRequest, cost: number, deadline: number, emit: Emit) {
    for (;;) {
      const waitMs = Math.max(tokens.msUntil(cost), requests.msUntil(1));
      if (waitMs === 0) {
        tokens.tryTake(cost);
        requests.tryTake(1);
        return;
      }
      if (clock.now() + waitMs > deadline) throw new BusyError(waitMs);
      emit({ type: "queued", id: request.id, t: clock.now(), reason: "tokens", waitMs });
      await clock.sleep(waitMs);
    }
  }
  // excerpt:end admission

  function syncFromHeaders(response: Response) {
    const remainingTokens = Number(response.headers.get("x-ratelimit-remaining-tokens"));
    const remainingRequests = Number(response.headers.get("x-ratelimit-remaining-requests"));
    if (response.headers.has("x-ratelimit-remaining-tokens") && Number.isFinite(remainingTokens)) tokens.capAt(remainingTokens);
    if (response.headers.has("x-ratelimit-remaining-requests") && Number.isFinite(remainingRequests)) requests.capAt(remainingRequests);
  }

  return {
    name: "resilient",
    async complete(request, emit) {
      const arrivedAt = clock.now();
      const deadline = arrivedAt + maxWaitMs;
      const cost = estimatePromptTokens(request.messages) + request.maxTokens;
      let attempts = 0;

      const fail = (error: CoachError): CoachResult => {
        const latencyMs = clock.now() - arrivedAt;
        emit({ type: "error", id: request.id, t: clock.now(), latencyMs, attempts, error });
        return { id: request.id, ok: false, text: "", attempts, latencyMs, error };
      };

      if (cost > limits.tpm) {
        return fail({
          code: "too_large",
          retryable: false,
          message: `Request needs about ${cost} tokens but the limit is ${limits.tpm} per minute`,
          userMessage: "This question pulled in more reference material than one minute of budget allows. Try asking about one situation at a time.",
        });
      }

      // excerpt:start shed
      // Fail fast: if the line ahead already needs more budget than this rep can wait for, say so now.
      const projectedMs = tokens.projectedWaitMs(backlog + cost);
      if (projectedMs > maxWaitMs) {
        return fail({
          code: "busy",
          retryable: true,
          retryAfterMs: projectedMs,
          message: `Queue needs about ${Math.round(projectedMs / 1000)} s of token budget before this request`,
          userMessage: calmMessage(projectedMs, maxWaitMs),
        });
      }
      // excerpt:end shed
      backlog += cost;
      let inBacklog = true;
      const leaveBacklog = () => {
        if (inBacklog) backlog -= cost;
        inBacklog = false;
      };

      if (slots.full) emit({ type: "queued", id: request.id, t: clock.now(), reason: "concurrency" });
      const release = await slots.acquire();
      try {
        // excerpt:start resilient-send
        // Single-file admission: while one request waits out a retry-after,
        // nobody behind it sends (they would only get the same 429).
        const leaveLine = await admissionLine.acquire();
        let response: Response;
        try {
          response = await withRetry(
            async (attempt) => {
              await waitForBudget(request, cost, deadline, emit);
              leaveBacklog();
              attempts++;
              emit({ type: "send", id: request.id, t: clock.now(), attempt, estimatedTokens: cost });
              const res = await post(transport, url, chatBody(request, model), headers);
              if (res.status === 429 || res.status >= 500) {
                tokens.refund(cost); // a rejected request is not charged for tokens
                syncFromHeaders(res);
                const retryAfterMs = parseRetryAfter(res.headers, clock.now());
                const message = await readErrorMessage(res);
                emit({ type: "rate_limited", id: request.id, t: clock.now(), attempt, status: res.status, retryAfterMs, message });
                throw new RetryableError(message, retryAfterMs, res.status);
              }
              syncFromHeaders(res);
              if (!res.ok) throw new Error(await readErrorMessage(res));
              return res;
            },
            {
              policy,
              random,
              clock,
              deadline,
              onRetry: ({ attempt, delayMs }) => emit({ type: "backoff", id: request.id, t: clock.now(), attempt, delayMs }),
            },
          );
        } finally {
          leaveLine();
        }
        // excerpt:end resilient-send
        try {
          const { text, usage } = await consumeStream(response, request, clock, emit);
          const latencyMs = clock.now() - arrivedAt;
          emit({ type: "done", id: request.id, t: clock.now(), latencyMs, attempts, text, usage });
          return { id: request.id, ok: true, text, attempts, latencyMs };
        } catch (streamError) {
          return fail({
            code: "interrupted",
            retryable: true,
            message: streamError instanceof Error ? streamError.message : String(streamError),
            userMessage: "The answer was interrupted. Tap Try again.",
          });
        }
      } catch (error) {
        // excerpt:start clean-error
        if (error instanceof BusyError || error instanceof DeadlineExceededError || error instanceof RetriesExhaustedError) {
          const retryAfterMs =
            error instanceof BusyError
              ? error.retryAfterMs
              : error instanceof DeadlineExceededError
                ? error.waitMs
                : error.lastError.retryAfterMs;
          return fail({
            code: "busy",
            retryable: true,
            retryAfterMs,
            providerStatus: error instanceof BusyError ? undefined : 429,
            message: error.message,
            userMessage: calmMessage(retryAfterMs, maxWaitMs),
          });
        }
        // excerpt:end clean-error
        return fail({
          code: "provider_error",
          retryable: true,
          message: error instanceof Error ? error.message : String(error),
          userMessage: "Something went wrong on our side. Tap Try again.",
        });
      } finally {
        leaveBacklog();
        release();
      }
    },
  };
}
