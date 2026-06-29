# 模块四实现计划:AI 模拟面试中心(最小闭环)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现连续追问式多轮模拟面试 —— 配置(岗位/轮次/可选 JD)→ AI 出题 → 逐轮作答+评分+追问 → 轮次上限/结束 → 面试报告 → 差题打标沉淀。

**Architecture:** 沿用 monorepo。多轮上下文用 Claude CLI 会话(`--session-id`/`--resume`)为主,但每轮完整 Q&A 存自己的 SQLite(权威数据源);CLI 会话失败时降级为「用 DB 历史拼 prompt 无状态调用」。AiProvider 新增可选会话方法;服务层管编排;路由管状态机;前端聊天式页面。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind(web);Vitest;AI 经 ClaudeCliProvider 适配层(新增会话能力 + 现有 completeJson)。

## Global Constraints

- AI 调用**只**经 `AiProvider`;返回 JSON **必须** zod 校验,失败重试一次再降级报错(`completeJson` / 新增 `completeJsonSession`)。报告/评分整包 JSON **非流式**。
- 多轮上下文**优先 CLI 会话**(`continueSession`);调用失败 **必须降级**为方案 A(用 DB 历史 Q&A 拼 prompt 调 `completeJson`),不得让一次面试因 CLI 会话丢失而崩。
- 每轮完整 Q&A 存 SQLite,是**权威数据源**;CLI 会话只是 AI 工作记忆。
- spawn CLI **必须** `shell:false`,prompt 经 stdin;`--session-id <uuid>` 首轮,`--resume <uuid>` 续轮。
- SQLite **全程参数化**;多步写用 `transaction`(已存在于 repo.ts)。
- 简历 version 必须 `status === 'confirmed'` 才能开面试,否则 HTTP 409;未知 JD 404;非 active session 作答报错(409)。
- 轮次上限默认 6;`is_weak` 阈值 `score < 60`。
- 后端只绑 127.0.0.1;AI 输出当不可信数据,前端**不用** `dangerouslySetInnerHTML`,纯文本渲染。
- TypeScript 严格模式;**不破坏现有 57 个测试**;纯新增,现有流程不变。
- node:sqlite:`DatabaseSync`;`db.exec('CREATE TABLE IF NOT EXISTS ...')`;`prepare().run/get/all`;无 `.pragma()`。
- 前端组件测试首行 `// @vitest-environment jsdom`;沿用根 vitest.config.ts(node:sqlite shim + afterEach cleanup);recharts 类组件测试加 `globalThis.ResizeObserver` polyfill(本模块前端无雷达图,通常不需要)。
- 轮次类型仅 `'tech' | 'hr'`;公司类型不分化;差题只 `is_weak` 打标(错题本/复习不在本模块)。

## 文件结构

```
packages/shared/src/
  interview.ts             # 新增:RoundType, TurnFeedbackSchema, InterviewStepSchema, InterviewReportSchema
  index.ts                 # 修改:导出 interview
apps/server/src/
  ai/provider.ts           # 修改:AiProvider 加可选 startSession/continueSession
  ai/claude-cli.ts         # 修改:实现会话方法 + completeJsonSession
  db/connection.ts         # 修改:建 interview_sessions / interview_turns 表
  db/repo.ts               # 修改:session/turn CRUD;exportAll 加表
  prompts/interview-system.txt    # 新增:面试官人设
  prompts/interview-step.txt      # 新增:评分+追问 JSON 约束
  prompts/interview-report.txt    # 新增:报告 JSON 约束
  services/interview.ts    # 新增:startInterview / answerTurn(含降级) / generateReport
  routes/interviews.ts     # 新增:POST /api/interviews、POST /:id/answer、GET /:id
  index.ts                 # 修改:挂载 interviewsRouter
apps/web/src/
  api.ts                   # 修改:startInterview / answerInterview / getInterview
  pages/MockInterview.tsx  # 新增:配置 + 聊天式对话 + 报告
  App.tsx                  # 修改:导航加「模拟面试」+ 视图流转
```

实施顺序:1(shared)→ 2(适配层会话)→ 3(数据层)→ 4(服务:startInterview)→ 5(服务:answerTurn+降级)→ 6(服务:generateReport)→ 7(路由)→ 8(前端 api+页面)→ 9(导航流转+冒烟)。

---

### Task 1: 共享数据模型(interview)

**Files:**
- Create: `packages/shared/src/interview.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/interview.test.ts`

**Interfaces:**
- Produces:
  - `ROUND_TYPES = ['tech','hr'] as const`;`RoundType = 'tech'|'hr'`
  - `TurnFeedbackSchema` → `{ score:number(0-100), highlights:string[], gaps:string[], better:string }`
  - `InterviewStepSchema` → `{ feedback: TurnFeedback | null, nextQuestion: string | null }`
  - `InterviewReportSchema` → `{ overallScore:number(0-100), dimensions:Array<{name:string,score:number,comment:string}>, bestTurn:{question:string,why:string}|null, worstTurn:{question:string,why:string}|null, weaknesses:string[], nextSteps:string[] }`
  - 类型 `TurnFeedback`/`InterviewStep`/`InterviewReport`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/interview.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TurnFeedbackSchema, InterviewStepSchema, InterviewReportSchema, ROUND_TYPES } from './interview'

