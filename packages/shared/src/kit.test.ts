import { describe, it, expect } from 'vitest'
import { InterviewKitSchema } from './kit'

describe('InterviewKitSchema', () => {
  it('accepts a valid kit', () => {
    const k = { selfIntro:{ short:'30秒', standard:'1-2分钟' },
      projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] }
    expect(InterviewKitSchema.parse(k)).toEqual(k)
  })
  it('accepts empty projectPitches', () => {
    const k = { selfIntro:{ short:'a', standard:'b' }, projectPitches:[] }
    expect(InterviewKitSchema.parse(k)).toEqual(k)
  })
  it('rejects missing selfIntro.standard', () => {
    expect(() => InterviewKitSchema.parse({ selfIntro:{ short:'a' }, projectPitches:[] })).toThrow()
  })
})
