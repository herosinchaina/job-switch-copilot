import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { ClaudeCliProvider, completeJson } from './claude-cli'
import { z } from 'zod'

function makeCp(payload: string, code = 0) {
  const cp: any = new EventEmitter()
  cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
  cp.stdin = { write: vi.fn(), end: vi.fn() }; cp.kill = vi.fn()
  setTimeout(() => { cp.stdout.emit('data', payload); cp.emit('close', code) }, 5)
  return cp
}

describe('ClaudeCliProvider', () => {
  it('uses shell:false and feeds prompt via stdin', async () => {
    const spawnFn = vi.fn((_cmd: string, _args: string[], _opts: any) => makeCp('hello'))
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const out = await p.complete({ system: 'sys', prompt: 'hi; rm -rf /' })
    expect(out).toBe('hello')
    expect(spawnFn.mock.calls[0][2]).toMatchObject({ shell: false })
  })

  it('completeJson retries once on invalid JSON then succeeds', async () => {
    let n = 0
    const spawnFn = vi.fn(() => makeCp(n++ === 0 ? 'not json' : '{"v":1}'))
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const r = await completeJson(p, z.object({ v: z.number() }), { system:'s', prompt:'p' })
    expect(r).toEqual({ v: 1 })
    expect(spawnFn).toHaveBeenCalledTimes(2)
  })
})
