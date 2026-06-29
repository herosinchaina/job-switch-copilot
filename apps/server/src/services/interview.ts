import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import type { StructuredResume, JobDescription, RoundType } from '@aios/shared'
import { completeJson, completeJsonSession } from '../ai/claude-cli'
import { InterviewStepSchema, type InterviewStep } from '@aios/shared'
import { InterviewReportSchema, type InterviewReport } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(dir, '../prompts/interview-system.txt'), 'utf8')
const STEP = readFileSync(join(dir, '../prompts/interview-step.txt'), 'utf8')
const REPORT = readFileSync(join(dir, '../prompts/interview-report.txt'), 'utf8')

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

export async function answerTurn(ai: AiProvider, ctx: {
  cliSessionId: string | null; roundType: RoundType; resume: StructuredResume; jd?: JobDescription
  history: Array<{ question: string; answer: string }>; question: string; answer: string; turnIndex: number; maxRounds: number
}): Promise<InterviewStep> {
  const mustEnd = ctx.turnIndex + 1 >= ctx.maxRounds
  const endRule = mustEnd ? '\n注意:本场面试已达轮次上限,nextQuestion 必须为 null。' : ''
  const sessionPrompt = `候选人对问题「${ctx.question}」的回答:\n${ctx.answer}\n\n请评价本次回答并决定下一步。${endRule}`

  // 优先 CLI 会话
  if (ctx.cliSessionId && ai.continueSession) {
    try {
      return await completeJsonSession(ai, InterviewStepSchema, ctx.cliSessionId, { system: STEP, prompt: sessionPrompt })
    } catch { /* 降级 */ }
  }
  // 降级:无状态,用 history 拼上下文
  const jdPart = ctx.jd ? `\n目标岗位 JD:\n${JSON.stringify(ctx.jd)}` : ''
  const hist = ctx.history.map((h, i) => `Q${i}: ${h.question}\nA${i}: ${h.answer}`).join('\n')
  const prompt = `候选人简历:\n${JSON.stringify(ctx.resume)}${jdPart}\n\n面试问答记录:\n${hist}\n\n${sessionPrompt}`
  return completeJson(ai, InterviewStepSchema, { system: `${buildSystemPrompt(ctx.roundType)}\n\n${STEP}`, prompt })
}

export function generateReport(ai: AiProvider, input: {
  roundType: RoundType; turns: Array<{ question: string; answer: string; score: number }>
}): Promise<InterviewReport> {
  const body = input.turns.map((t, i) => `Q${i}: ${t.question}\nA${i}: ${t.answer}\n本轮评分: ${t.score}`).join('\n\n')
  const prompt = `面试问答记录与逐轮评分:\n${body}\n\n请生成面试报告。`
  return completeJson(ai, InterviewReportSchema, { system: `${buildSystemPrompt(input.roundType)}\n\n${REPORT}`, prompt })
}
