// Per-host politeness: requests to one host run one at a time, at least `intervalMs` apart.
import type { Sleep } from './http.js';

export class HostQueue {
  private readonly last = new Map<string, number>();
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly minInterval = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly sleep: Sleep,
    private readonly now: () => number = Date.now,
  ) {}

  /** Raise the interval for one host (robots.txt Crawl-delay), capped at 30 s. */
  setHostInterval(host: string, ms: number): void {
    this.minInterval.set(host, Math.min(Math.max(ms, this.intervalMs), 30_000));
  }

  intervalFor(host: string): number {
    return this.minInterval.get(host) ?? this.intervalMs;
  }

  run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(host) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const last = this.last.get(host);
        if (last !== undefined) {
          const wait = last + this.intervalFor(host) - this.now();
          if (wait > 0) await this.sleep(wait);
        }
        try {
          return await fn();
        } finally {
          this.last.set(host, this.now());
        }
      });
    this.tails.set(host, next);
    return next;
  }
}

/** Runs `worker` over `items` with at most `concurrency` in flight; preserves result order. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]!, i);
      }
    },
  );
  await Promise.all(lanes);
  return out;
}
