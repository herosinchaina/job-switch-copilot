import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import type { StructuredResume, JobDescription, RoundType } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/interview-system.txt'), 'utf8')

const ROUND_STYLE: Record<RoundType, string> = {
  tech: '本轮是技术面:聚焦技术深度、项目实现细节、原理与权衡。',
  hr: '本轮是 HR 面:聚焦动机、软素质、职业规划、稳定性与沟通。',
}

export function buildSystemPrompt(roundType: RoundType): string {
  return `${SYSTEM}\n${ROUND_STYLE[roundType]}`
}

export async function startInterview(
  ai: AiProvider, input: { resume: StructuredResume; jd?: JobDescription; roundType: RoundType },
): Promise<{ cliSessionId: string; firstQuestion: string }> {
  if (!ai.startSession || !ai.continueSession) throw new Error('provider 不支持会话')
  const cliSessionId = ai.startSession()
  const jdPart = input.jd ? `\n目标岗位 JD:\n${JSON.stringify(input.jd)}` : ''
  const prompt = `候选人简历:\n${JSON.stringify(input.resume)}${jdPart}\n\n请作为面试官提出第一个问题。只输出问题文本,不要任何额外内容。`
  const firstQuestion = (await ai.continueSession(cliSessionId, { system: buildSystemPrompt(input.roundType), prompt })).trim()
  return { cliSessionId, firstQuestion }
}
