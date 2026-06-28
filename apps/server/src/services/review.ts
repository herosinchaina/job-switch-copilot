import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { ReviewSchema, type Review, type StructuredResume } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/review.txt'), 'utf8')

export async function reviewResume(ai: AiProvider, structured: StructuredResume, perspective: 'hr'|'interviewer'): Promise<Review> {
  const prompt = `视角: ${perspective}\n简历JSON:\n${JSON.stringify(structured)}`
  const r = await completeJson(ai, ReviewSchema, { system: PROMPT, prompt })
  return { ...r, perspective } // 以入参视角为准
}
