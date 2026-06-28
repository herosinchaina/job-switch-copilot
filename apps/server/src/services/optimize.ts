import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { StructuredResumeSchema, type StructuredResume, type Review } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/optimize.txt'), 'utf8')

export async function optimizeResume(ai: AiProvider, structured: StructuredResume, suggestions: Review['suggestions']): Promise<StructuredResume> {
  const prompt = `评审建议:\n${JSON.stringify(suggestions)}\n\n原简历JSON:\n${JSON.stringify(structured)}`
  return completeJson(ai, StructuredResumeSchema, { system: PROMPT, prompt })
}
