import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { ReviewSchema, type Review, type StructuredResume, type JobDescription } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const PROMPT = readFileSync(join(dir, '../prompts/review.txt'), 'utf8')
const PROMPT_JD = readFileSync(join(dir, '../prompts/review-with-jd.txt'), 'utf8')

export async function reviewResume(
  ai: AiProvider, structured: StructuredResume, perspective: 'hr'|'interviewer', jd?: JobDescription,
): Promise<Review> {
  const system = jd ? PROMPT_JD : PROMPT
  const prompt = jd
    ? `视角: ${perspective}\nJD JSON:\n${JSON.stringify(jd)}\n\n简历JSON:\n${JSON.stringify(structured)}`
    : `视角: ${perspective}\n简历JSON:\n${JSON.stringify(structured)}`
  const r = await completeJson(ai, ReviewSchema, { system, prompt })
  return { ...r, perspective }
}
