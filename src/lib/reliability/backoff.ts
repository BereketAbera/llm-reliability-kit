import type { Clock } from "./clock";
import type { Random } from "./random";

export interface BackoffPolicy {
  /** First retry waits up to this long. */
  baseMs: number;
  /** No single wait is longer than this. */
  capMs: number;
  /** Retries after the first attempt. */
  maxRetries: number;
  /** Extra random spread added on top of a provider's retry-after hint. */
  hintJitterMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  capMs: 32_000,
  maxRetries: 4,
  hintJitterMs: 250,
};

// excerpt:start backoff
/** Full jitter: wait a random time between 0 and the exponential ceiling. */
export function fullJitterDelay(attempt: number, policy: BackoffPolicy, random: Random): number {
  const ceiling = Math.min(policy.capMs, policy.baseMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

/**
 * The provider's retry-after is a floor: retrying sooner only burns another
 * request. A little jitter on top stops clients that got the same hint from
 * retrying in lockstep. Without a hint, fall back to full jitter.
 */
export function retryDelay(
  attempt: number,
  policy: BackoffPolicy,
  random: Random,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.ceil(retryAfterMs) + Math.floor(random() * policy.hintJitterMs);
  }
  return fullJitterDelay(attempt, policy, random);
}
// excerpt:end backoff

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export class RetriesExhaustedError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastError: RetryableError,
  ) {
    super(`Gave up after ${attempts} attempts: ${lastError.message}`);
    this.name = "RetriesExhaustedError";
  }
}

export class DeadlineExceededError extends Error {
  constructor(
    readonly waitMs: number,
    readonly lastError?: RetryableError,
  ) {
    super(`Waiting ${Math.round(waitMs)} ms more would pass the answer's time budget`);
    this.name = "DeadlineExceededError";
  }
}

export interface RetryInfo {
  attempt: number;
  delayMs: number;
  error: RetryableError;
}

export interface RetryOptions {
  policy: BackoffPolicy;
  random: Random;
  clock: Clock;
  /** Absolute time (clock ms) after which we stop and tell the rep to try again. */
  deadline?: number;
  onRetry?: (info: RetryInfo) => void;
}

// excerpt:start with-retry
export async function withRetry<T>(
  attemptFn: (attempt: number) => Promise<T>,
  { policy, random, clock, deadline, onRetry }: RetryOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptFn(attempt);
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      if (attempt >= policy.maxRetries) throw new RetriesExhaustedError(attempt + 1, error);
      const delayMs = retryDelay(attempt, policy, random, error.retryAfterMs);
      if (deadline !== undefined && clock.now() + delayMs > deadline) {
        throw new DeadlineExceededError(delayMs, error);
      }
      onRetry?.({ attempt, delayMs, error });
      await clock.sleep(delayMs);
    }
  }
}
// excerpt:end with-retry

/** Parses durations like "6m0s", "1.5s" or "250ms" (the x-ratelimit-reset-* format). */
export function parseDuration(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed) * 1000;
  const pattern = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const match of trimmed.matchAll(pattern)) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    total += unit === "ms" ? amount : unit === "s" ? amount * 1000 : unit === "m" ? amount * 60_000 : amount * 3_600_000;
  }
  return matched ? total : undefined;
}

/** Reads the provider's hint in order of precision: retry-after-ms, retry-after, then the reset header. */
export function parseRetryAfter(headers: Headers, now: number = Date.now()): number | undefined {
  const ms = headers.get("retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const seconds = headers.get("retry-after");
  if (seconds) {
    if (Number.isFinite(Number(seconds))) return Math.max(0, Number(seconds) * 1000);
    const date = Date.parse(seconds);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return parseDuration(headers.get("x-ratelimit-reset-tokens")) ?? parseDuration(headers.get("x-ratelimit-reset-requests"));
}
