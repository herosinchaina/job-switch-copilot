export class ConcurrencyQueue {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private max: number) {
    if (max < 1) throw new Error('ConcurrencyQueue max must be >= 1')
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(r => this.waiters.push(r))
    this.active++
    try { return await fn() }
    finally { this.active--; this.waiters.shift()?.() }
  }
}
