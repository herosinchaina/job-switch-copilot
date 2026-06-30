import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson, completeJsonSession } from '../ai/claude-cli'
import { GuideStepSchema, type GuideStep, type LcProblem } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/guide-system.txt'), 'utf8')
const STEP = readFileSync(join(dir, '../prompts/guide-step.txt'), 'utf8')

function problemBrief(p: LcProblem): string {
  return `题目:#${p.leetcodeId} ${p.title}(${p.difficulty},专题:${p.topic});核心思路关键词:${p.keyIdea};链接:${p.url}`
}

export async function startGuide(ai: AiProvider, problem: LcProblem): Promise<{ cliSessionId: string; firstGuidance: string }> {
  if (!ai.startSession || !ai.continueSession) throw new Error('provider 不支持会话')
  const cliSessionId = ai.startSession()
  const prompt = `${problemBrief(problem)}\n\n请作为算法老师,开始引导我学这道题。先抛出第一个引导问题(问我这题考点/让我先想思路),只输出引导语,不要给答案。`
  const firstGuidance = (await ai.continueSession(cliSessionId, { system: SYSTEM, prompt })).trim()
  return { cliSessionId, firstGuidance }
}

export async function continueGuide(ai: AiProvider, ctx: {
  cliSessionId: string | null; problem: LcProblem
  history: Array<{ question: string; answer: string }>; question: string; answer: string
}): Promise<GuideStep> {
  const stepPrompt = `针对引导「${ctx.question}」,我的思考是:\n${ctx.answer}\n\n请点拨并给出下一步引导。`
  if (ctx.cliSessionId && ai.continueSession) {
    try { return await completeJsonSession(ai, GuideStepSchema, ctx.cliSessionId, { system: STEP, prompt: stepPrompt }) }
    catch { /* 降级 */ }
  }
  const hist = ctx.history.map((h, i) => `引导${i}: ${h.question}\n我答${i}: ${h.answer}`).join('\n')
  const prompt = `${problemBrief(ctx.problem)}\n\n引导记录:\n${hist}\n\n${stepPrompt}`
  return completeJson(ai, GuideStepSchema, { system: `${SYSTEM}\n\n${STEP}`, prompt })
}
