import { describe, it, expect } from 'vitest'
import { StructuredResumeSchema } from './resume'

describe('StructuredResumeSchema', () => {
  it('accepts a minimal valid resume', () => {
    const r = { basics:{name:'A',title:'Dev',contact:'a@x.com',summary:''},
      education:[], work:[], projects:[], skills:[], awards:[] }
    expect(StructuredResumeSchema.parse(r)).toEqual(r)
  })
  it('rejects missing basics', () => {
    expect(() => StructuredResumeSchema.parse({ education:[] })).toThrow()
  })
})
