import { describe, it, expect } from 'vitest'
import { ConcurrencyQueue } from './queue'

describe('ConcurrencyQueue', () => {
  it('never runs more than max tasks at once', async () => {
    const q = new ConcurrencyQueue(2)
    let active = 0, peak = 0
    const task = () => q.run(async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 20)); active--
    })
    await Promise.all([task(),task(),task(),task(),task()])
    expect(peak).toBeLessThanOrEqual(2)
  })
})
