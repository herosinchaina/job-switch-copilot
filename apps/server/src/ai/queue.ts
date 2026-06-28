export class ConcurrencyQueue {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(r => this.waiters.push(r))
    this.active++
    try { return await fn() }
    finally { this.active--; this.waiters.shift()?.() }
  }
}
