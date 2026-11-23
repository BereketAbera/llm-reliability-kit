import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKOFF,
  DeadlineExceededError,
  RetriesExhaustedError,
  RetryableError,
  fullJitterDelay,
  parseDuration,
  parseRetryAfter,
  retryDelay,
  withRetry,
  type BackoffPolicy,
} from "./backoff";
import { realClock } from "./clock";
import { seededRandom } from "./random";

const policy: BackoffPolicy = { ...DEFAULT_BACKOFF, baseMs: 1_000, capMs: 8_000, maxRetries: 3, hintJitterMs: 250 };

describe("full jitter", () => {
  it("draws uniformly between zero and the exponential ceiling", () => {
    expect(fullJitterDelay(0, policy, () => 0.5)).toBe(500);
    expect(fullJitterDelay(1, policy, () => 0.5)).toBe(1_000);
    expect(fullJitterDelay(2, policy, () => 0.5)).toBe(2_000);
    expect(fullJitterDelay(3, policy, () => 0)).toBe(0);
    expect(fullJitterDelay(2, policy, () => 0.9999)).toBe(3_999);
  });

  it("never waits longer than the cap", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(fullJitterDelay(attempt, policy, () => 0.9999)).toBeLessThan(policy.capMs);
    }
  });

  it("spreads clients out instead of retrying in lockstep", () => {
    const random = seededRandom(42);
    const delays = Array.from({ length: 50 }, () => fullJitterDelay(3, policy, random));
    expect(new Set(delays).size).toBeGreaterThan(45);
    expect(Math.min(...delays)).toBeLessThan(2_000);
    expect(Math.max(...delays)).toBeGreaterThan(6_000);
  });
});

describe("retry-after", () => {
  it("is a floor: never retry before the provider's hint, plus a little jitter", () => {
    expect(retryDelay(0, policy, () => 0, 30_000)).toBe(30_000);
    expect(retryDelay(5, policy, () => 0.5, 30_000)).toBe(30_125);
    expect(retryDelay(0, policy, () => 0.9999, 1_200)).toBeLessThan(1_200 + policy.hintJitterMs);
  });

  it("falls back to full jitter when there is no hint", () => {
    expect(retryDelay(1, policy, () => 0.5)).toBe(1_000);
  });

  it("reads retry-after-ms, retry-after in seconds or as a date, then the reset header", () => {
    expect(parseRetryAfter(new Headers({ "retry-after-ms": "1500", "retry-after": "9" }))).toBe(1_500);
    expect(parseRetryAfter(new Headers({ "retry-after": "7" }))).toBe(7_000);
    const now = Date.parse("2026-11-23T10:00:00Z");
    expect(parseRetryAfter(new Headers({ "retry-after": "Mon, 23 Nov 2026 10:00:05 GMT" }), now)).toBe(5_000);
    expect(parseRetryAfter(new Headers({ "x-ratelimit-reset-tokens": "6m0s" }))).toBe(360_000);
    expect(parseRetryAfter(new Headers())).toBeUndefined();
  });

  it("parses provider durations", () => {
    expect(parseDuration("1.5s")).toBe(1_500);
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("1m30s")).toBe(90_000);
    expect(parseDuration("nonsense")).toBeUndefined();
  });
});

describe("withRetry (fake timers)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits out each backoff delay before the next attempt", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async (n: number) => {
      if (n < 2) throw new RetryableError("429", undefined, 429);
      return "answered";
    });
    const result = withRetry(attempt, { policy, random: () => 0.5, clock: realClock });

    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499); // first delay: 0.5 * 1000
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999); // second delay: 0.5 * 2000
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("answered");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("honors the retry-after carried by the error", async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const attempt = vi.fn(async (n: number) => {
      if (n === 0) throw new RetryableError("429", 3_000, 429);
      return "ok";
    });
    const result = withRetry(attempt, { policy, random: () => 0, clock: realClock, onRetry });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 0, delayMs: 3_000 }));
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
  });

  it("gives up after the retry cap", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {
      throw new RetryableError("429", undefined, 429);
    });
    const result = withRetry(attempt, { policy, random: () => 0.5, clock: realClock }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    const error = await result;
    expect(error).toBeInstanceOf(RetriesExhaustedError);
    expect((error as RetriesExhaustedError).attempts).toBe(policy.maxRetries + 1);
    expect(attempt).toHaveBeenCalledTimes(policy.maxRetries + 1);
  });

  it("stops early when waiting would pass the deadline", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {
      throw new RetryableError("429", 20_000, 429);
    });
    const deadline = Date.now() + 10_000;
    const result = withRetry(attempt, { policy, random: () => 0, clock: realClock, deadline }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBeInstanceOf(DeadlineExceededError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does not retry errors that are not retryable", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("400 bad request");
    });
    await expect(withRetry(attempt, { policy, random: () => 0, clock: realClock })).rejects.toThrow("400 bad request");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
