import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import type { StructuredResume } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/deepdive-system.txt'), 'utf8')

export function buildDeepdiveSystem(): string { return SYSTEM }

export function findProject(resume: StructuredResume, projectName: string) {
  return resume.projects.find(p => p.name === projectName)
}

function projectBrief(resume: StructuredResume, projectName: string): string {
  const p = findProject(resume, projectName)
  const proj = p ? JSON.stringify(p) : `{"name":"${projectName}"}`
  return `指定深挖的项目(简历原文):\n${proj}\n\n候选人完整简历(供背景参考):\n${JSON.stringify(resume)}`
}

export async function startDeepdive(
  ai: AiProvider, input: { resume: StructuredResume; projectName: string },
): Promise<{ cliSessionId: string; firstQuestion: string }> {
  if (!ai.startSession || !ai.continueSession) throw new Error('provider 不支持会话')
  const cliSessionId = ai.startSession()
  const prompt = `${projectBrief(input.resume, input.projectName)}\n\n请作为技术面试官,直接进入技术细节,提出关于该项目的第一个深挖问题(锚定简历里的具体表述)。只输出问题文本。`
  const firstQuestion = (await ai.continueSession(cliSessionId, { system: SYSTEM, prompt })).trim()
  return { cliSessionId, firstQuestion }
}
