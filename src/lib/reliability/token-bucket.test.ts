import { describe, expect, it } from "vitest";
import type { Clock } from "./clock";
import { Semaphore } from "./semaphore";
import { TokenBucket, perMinuteBucket } from "./token-bucket";

function manualClock(): Clock & { t: number } {
  return {
    t: 0,
    now() {
      return this.t;
    },
    sleep: async () => undefined,
  };
}

describe("TokenBucket", () => {
  it("starts full and spends what is taken", () => {
    const clock = manualClock();
    const bucket = perMinuteBucket(30_000, clock);
    expect(bucket.available()).toBe(30_000);
    expect(bucket.tryTake(15_000)).toBe(true);
    expect(bucket.tryTake(15_000)).toBe(true);
    expect(bucket.tryTake(15_000)).toBe(false);
    expect(bucket.available()).toBe(0);
  });

  it("refills continuously at limit per minute, up to capacity", () => {
    const clock = manualClock();
    const bucket = perMinuteBucket(30_000, clock, 0);
    clock.t = 10_000;
    expect(bucket.available()).toBeCloseTo(5_000);
    clock.t = 10 * 60_000;
    expect(bucket.available()).toBe(30_000);
  });

  it("says how long until a request fits, and Infinity when it never can", () => {
    const clock = manualClock();
    const bucket = perMinuteBucket(30_000, clock);
    bucket.tryTake(30_000);
    expect(bucket.msUntil(15_000)).toBe(30_000);
    expect(bucket.msUntil(0)).toBe(0);
    expect(bucket.msUntil(30_001)).toBe(Infinity);
    clock.t = 30_000;
    expect(bucket.msUntil(15_000)).toBe(0);
    expect(bucket.tryTake(15_000)).toBe(true);
  });

  it("projects a queue's wait past capacity", () => {
    const clock = manualClock();
    const bucket = perMinuteBucket(30_000, clock, 0);
    expect(bucket.projectedWaitMs(45_000)).toBe(90_000);
  });

  it("refunds a reservation and never trusts more than the provider reports", () => {
    const clock = manualClock();
    const bucket = new TokenBucket(100, 0, clock, 100);
    bucket.tryTake(60);
    bucket.refund(60);
    expect(bucket.available()).toBe(100);
    bucket.capAt(25);
    expect(bucket.available()).toBe(25);
    bucket.capAt(80);
    expect(bucket.available()).toBe(25);
  });
});

describe("Semaphore", () => {
  it("caps concurrency and hands slots over in arrival order", async () => {
    const semaphore = new Semaphore(2);
    const order: number[] = [];
    const releaseA = await semaphore.acquire();
    const releaseB = await semaphore.acquire();
    expect(semaphore.full).toBe(true);
    const c = semaphore.acquire().then((release) => {
      order.push(3);
      return release;
    });
    const d = semaphore.acquire().then((release) => {
      order.push(4);
      return release;
    });
    expect(semaphore.waiting).toBe(2);
    releaseA();
    releaseA(); // a second call is ignored
    const releaseC = await c;
    expect(order).toEqual([3]);
    expect(semaphore.inUse).toBe(2);
    releaseB();
    await d;
    expect(order).toEqual([3, 4]);
    releaseC();
  });
});
