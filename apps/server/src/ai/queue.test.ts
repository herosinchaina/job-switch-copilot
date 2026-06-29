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

  it('releases the slot when a task rejects, allowing a later task to run', async () => {
    const q = new ConcurrencyQueue(1)
    await expect(q.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const result = await q.run(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('throws when constructed with max=0', () => {
    expect(() => new ConcurrencyQueue(0)).toThrow('ConcurrencyQueue max must be >= 1')
  })
})
