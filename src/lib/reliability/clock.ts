/**
 * Time is injected everywhere so the same client code can run against the real
 * clock (production, real API) or a virtual clock (deterministic simulation and tests).
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
};

export function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

const nextMacrotask: () => Promise<void> =
  typeof setImmediate === "function"
    ? () => new Promise((resolve) => setImmediate(resolve))
    : () => new Promise((resolve) => setTimeout(resolve, 0));

interface Timer {
  at: number;
  seq: number;
  resolve: () => void;
}

export interface VirtualRunOptions {
  /** Called before time jumps forward. Used to play a run back at a readable pace. */
  onAdvance?: (from: number, to: number) => Promise<void> | void;
  signal?: AbortSignal;
  maxSteps?: number;
}

/**
 * A discrete-event clock. `sleep` registers a timer; `run` lets every pending
 * promise settle, then jumps straight to the next timer. Same inputs, same timeline.
 */
export class VirtualClock implements Clock {
  private current: number;
  private seq = 0;
  private timers: Timer[] = [];

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.timers.push({ at: this.current + Math.max(0, ms), seq: this.seq++, resolve });
    });
  }

  async run<T>(task: Promise<T>, options: VirtualRunOptions = {}): Promise<T> {
    let settled = false;
    task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    const maxSteps = options.maxSteps ?? 500_000;
    for (let step = 0; step < maxSteps; step++) {
      await nextMacrotask();
      await nextMacrotask();
      if (settled) return task;
      if (options.signal?.aborted) throw new Error("Run aborted");
      if (this.timers.length === 0) {
        for (let i = 0; i < 5 && this.timers.length === 0 && !settled; i++) await nextMacrotask();
        if (settled) return task;
        if (this.timers.length === 0) {
          throw new Error("VirtualClock: the task is waiting on something other than the clock");
        }
      }
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers.shift()!;
      if (next.at > this.current && options.onAdvance) {
        await options.onAdvance(this.current, next.at);
      }
      this.current = Math.max(this.current, next.at);
      next.resolve();
    }
    throw new Error("VirtualClock: step limit reached");
  }
}