describe('interview schemas', () => {
  it('accepts valid turn feedback', () => {
    const f = { score:72, highlights:['结构清晰'], gaps:['缺量化'], better:'补充指标' }
    expect(TurnFeedbackSchema.parse(f)).toEqual(f)
  })
  it('accepts a step with null feedback (first turn) and a next question', () => {
    const s = { feedback:null, nextQuestion:'介绍一下你的项目' }
    expect(InterviewStepSchema.parse(s)).toEqual(s)
  })
  it('accepts a step ending the interview (nextQuestion null)', () => {
    const s = { feedback:{ score:80, highlights:[], gaps:[], better:'' }, nextQuestion:null }
    expect(InterviewStepSchema.parse(s)).toEqual(s)
  })
  it('accepts a valid report', () => {
    const r = { overallScore:75, dimensions:[{name:'专业性',score:80,comment:'好'}],
      bestTurn:{question:'q',why:'w'}, worstTurn:null, weaknesses:['系统设计'], nextSteps:['多练'] }
    expect(InterviewReportSchema.parse(r)).toEqual(r)
  })
  it('rejects out-of-range score', () => {
    expect(() => TurnFeedbackSchema.parse({ score:150, highlights:[], gaps:[], better:'' })).toThrow()
  })
  it('exposes ROUND_TYPES', () => {
    expect(ROUND_TYPES).toContain('tech'); expect(ROUND_TYPES).toContain('hr')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- interview`
Expected: FAIL — 无法导入 `./interview`

- [ ] **Step 3: 实现**

`packages/shared/src/interview.ts`:
```ts
import { z } from 'zod'

export const ROUND_TYPES = ['tech', 'hr'] as const
export type RoundType = typeof ROUND_TYPES[number]

export const TurnFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  highlights: z.array(z.string()),
  gaps: z.array(z.string()),
  better: z.string(),
})
export type TurnFeedback = z.infer<typeof TurnFeedbackSchema>

export const InterviewStepSchema = z.object({
  feedback: TurnFeedbackSchema.nullable(),
  nextQuestion: z.string().nullable(),
})
export type InterviewStep = z.infer<typeof InterviewStepSchema>

const TurnRefSchema = z.object({ question: z.string(), why: z.string() })
export const InterviewReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(z.object({ name: z.string(), score: z.number().min(0).max(100), comment: z.string() })),
  bestTurn: TurnRefSchema.nullable(),
  worstTurn: TurnRefSchema.nullable(),
  weaknesses: z.array(z.string()),
  nextSteps: z.array(z.string()),
})
export type InterviewReport = z.infer<typeof InterviewReportSchema>
```
`packages/shared/src/index.ts` 增加:
```ts
export * from './interview'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- interview`
Expected: PASS(6 passed)

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全部 PASS(现有 57 仍绿)
```bash
git add packages/shared/src/interview.ts packages/shared/src/interview.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 模拟面试数据模型(反馈/步骤/报告)"
```

---

### Task 2: AI 适配层会话能力

**Files:**
- Modify: `apps/server/src/ai/provider.ts`
- Modify: `apps/server/src/ai/claude-cli.ts`
- Test: `apps/server/src/ai/claude-cli.test.ts`(追加)

**Interfaces:**
- Consumes: 现有 `AiProvider`/`ClaudeCliProvider`/`ConcurrencyQueue`/`completeJson`
- Produces:
  - `AiProvider` 新增可选:`startSession?(): string`;`continueSession?(sessionId: string, o: { system?: string; prompt: string }): Promise<string>`
  - `ClaudeCliProvider` 实现两者:`startSession()` → `randomUUID()`;`continueSession(sid, o)` → 首次用 `--session-id sid`、之后用 `--resume sid`(用一个内部 Set 记已开始的 sid);经队列+超时;失败 reject。
  - `completeJsonSession<T>(provider, schema, sessionId, o): Promise<T>` — 在会话上调用 + zod 校验 + 重试一次(若 provider 无 continueSession 则抛错)。

- [ ] **Step 1: 写失败测试(注入 fakeSpawn,验证首轮 --session-id、续轮 --resume、shell:false)**

`apps/server/src/ai/claude-cli.test.ts` 追加:
```ts
import { ClaudeCliProvider, completeJsonSession } from './claude-cli'
import { z } from 'zod'

describe('ClaudeCliProvider sessions', () => {
  it('uses --session-id on first turn and --resume after, shell:false, stdin prompt', async () => {
    const calls: string[][] = []
    const spawnFn = vi.fn((_cmd: string, args: string[]) => { calls.push(args); return makeCp('hello') })
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const sid = p.startSession!()
    expect(typeof sid).toBe('string')
    await p.continueSession!(sid, { prompt: 'q1' })
    await p.continueSession!(sid, { prompt: 'q2' })
    expect(calls[0]).toContain('--session-id'); expect(calls[0]).toContain(sid)
    expect(calls[1]).toContain('--resume'); expect(calls[1]).toContain(sid)
    expect(spawnFn.mock.calls[0][2]).toMatchObject({ shell: false })
  })
  it('completeJsonSession validates + retries once', async () => {
    let n = 0
    const spawnFn = vi.fn(() => makeCp(n++ === 0 ? 'bad' : '{"v":1}'))
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const sid = p.startSession!()
    const r = await completeJsonSession(p, z.object({ v: z.number() }), sid, { prompt: 'x' })
    expect(r).toEqual({ v: 1 })
    expect(spawnFn).toHaveBeenCalledTimes(2)
  })
})
```
> `makeCp` 是该文件已有的 fake child-process 工厂(阶段一 Task 3 定义)。复用它。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- claude-cli`
Expected: FAIL — startSession/continueSession/completeJsonSession 未定义

- [ ] **Step 3: 改 provider 接口**

`apps/server/src/ai/provider.ts`:
```ts
export interface AiProvider {
  complete(o: { system: string; prompt: string }): Promise<string>
  stream(o: { system: string; prompt: string }): AsyncIterable<string>
  startSession?(): string
  continueSession?(sessionId: string, o: { system?: string; prompt: string }): Promise<string>
}
```

- [ ] **Step 4: 在 ClaudeCliProvider 实现会话**

