// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

describe('ops-console tokens', () => {
  it('loads Space Grotesk and IBM Plex Mono', () => {
    expect(css).toMatch(/Space\+Grotesk|Space Grotesk/)
    expect(css).toMatch(/IBM\+Plex\+Mono|IBM Plex Mono/)
    expect(css).not.toMatch(/family=Inter/)
  })
  it('uses champagne accent in dark theme', () => {
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--accent:\s*217\s+184\s+119/)
  })
  it('defines hub-tile hover lift with reduced-motion escape', () => {
    expect(css).toMatch(/\.hub-tile:hover/)
    expect(css).toMatch(/prefers-reduced-motion/)
  })
})
