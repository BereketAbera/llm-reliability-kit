import type { Clock } from "./clock";

const EPSILON = 1e-6;

/**
 * Continuous-refill token bucket. Used twice: by the simulated provider to enforce
 * its limits, and by the resilient client to predict them before sending.
 */
export class TokenBucket {
  private level: number;
  private updatedAt: number;

  constructor(
    readonly capacity: number,
    readonly refillPerMs: number,
    private readonly clock: Clock,
    initial: number = capacity,
  ) {
    this.level = Math.max(0, Math.min(capacity, initial));
    this.updatedAt = clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.updatedAt;
    if (elapsed > 0) {
      this.level = Math.min(this.capacity, this.level + elapsed * this.refillPerMs);
      this.updatedAt = now;
    }
  }

  available(): number {
    this.refill();
    return this.level;
  }

  /** Milliseconds until `amount` fits. 0 when it fits now, Infinity when it never can. */
  msUntil(amount: number): number {
    if (amount > this.capacity + EPSILON) return Infinity;
    const missing = amount - this.available();
    if (missing <= EPSILON) return 0;
    if (this.refillPerMs <= 0) return Infinity;
    return Math.ceil(missing / this.refillPerMs);
  }

  /** Time until `amount` has refilled, ignoring capacity: how long a queue of requests needs. */
  projectedWaitMs(amount: number): number {
    const missing = amount - this.available();
    if (missing <= EPSILON) return 0;
    return this.refillPerMs > 0 ? Math.ceil(missing / this.refillPerMs) : Infinity;
  }

  tryTake(amount: number): boolean {
    if (this.available() + EPSILON < amount) return false;
    this.level = Math.max(0, this.level - amount);
    return true;
  }

  /** Give back a reservation the provider never charged (for example after a 429). */
  refund(amount: number): void {
    this.refill();
    this.level = Math.min(this.capacity, this.level + amount);
  }

  /** The provider's headers are the source of truth: never assume more than it reports. */
  capAt(remaining: number): void {
    this.refill();
    this.level = Math.min(this.level, Math.max(0, remaining));
  }
}

export function perMinuteBucket(limitPerMinute: number, clock: Clock, initial?: number): TokenBucket {
  return new TokenBucket(limitPerMinute, limitPerMinute / 60_000, clock, initial);
}