在 `apps/server/src/ai/claude-cli.ts` 的 `ClaudeCliProvider` 类内加(复用已有 `spawnFn`/`timeoutMs`/`queue` 与 `invoke` 风格):
```ts
import { randomUUID } from 'node:crypto'
// 类内新增字段:
private startedSessions = new Set<string>()

startSession(): string { return randomUUID() }

continueSession(sessionId: string, o: { system?: string; prompt: string }): Promise<string> {
  return this.queue.run(() => this.invokeSession(sessionId, o.system, o.prompt))
}

private invokeSession(sessionId: string, system: string | undefined, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const first = !this.startedSessions.has(sessionId)
    const args = ['-p', '--output-format', 'text']
    if (first) args.push('--session-id', sessionId)
    else args.push('--resume', sessionId)
    if (system) args.push('--append-system-prompt', system)
    const cp = this.spawnFn('claude', args, { shell: false })
    let out = '', err = ''
    const timer = setTimeout(() => { cp.kill('SIGKILL'); reject(new Error('AI 会话调用超时')) }, this.timeoutMs)
    cp.stdout!.on('data', (d: Buffer) => { out += d.toString() })
    cp.stderr!.on('data', (d: Buffer) => { err += d.toString() })
    cp.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
    cp.on('close', (code: number) => {
      clearTimeout(timer)
      if (code === 0) { this.startedSessions.add(sessionId); resolve(out.trim()) }
      else reject(new Error(`claude 会话退出码 ${code}: ${err.slice(0, 200)}`))
    })
    cp.stdin!.write(prompt); cp.stdin!.end()
  })
}
```
并在文件内(`completeJson` 旁)加会话版助手:
```ts
export async function completeJsonSession<T>(
  provider: AiProvider, schema: import('zod').ZodType<T>, sessionId: string, o: { system?: string; prompt: string },
): Promise<T> {
  if (!provider.continueSession) throw new Error('provider 不支持会话')
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.continueSession(sessionId, o)
    try { return schema.parse(JSON.parse(extractJson(raw))) } catch { /* retry */ }
  }
  throw new Error('AI 会话返回的数据格式非法,已重试仍失败')
}
```
> `extractJson` 是文件内已有的辅助函数(阶段一)。复用。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- claude-cli`
Expected: PASS(原有 + 2 新会话用例)

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/provider.ts apps/server/src/ai/claude-cli.ts apps/server/src/ai/claude-cli.test.ts
git commit -m "feat(server): AiProvider 会话能力(--session-id/--resume)+ completeJsonSession"
```

---

### Task 3: 数据层(interview_sessions / interview_turns)

**Files:**
- Modify: `apps/server/src/db/connection.ts`
- Modify: `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加)

**Interfaces:**
- Consumes: `RoundType`/`TurnFeedback`/`InterviewReport`(Task 1), 现有 `openDb`/`createResume`/`createVersion`
- Produces:
  - `createSession(db, {resumeVersionId, jobDescriptionId, cliSessionId, role, roundType, maxRounds}): number`
  - `getSession(db, id): { id, resumeVersionId, jobDescriptionId:number|null, cliSessionId:string|null, role, roundType, maxRounds, status:'active'|'finished', report:InterviewReport|null } | undefined`
  - `finishSession(db, id, report:InterviewReport): void`
  - `createTurn(db, {sessionId, turnIndex, question}): number`(answer/score/feedback 空)
  - `answerTurnRow(db, turnId, {answer, score, feedback:TurnFeedback}): void`(回填 + 自动 is_weak = score<60)
  - `listTurns(db, sessionId): Array<{ id, turnIndex, question, answer:string|null, score:number|null, feedback:TurnFeedback|null, isWeak:boolean }>`
  - `exportAll` 增加 `interviewSessions` + `interviewTurns`

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { createSession, getSession, finishSession, createTurn, answerTurnRow, listTurns } from './repo'

describe('interview repo', () => {
  function setup() {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    return { db, vid }
  }
  it('round-trips a session + turns and computes is_weak', () => {
    const { db, vid } = setup()
    const sid = createSession(db, { resumeVersionId: vid, jobDescriptionId: null, cliSessionId: 'uuid-1', role:'后端', roundType:'tech', maxRounds:6 })
    const s = getSession(db, sid)!
    expect(s.status).toBe('active'); expect(s.cliSessionId).toBe('uuid-1'); expect(s.report).toBeNull()
    const t0 = createTurn(db, { sessionId: sid, turnIndex:0, question:'介绍项目' })
    answerTurnRow(db, t0, { answer:'我做了X', score:50, feedback:{ score:50, highlights:[], gaps:['浅'], better:'深入' } })
    const turns = listTurns(db, sid)
    expect(turns[0].answer).toBe('我做了X'); expect(turns[0].isWeak).toBe(true)  // 50 < 60
  })
  it('finishSession writes report and flips status', () => {
    const { db, vid } = setup()
    const sid = createSession(db, { resumeVersionId: vid, jobDescriptionId: null, cliSessionId: null, role:'后端', roundType:'hr', maxRounds:6 })
    const report = { overallScore:70, dimensions:[], bestTurn:null, worstTurn:null, weaknesses:[], nextSteps:[] }
    finishSession(db, sid, report)
    const s = getSession(db, sid)!
    expect(s.status).toBe('finished'); expect(s.report!.overallScore).toBe(70)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- repo`
Expected: FAIL — createSession 等未定义

- [ ] **Step 3: 迁移(connection.ts)**

在 `migrate()` SQL 追加:
```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      job_description_id INTEGER,
      cli_session_id TEXT,
      role TEXT NOT NULL,
      round_type TEXT NOT NULL,
      max_rounds INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'active',
      report_json TEXT,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS interview_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES interview_sessions(id),
      turn_index INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      score INTEGER,
      feedback_json TEXT,
      is_weak INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
  `)
```

- [ ] **Step 4: repo.ts 新增**

```ts
import { InterviewReportSchema, TurnFeedbackSchema, type InterviewReport, type TurnFeedback, type RoundType } from '@aios/shared'

