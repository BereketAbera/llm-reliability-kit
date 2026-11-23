/** FIFO concurrency cap. A released slot is handed straight to the next waiter. */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (limit < 1) throw new Error("Semaphore limit must be at least 1");
  }

  get inUse(): number {
    return this.active;
  }

  get waiting(): number {
    return this.queue.length;
  }

  /** True when acquire() would have to wait. */
  get full(): boolean {
    return this.active >= this.limit;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    };
  }
}
