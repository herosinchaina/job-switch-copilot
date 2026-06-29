import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { JobDescriptionSchema, GapAnalysisSchema, type JobDescription, type GapAnalysis, type StructuredResume } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const JD_PROMPT = readFileSync(join(dir, '../prompts/jd.txt'), 'utf8')
const GAP_PROMPT = readFileSync(join(dir, '../prompts/gap.txt'), 'utf8')

export function parseJd(ai: AiProvider, rawText: string): Promise<JobDescription> {
  return completeJson(ai, JobDescriptionSchema, { system: JD_PROMPT, prompt: rawText })
}
export function analyzeGap(ai: AiProvider, resume: StructuredResume, jd: JobDescription): Promise<GapAnalysis> {
  const prompt = `简历JSON:\n${JSON.stringify(resume)}\n\nJD JSON:\n${JSON.stringify(jd)}`
  return completeJson(ai, GapAnalysisSchema, { system: GAP_PROMPT, prompt })
}