export function createSession(db: DatabaseSync, s: { resumeVersionId:number; jobDescriptionId:number|null; cliSessionId:string|null; role:string; roundType:RoundType; maxRounds:number }): number {
  return Number(db.prepare('INSERT INTO interview_sessions (resume_version_id,job_description_id,cli_session_id,role,round_type,max_rounds) VALUES (?,?,?,?,?,?)')
    .run(s.resumeVersionId, s.jobDescriptionId, s.cliSessionId, s.role, s.roundType, s.maxRounds).lastInsertRowid)
}
export function getSession(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT * FROM interview_sessions WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, resumeVersionId: row.resume_version_id, jobDescriptionId: row.job_description_id ?? null,
    cliSessionId: row.cli_session_id ?? null, role: row.role, roundType: row.round_type as RoundType,
    maxRounds: row.max_rounds, status: row.status as 'active'|'finished',
    report: row.report_json ? InterviewReportSchema.parse(JSON.parse(row.report_json)) : null }
}
export function finishSession(db: DatabaseSync, id: number, report: InterviewReport): void {
  db.prepare("UPDATE interview_sessions SET status='finished', report_json=? WHERE id=?").run(JSON.stringify(report), id)
}
export function createTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO interview_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerTurnRow(db: DatabaseSync, turnId: number, a: { answer:string; score:number; feedback:TurnFeedback }): void {
  db.prepare('UPDATE interview_turns SET answer=?, score=?, feedback_json=?, is_weak=? WHERE id=?')
    .run(a.answer, a.score, JSON.stringify(a.feedback), a.score < 60 ? 1 : 0, turnId)
}
export function listTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM interview_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null,
    score: r.score ?? null, feedback: r.feedback_json ? TurnFeedbackSchema.parse(JSON.parse(r.feedback_json)) : null,
    isWeak: !!r.is_weak }))
}
```
`exportAll` 增加:`interviewSessions: db.prepare('SELECT * FROM interview_sessions').all(), interviewTurns: db.prepare('SELECT * FROM interview_turns').all()`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- repo`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): interview_sessions/turns 表 + repo(is_weak 阈值)"
```

---

### Task 4: 面试服务(prompts + startInterview)

**Files:**
- Create: `apps/server/src/prompts/interview-system.txt`, `interview-step.txt`, `interview-report.txt`
- Create: `apps/server/src/services/interview.ts`
- Test: `apps/server/src/services/interview.test.ts`

**Interfaces:**
- Consumes: `AiProvider`(含会话方法), `StructuredResume`/`JobDescription`/`RoundType`(shared)
- Produces(本任务先做 start):
  - `buildSystemPrompt(roundType: RoundType): string`(读 interview-system.txt + 轮次风格,导出供测试)
  - `startInterview(ai: AiProvider, input: { resume: StructuredResume; jd?: JobDescription; roundType: RoundType }): Promise<{ cliSessionId: string; firstQuestion: string }>`
    - `ai.startSession()` 得 uuid;`ai.continueSession(uuid, {system, prompt})`,prompt 注入简历(+JD)+「作为面试官提出第一个问题,只输出问题文本」;返回首问(纯文本,trim)。

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/interview.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startInterview } from './interview'

const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any

function sessionAi(reply: string) {
  const calls: { sid:string; prompt:string; system?:string }[] = []
  const ai: AiProvider = {
    async complete(){ return reply },
    async *stream(){ yield reply },
    startSession(){ return 'sess-123' },
    async continueSession(sid, o){ calls.push({ sid, prompt:o.prompt, system:o.system }); return reply },
  }
  return { ai, calls }
}

describe('startInterview', () => {
  it('opens a CLI session and returns the first question', async () => {
    const { ai, calls } = sessionAi('请做一下自我介绍。')
    const r = await startInterview(ai, { resume: sample, roundType: 'tech' })
    expect(r.cliSessionId).toBe('sess-123')
    expect(r.firstQuestion).toBe('请做一下自我介绍。')
    expect(calls[0].sid).toBe('sess-123')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/interview`
Expected: FAIL — 无法导入 `./interview`

- [ ] **Step 3: 写 prompts + 实现 start**

`apps/server/src/prompts/interview-system.txt`:
```
你是一位资深面试官,正在对候选人进行模拟面试。要求:
- 像真实面试官一样,基于候选人简历提问,顺着回答连续追问,逐步深入,暴露盲区。
- 不杜撰候选人简历中没有的经历;问题要具体、有针对性。
- 严格按要求的输出格式回复(纯问题文本 或 指定 JSON),不要额外寒暄。
```
`apps/server/src/prompts/interview-step.txt`:
```
你是面试官。对候选人刚才的回答进行评价,并决定下一步。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. feedback:对本次回答的评分(score 0-100)+ highlights(亮点)+ gaps(遗漏/问题)+ better(更优回答方式,简述)。
3. nextQuestion:若面试应继续,给出下一个问题(可针对回答追问);若应结束,设为 null。
4. JSON 结构:
{ "feedback": { "score":0-100, "highlights":[], "gaps":[], "better":"" },
  "nextQuestion": "下一个问题，或 null" }
```
`apps/server/src/prompts/interview-report.txt`:
```
你是面试官,面试已结束。基于完整问答记录生成面试报告。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. dimensions 至少含:专业性、逻辑性、表达能力、技术深度(各 0-100 + comment)。
3. bestTurn/worstTurn:表现最好/最差的问题及原因(无则 null)。weaknesses:暴露的知识短板。nextSteps:建议训练方向。
4. JSON 结构:
{ "overallScore":0-100,
  "dimensions":[{"name":"专业性","score":0-100,"comment":""}],
  "bestTurn":{"question":"","why":""}, "worstTurn":{"question":"","why":""},
  "weaknesses":[], "nextSteps":[] }
```
`apps/server/src/services/interview.ts`:
```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/interview`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/interview-system.txt apps/server/src/prompts/interview-step.txt apps/server/src/prompts/interview-report.txt apps/server/src/services/interview.ts apps/server/src/services/interview.test.ts
git commit -m "feat(server): 面试服务 startInterview + 面试官 prompts"
```

---

### Task 5: answerTurn(会话续接 + 失败降级)

**Files:**
- Modify: `apps/server/src/services/interview.ts`
- Test: `apps/server/src/services/interview.test.ts`(追加)

**Interfaces:**
- Consumes: `completeJsonSession`/`completeJson`(claude-cli), `InterviewStepSchema`(shared)
- Produces:
  - `answerTurn(ai, ctx): Promise<InterviewStep>`,ctx 类型:
    `{ cliSessionId: string | null; roundType: RoundType; resume: StructuredResume; jd?: JobDescription; history: Array<{ question: string; answer: string }>; question: string; answer: string; turnIndex: number; maxRounds: number }`
  - 行为:构造 step prompt(含考生本轮回答 + 「若 turnIndex+1 >= maxRounds 则 nextQuestion 必须为 null」)。
    - 优先 `completeJsonSession(ai, InterviewStepSchema, cliSessionId, {prompt})`(仅当 cliSessionId 非空且 ai.continueSession 存在)。
    - **失败(抛错)或无会话 → 降级**:`completeJson(ai, InterviewStepSchema, {system, prompt})`,prompt 额外拼入 `history` 全部 Q&A + 简历/JD,作为无状态上下文。

- [ ] **Step 1: 写失败测试(正常走会话 + 会话抛错降级)**

追加:
```ts
import { answerTurn } from './interview'
const stepOut = JSON.stringify({ feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:'再展开讲讲' })

