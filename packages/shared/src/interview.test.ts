import { describe, it, expect } from 'vitest'
import { TurnFeedbackSchema, InterviewStepSchema, InterviewReportSchema, ROUND_TYPES } from './interview'

describe('interview schemas', () => {
  it('accepts valid turn feedback', () => {
    const f = { score:72, highlights:['结构清晰'], gaps:['缺量化'], better:'补充指标' }
    expect(TurnFeedbackSchema.parse(f)).toEqual(f)
  })
  it('accepts a step with null feedback (first turn) and a next question', () => {
    const s = { feedback:null, nextQuestion:'介绍一下你的项目' }
    expect(InterviewStepSchema.parse(s)).toEqual(s)
  })
  it('accepts a step ending the interview (nextQuestion null)', () => {
    const s = { feedback:{ score:80, highlights:[], gaps:[], better:'' }, nextQuestion:null }
    expect(InterviewStepSchema.parse(s)).toEqual(s)
  })
  it('accepts a valid report', () => {
    const r = { overallScore:75, dimensions:[{name:'专业性',score:80,comment:'好'}],
      bestTurn:{question:'q',why:'w'}, worstTurn:null, weaknesses:['系统设计'], nextSteps:['多练'] }
    expect(InterviewReportSchema.parse(r)).toEqual(r)
  })
  it('rejects out-of-range score', () => {
    expect(() => TurnFeedbackSchema.parse({ score:150, highlights:[], gaps:[], better:'' })).toThrow()
  })
  it('exposes ROUND_TYPES', () => {
    expect(ROUND_TYPES).toContain('tech'); expect(ROUND_TYPES).toContain('hr')
  })
})
