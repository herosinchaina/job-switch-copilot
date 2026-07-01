import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import type { StructuredResume } from '@aios/shared'
import { completeJson, completeJsonSession } from '../ai/claude-cli'
import { DeepdiveStepSchema, type DeepdiveStep, ProjectMapSchema, type ProjectMap } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/deepdive-system.txt'), 'utf8')
const STEP = readFileSync(join(dir, '../prompts/deepdive-step.txt'), 'utf8')
const MAP = readFileSync(join(dir, '../prompts/deepdive-map.txt'), 'utf8')

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

export async function answerDeepdive(ai: AiProvider, ctx: {
  cliSessionId: string | null; resume: StructuredResume; projectName: string
  history: Array<{ question: string; answer: string }>; question: string; answer: string; turnIndex: number; maxRounds: number
}): Promise<DeepdiveStep> {
  const mustEnd = ctx.turnIndex + 1 >= ctx.maxRounds
  const endRule = mustEnd ? '\n注意:本场深挖已达轮次上限,nextQuestion 必须为 null。' : ''
  const stepPrompt = `候选人对问题「${ctx.question}」的回答:\n${ctx.answer}\n\n请评分并决定下一步追问。${endRule}`
  if (ctx.cliSessionId && ai.continueSession) {
    try { return await completeJsonSession(ai, DeepdiveStepSchema, ctx.cliSessionId, { system: STEP, prompt: stepPrompt }) }
    catch { /* 降级 */ }
  }
  const hist = ctx.history.map((h, i) => `Q${i}: ${h.question}\nA${i}: ${h.answer}`).join('\n')
  const prompt = `${projectBrief(ctx.resume, ctx.projectName)}\n\n问答记录:\n${hist}\n\n${stepPrompt}`
  return completeJson(ai, DeepdiveStepSchema, { system: `${SYSTEM}\n\n${STEP}`, prompt })
}

export function generateMap(ai: AiProvider, input: {
  resume: StructuredResume; projectName: string; turns: Array<{ question: string; answer: string; score: number }>
}): Promise<ProjectMap> {
  const body = input.turns.map((t, i) => `Q${i}: ${t.question}\nA${i}: ${t.answer}\n本轮总分: ${t.score}`).join('\n\n')
  const prompt = `${projectBrief(input.resume, input.projectName)}\n\n深挖问答与评分:\n${body}\n\n请生成该项目的知识地图。`
  return completeJson(ai, ProjectMapSchema, { system: `${SYSTEM}\n\n${MAP}`, prompt })
}