describe('answerTurn', () => {
  const baseCtx = { roundType:'tech' as const, resume: sample, history:[{question:'q0',answer:'a0'}], question:'q0', answer:'a0', turnIndex:0, maxRounds:6 }

  it('uses the CLI session when available', async () => {
    let usedSession = false
    const ai: AiProvider = {
      async complete(){ return stepOut },
      async *stream(){ yield stepOut },
      startSession(){ return 's' },
      async continueSession(){ usedSession = true; return stepOut },
    }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: 'sess-1' })
    expect(usedSession).toBe(true)
    expect(step.nextQuestion).toBe('再展开讲讲')
  })

  it('falls back to stateless completeJson when the session call throws', async () => {
    let usedComplete = false
    const ai: AiProvider = {
      async complete(){ usedComplete = true; return stepOut },
      async *stream(){ yield stepOut },
      startSession(){ return 's' },
      async continueSession(){ throw new Error('resume failed') },
    }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: 'sess-1' })
    expect(usedComplete).toBe(true)            // 降级到无状态
    expect(step.feedback!.score).toBe(70)
  })

  it('falls back when there is no cliSessionId', async () => {
    let usedComplete = false
    const ai: AiProvider = { async complete(){ usedComplete = true; return stepOut }, async *stream(){ yield stepOut } }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: null })
    expect(usedComplete).toBe(true)
    expect(step.nextQuestion).toBe('再展开讲讲')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/interview`
Expected: FAIL — answerTurn 未定义

- [ ] **Step 3: 实现 answerTurn**

在 `apps/server/src/services/interview.ts` 追加:
```ts
import { completeJson, completeJsonSession } from '../ai/claude-cli'
import { InterviewStepSchema, type InterviewStep } from '@aios/shared'

const STEP = readFileSync(join(dir, '../prompts/interview-step.txt'), 'utf8')

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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/interview`
Expected: PASS(start + 3 个 answerTurn 用例)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/interview.ts apps/server/src/services/interview.test.ts
git commit -m "feat(server): answerTurn — CLI 会话续接 + 失败降级到无状态拼 history"
```

---

### Task 6: generateReport

**Files:**
- Modify: `apps/server/src/services/interview.ts`
- Test: `apps/server/src/services/interview.test.ts`(追加)

**Interfaces:**
- Consumes: `completeJson`, `InterviewReportSchema`(shared)
- Produces:
  - `generateReport(ai, input: { roundType: RoundType; turns: Array<{ question: string; answer: string; score: number }> }): Promise<InterviewReport>`
    - 把全部 Q&A + 逐轮分拼 prompt,经 `completeJson(ai, InterviewReportSchema, ...)` 产出报告(非流式)。

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { generateReport } from './interview'
const reportOut = JSON.stringify({ overallScore:74, dimensions:[{name:'专业性',score:80,comment:'扎实'}],
  bestTurn:{question:'q0',why:'答得好'}, worstTurn:null, weaknesses:['系统设计'], nextSteps:['多练系统设计'] })

