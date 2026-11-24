/** Fixed-window counter: allow `max` hits per `windowMs` per key. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  /** Drop expired entries so the map cannot grow forever. */
  prune(): void {
    const t = this.now();
    for (const [key, e] of this.hits) if (t >= e.resetAt) this.hits.delete(key);
  }
}
