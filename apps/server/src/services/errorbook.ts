import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { AttemptGradeRawSchema, CONQUER_THRESHOLD, type KnowledgeAttemptFeedback } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/errorbook-grade.txt'), 'utf8')

export async function gradeAttempt(
  ai: AiProvider,
  input: { question: string; reference: string | null; answer: string },
): Promise<KnowledgeAttemptFeedback> {
  const prompt = `题目:\n${input.question}\n\n参考答案:\n${input.reference ?? '(无参考答案)'}\n\n考生本次新答案:\n${input.answer}\n\n请评分。`
  const raw = await completeJson(ai, AttemptGradeRawSchema, { system: SYSTEM, prompt })
  return {
    score: raw.score,
    verdict: raw.score >= CONQUER_THRESHOLD ? 'pass' : 'fail',
    comment: raw.comment,
    gaps: raw.gaps ?? [],
  }
}