describe('generateReport', () => {
  it('returns a validated report', async () => {
    const ai: AiProvider = { async complete(){ return reportOut }, async *stream(){ yield reportOut } }
    const r = await generateReport(ai, { roundType:'tech', turns:[{question:'q0',answer:'a0',score:80}] })
    expect(r.overallScore).toBe(74)
    expect(r.dimensions[0].name).toBe('专业性')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/interview`
Expected: FAIL — generateReport 未定义

- [ ] **Step 3: 实现**

在 `apps/server/src/services/interview.ts` 追加:
```ts
import { InterviewReportSchema, type InterviewReport } from '@aios/shared'

const REPORT = readFileSync(join(dir, '../prompts/interview-report.txt'), 'utf8')

export function generateReport(ai: AiProvider, input: {
  roundType: RoundType; turns: Array<{ question: string; answer: string; score: number }>
}): Promise<InterviewReport> {
  const body = input.turns.map((t, i) => `Q${i}: ${t.question}\nA${i}: ${t.answer}\n本轮评分: ${t.score}`).join('\n\n')
  const prompt = `面试问答记录与逐轮评分:\n${body}\n\n请生成面试报告。`
  return completeJson(ai, InterviewReportSchema, { system: `${buildSystemPrompt(input.roundType)}\n\n${REPORT}`, prompt })
}
```
> `InterviewStep`/`InterviewReport`/`completeJson` 等 import 若 Task 5 已加,合并即可,勿重复声明。

- [ ] **Step 4: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/interview.ts apps/server/src/services/interview.test.ts
git commit -m "feat(server): generateReport 生成面试报告"
```

---

### Task 7: 路由(面试状态机)

**Files:**
- Create: `apps/server/src/routes/interviews.ts`
- Modify: `apps/server/src/index.ts`(挂载)
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`

**Interfaces:**
- Consumes: `startInterview`/`answerTurn`/`generateReport`(services), `getVersion`/`getJd`/`createSession`/`getSession`/`finishSession`/`createTurn`/`answerTurnRow`/`listTurns`/`transaction`(repo), `HttpError`
- Produces:
  - `interviewsRouter(db, ai): Router`
  - `POST /api/interviews`(body `{versionId, jobDescriptionId?, roundType, maxRounds?}`):version 不存在 404,未 confirmed 409,JD 给了但不存在 404 → startInterview → createSession + createTurn(0) → `{ sessionId, turnIndex:0, question }`
  - `POST /api/interviews/:id/answer`(body `{answer}`):session 不存在 404,非 active 409 → 取最后一个未答 turn 回填 → answerTurn → 写 score/feedback;若 nextQuestion 建下一 turn;若 null 则 finishSession(generateReport) → `{ feedback, nextQuestion, turnIndex, finished, report? }`
  - `GET /api/interviews/:id` → `{ session, turns }`

- [ ] **Step 1: 写失败测试(追加 describe 到 resumes.test.ts)**

```ts
import { createJd } from '../db/repo'

// 会话感知 fake:首问 / step / report 按 prompt 内容分辨
function interviewAi() {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
  const firstQ = '请做一下自我介绍。'
  const stepGo = JSON.stringify({ feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:'展开讲讲项目' })
  const stepEnd = JSON.stringify({ feedback:{ score:65, highlights:[], gaps:['浅'], better:'深入' }, nextQuestion:null })
  const report = JSON.stringify({ overallScore:70, dimensions:[{name:'专业性',score:70,comment:'ok'}], bestTurn:null, worstTurn:null, weaknesses:[], nextSteps:[] })
  let answers = 0
  const handle = (system: string, prompt: string) => {
    if (system.includes('简历解析器')) return parsed
    if (prompt.includes('生成面试报告')) return report
    if (prompt.includes('请作为面试官提出第一个问题')) return firstQ
    if (prompt.includes('请评价本次回答')) { answers++; return answers >= 2 ? stepEnd : stepGo }  // 第2次作答结束
    return firstQ
  }
  return {
    async complete(o:any){ return handle(o.system ?? '', o.prompt) },
    async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'cli-sess' },
    async continueSession(_sid:string, o:any){ return handle(o.system ?? '', o.prompt) },
  } as any
}

describe('interview routes', () => {
  async function confirmedVersion(app:any) {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    return up.body.versionId
  }
  it('rejects start before confirm with 409', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/interviews').send({ versionId: up.body.versionId, roundType:'tech' })
    expect(res.status).toBe(409)
  })
  it('runs a full interview to a report', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const start = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', maxRounds:6 })
    expect(start.status).toBe(200); expect(start.body.question).toBeTruthy()
    const sid = start.body.sessionId
    const a1 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'我的回答1' })
    expect(a1.body.finished).toBe(false); expect(a1.body.nextQuestion).toBeTruthy()
    const a2 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'我的回答2' })
    expect(a2.body.finished).toBe(true); expect(a2.body.report.overallScore).toBe(70)
    const got = await request(app).get(`/api/interviews/${sid}`)
    expect(got.body.session.status).toBe('finished'); expect(got.body.turns.length).toBeGreaterThanOrEqual(2)
  })
  it('404 on unknown jobDescriptionId', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const res = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', jobDescriptionId: 999 })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- resumes`
Expected: FAIL — /api/interviews 404(未挂载)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/interviews.ts`:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { ROUND_TYPES, type RoundType } from '@aios/shared'
import { startInterview, answerTurn, generateReport } from '../services/interview'
import { getVersion, getJd, createSession, getSession, finishSession, createTurn, answerTurnRow, listTurns, transaction } from '../db/repo'
import { HttpError } from '../middleware/error'

export function interviewsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.post('/interviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再开始面试')
      const roundType = req.body.roundType as RoundType
      if (!ROUND_TYPES.includes(roundType)) throw new HttpError(400, 'roundType 非法')
      const maxRounds = Number(req.body.maxRounds) || 6
      let jd, jdId: number | null = null, role = roundType === 'tech' ? '技术岗' : '通用岗'
      const jdRaw = req.body.jobDescriptionId
      if (jdRaw !== undefined && jdRaw !== null) {
        const found = getJd(db, Number(jdRaw))
        if (!found) throw new HttpError(404, 'JD 不存在')
        jd = found.structured; jdId = found.id; role = found.structured.role || role
      }
      const { cliSessionId, firstQuestion } = await startInterview(ai, { resume: v.structured, jd, roundType })
      const sessionId = createSession(db, { resumeVersionId: v.id, jobDescriptionId: jdId, cliSessionId, role, roundType, maxRounds })
      createTurn(db, { sessionId, turnIndex: 0, question: firstQuestion })
      res.json({ sessionId, turnIndex: 0, question: firstQuestion })
    } catch (e) { next(e) }
  })

  r.post('/interviews/:id/answer', async (req, res, next) => {
    try {
      const session = getSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '面试不存在')
      if (session.status !== 'active') throw new HttpError(409, '面试已结束')
      const turns = listTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的问题')
      const answer = String(req.body.answer ?? '')
      const v = getVersion(db, session.resumeVersionId)!
      const jd = session.jobDescriptionId ? getJd(db, session.jobDescriptionId)?.structured : undefined
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await answerTurn(ai, {
        cliSessionId: session.cliSessionId, roundType: session.roundType, resume: v.structured, jd,
        history, question: pending.question, answer, turnIndex: pending.turnIndex, maxRounds: session.maxRounds,
      })
      const score = step.feedback?.score ?? 0
      answerTurnRow(db, pending.id, { answer, score, feedback: step.feedback ?? { score, highlights: [], gaps: [], better: '' } })

      if (step.nextQuestion) {
        createTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.nextQuestion })
        return res.json({ feedback: step.feedback, nextQuestion: step.nextQuestion, turnIndex: pending.turnIndex + 1, finished: false })
      }
      // 结束:生成报告
      const allTurns = listTurns(db, session.id).filter(t => t.answer !== null)
        .map(t => ({ question: t.question, answer: t.answer!, score: t.score ?? 0 }))
      const report = await generateReport(ai, { roundType: session.roundType, turns: allTurns })
      finishSession(db, session.id, report)
      res.json({ feedback: step.feedback, nextQuestion: null, turnIndex: pending.turnIndex, finished: true, report })
    } catch (e) { next(e) }
  })

  r.get('/interviews/:id', (req, res, next) => {
    try {
      const session = getSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '面试不存在')
      res.json({ session, turns: listTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
```
> 说明:`answer` 路由有两次 AI 调用(answerTurn,结束时再 generateReport),都在 DB 写之外完成;DB 写为单条 UPDATE/INSERT,无需事务包裹(finishSession 是单条 UPDATE)。

- [ ] **Step 4: 挂载到 index.ts**

```ts
import { interviewsRouter } from './routes/interviews'
// createApp 内:
  app.use('/api', interviewsRouter(db, ai))
```

- [ ] **Step 5: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS(含 3 个 interview 路由用例)。再 `npx tsc --noEmit -p apps/server/tsconfig.json`(0 错)。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/routes/interviews.ts apps/server/src/index.ts apps/server/src/routes/resumes.test.ts
git commit -m "feat(server): /api/interviews 路由 — 多轮面试状态机 + 报告"
```

---

### Task 8: 前端 api + 模拟面试页

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/pages/MockInterview.tsx`
- Test: `apps/web/src/pages/MockInterview.test.tsx`

**Interfaces:**
- Consumes: 后端 `/api/interviews*`(Task 7);类型 `RoundType`/`TurnFeedback`/`InterviewReport`(shared);`JdSelector`/`Card`/`Button`(现有)
- Produces:
  - `api.startInterview(input:{versionId:number; jobDescriptionId?:number; roundType:'tech'|'hr'; maxRounds?:number}): Promise<{sessionId:number; turnIndex:number; question:string}>`
  - `api.answerInterview(sessionId:number, answer:string): Promise<{feedback:TurnFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; report?:InterviewReport}>`
  - `api.getInterview(sessionId:number): Promise<{session:any; turns:any[]}>`
  - `<MockInterview versionId:number onBack:()=>void />` — 配置(roundType + 可选 JD + maxRounds)→ 开始 → 聊天式多轮(AI 问 / 输入答 / 显示本轮评分 + 下一问)→ 结束显示报告。

- [ ] **Step 1: 改 api**

`apps/web/src/api.ts`(加 import + 三个方法):
```ts
import type { StructuredResume, Review, JobDescription, InterviewKit, RoundType, TurnFeedback, InterviewReport } from '@aios/shared'
// ... 现有方法保留,在 api 对象内追加:
  startInterview: (input: { versionId:number; jobDescriptionId?:number; roundType:RoundType; maxRounds?:number }) =>
    j<{sessionId:number; turnIndex:number; question:string}>('/api/interviews', json(input)),
  answerInterview: (sessionId: number, answer: string) =>
    j<{feedback:TurnFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; report?:InterviewReport}>(
      `/api/interviews/${sessionId}/answer`, json({ answer })),
  getInterview: (sessionId: number) =>
    j<{session:any; turns:any[]}>(`/api/interviews/${sessionId}`),
```

- [ ] **Step 2: 写失败测试**

`apps/web/src/pages/MockInterview.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MockInterview } from './MockInterview'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'startInterview').mockResolvedValue({ sessionId:1, turnIndex:0, question:'请自我介绍' } as any)
  vi.spyOn(api, 'answerInterview').mockResolvedValue({
    feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:null, turnIndex:0, finished:true,
    report:{ overallScore:72, dimensions:[{name:'专业性',score:75,comment:'好'}], bestTurn:null, worstTurn:null, weaknesses:['系统设计'], nextSteps:['多练'] },
  } as any)
})

describe('MockInterview', () => {
  it('starts, answers, and shows the report', async () => {
    const { getByText, getByLabelText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
    fireEvent.click(getByText(/开始面试/))
    await findByText(/请自我介绍/)
    fireEvent.change(getByLabelText(/你的回答/), { target: { value: '我是...' } })
    fireEvent.click(getByText(/提交回答/))
    await findByText(/面试报告/)
    expect(getByText(/系统设计/)).toBeTruthy()   // weakness 渲染
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- MockInterview`
Expected: FAIL — 无法导入 `./MockInterview`

- [ ] **Step 4: 实现 MockInterview**

`apps/web/src/pages/MockInterview.tsx`:
```tsx
import { useState } from 'react'
import { api } from '../api'
import { JdSelector } from './JdSelector'
import { Card, Button } from '../components/ui'
import { ChevronLeft, Loader2 } from 'lucide-react'
import type { RoundType, TurnFeedback, InterviewReport } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string; feedback?: TurnFeedback }

export function MockInterview({ versionId, onBack }: { versionId: number; onBack: () => void }) {
  const [phase, setPhase] = useState<'config' | 'chat' | 'done'>('config')
  const [roundType, setRoundType] = useState<RoundType>('tech')
  const [jdId, setJdId] = useState<number | null>(null)
  const [maxRounds, setMaxRounds] = useState(6)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<InterviewReport | null>(null)

  async function start() {
    setBusy(true); setError('')
    try {
      const r = await api.startInterview({ versionId, jobDescriptionId: jdId ?? undefined, roundType, maxRounds })
      setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.question }]); setPhase('chat')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function submit() {
    if (!sessionId || !input.trim()) return
    const myAnswer = input
    setMsgs(m => [...m, { role:'me', text: myAnswer }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.answerInterview(sessionId, myAnswer)
      setMsgs(m => {
        const copy = [...m]
        for (let i = copy.length - 1; i >= 0; i--) if (copy[i].role === 'me') { copy[i] = { ...copy[i], feedback: r.feedback ?? undefined }; break }
        return copy
      })
      if (r.finished && r.report) { setReport(r.report); setPhase('done') }
      else if (r.nextQuestion) setMsgs(m => [...m, { role:'ai', text: r.nextQuestion! }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const Back = () => (
    <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
      <ChevronLeft size={15} /> 返回
    </button>
  )

  if (phase === 'config') {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-text">配置模拟面试</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">轮次类型</span>
            {(['tech','hr'] as const).map(t => (
              <button key={t} onClick={() => setRoundType(t)}
                className={`cursor-pointer rounded-btn px-3 py-1.5 text-sm ${roundType===t?'bg-accent text-white':'bg-surface-2 text-muted hover:text-text'}`}>
                {t==='tech'?'技术面':'HR 面'}
              </button>))}
          </div>
          <JdSelector value={jdId} onChange={setJdId} />
          <label className="flex items-center gap-2 text-sm text-muted">轮次上限
            <input type="number" min={3} max={12} value={maxRounds} onChange={e => setMaxRounds(Number(e.target.value)||6)}
              className="w-20 rounded-btn border border-border bg-surface-2 px-2 py-1 text-text" />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" onClick={start} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} 开始面试</Button>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'done' && report) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <h1 className="text-xl font-semibold tracking-tight">面试报告</h1>
        <Card className="p-5">
          <div className="text-3xl font-semibold text-accent">{report.overallScore}<span className="text-sm text-muted"> / 100</span></div>
          <div className="mt-4 space-y-2">
            {report.dimensions.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm"><span className="text-text">{d.name}</span><span className="text-muted">{d.score} · {d.comment}</span></div>
            ))}
          </div>
        </Card>
        {report.weaknesses.length > 0 && (
          <Card className="p-5"><h3 className="mb-2 text-sm font-semibold text-text">暴露的短板</h3>
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{report.weaknesses.map((w,i)=><li key={i}>{w}</li>)}</ul></Card>
        )}
        {report.nextSteps.length > 0 && (
          <Card className="p-5"><h3 className="mb-2 text-sm font-semibold text-text">下一步训练建议</h3>
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{report.nextSteps.map((s,i)=><li key={i}>{s}</li>)}</ul></Card>
        )}
      </div>
    )
  }

  // chat
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Back />
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] rounded-card px-4 py-2.5 text-sm ${m.role==='ai' ? 'bg-surface-2 text-text' : 'bg-accent text-white'}`}>
              {m.text}
            </div>
            {m.feedback && (
              <div className="mt-1 max-w-[85%] rounded-card border border-border bg-surface p-3 text-xs text-muted">
                <span className="font-medium text-text">本轮评分 {m.feedback.score}</span>
                {m.feedback.gaps.length > 0 && <p className="mt-1">待改进：{m.feedback.gaps.join('；')}</p>}
                {m.feedback.better && <p className="mt-1">更优答法：{m.feedback.better}</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 面试官思考中…</div>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <textarea aria-label="你的回答" rows={3} value={input} onChange={e => setInput(e.target.value)} disabled={busy}
          className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="输入你的回答…" />
        <Button variant="primary" onClick={submit} disabled={busy}>提交回答</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- MockInterview`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/api.ts apps/web/src/pages/MockInterview.tsx apps/web/src/pages/MockInterview.test.tsx
git commit -m "feat(web): api 面试三方法 + 模拟面试聊天页(配置/对话/报告)"
```

---

### Task 9: 导航接入 + App 流转 + 端到端冒烟

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: 现有测试回归(App 无独立单测,靠 tsc + build + 既有页面测试)

**Interfaces:**
- Consumes: `MockInterview` 页(Task 8)
- Produces: 顶部导航新增「模拟面试」;选中后,若已有 confirmed 版本则进入 `<MockInterview>`,否则提示先在「简历大师」上传确认简历。

- [ ] **Step 1: 改 App.tsx**

在 App 的 `view` 联合类型加 `'interview'`,navItems 加一项(icon 用 lucide `MessagesSquare`),并在主区渲染:
```tsx
import { MockInterview } from './pages/MockInterview'
import { MessagesSquare } from 'lucide-react'
// navItems 增加:{ id: 'interview' as const, label: '模拟面试', icon: MessagesSquare }
// view 类型:'dashboard' | 'resume' | 'interview'
// 主区:
{view === 'dashboard' ? <Dashboard />
  : view === 'interview'
    ? (confirmedVersion !== null
        ? <MockInterview versionId={confirmedVersion} onBack={() => setView('resume')} />
        : <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            请先到「简历大师」上传并确认一份简历,再开始模拟面试。
          </div>)
    : renderResume()}
```
> `confirmedVersion` 是 App 已有状态(简历确认后置位)。模拟面试复用它作为简历来源。

- [ ] **Step 2: 全量回归 + 类型检查 + 构建**

Run: `npm test`(全绿)→ `npx tsc --noEmit -p apps/web/tsconfig.json`(0 错)→ `npm run build --workspace=apps/web`(成功)。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): 导航接入模拟面试 + App 流转"
```

- [ ] **Step 4: 端到端冒烟(真机,控制者执行,不交子代理)**

重启后端;用已 confirmed 的简历版本,经 API 跑一整场:`POST /api/interviews {versionId, roundType:'tech'}` → 多次 `POST /api/interviews/:id/answer {answer}` 直到 `finished:true` → `GET /api/interviews/:id` 看报告。验证:首问合理、追问顺着回答、逐轮有评分、达上限后出报告;并**故意验证降级**(可临时传一个无效 cliSessionId 或观察日志)确认会话失败时仍能继续。记录耗时与结论到进度账本。

---

## 实施顺序与依赖

Task 1(shared)→ 2(适配层会话)→ 3(数据层)→ 4(start)→ 5(answerTurn+降级)→ 6(report)→ 7(路由状态机)→ 8(前端 api+页面)→ 9(导航+冒烟)。严格按序;每个 Task 自带测试与提交。Task 9 真机冒烟由控制者完成。




