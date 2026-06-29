import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { InterviewKitSchema, type InterviewKit, type StructuredResume, type JobDescription } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const PROMPT = readFileSync(join(dir, '../prompts/kit.txt'), 'utf8')
const PROMPT_JD = readFileSync(join(dir, '../prompts/kit-with-jd.txt'), 'utf8')

export function generateKit(ai: AiProvider, resume: StructuredResume, jd?: JobDescription): Promise<InterviewKit> {
  const system = jd ? PROMPT_JD : PROMPT
  const prompt = jd
    ? `JD JSON:\n${JSON.stringify(jd)}\n\n简历JSON:\n${JSON.stringify(resume)}`
    : `简历JSON:\n${JSON.stringify(resume)}`
  return completeJson(ai, InterviewKitSchema, { system, prompt })
}
