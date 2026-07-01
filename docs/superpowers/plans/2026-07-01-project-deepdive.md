# 模块五实现计划:项目深挖(技术深挖 + 5 维评分 + 知识地图)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 锁定简历中用户选定的一个项目,像资深技术面试官那样连续技术追问(追问锚定简历原文),逐轮 5 维评分,结束产出「项目知识地图」+ 差题打标,知识地图页展示本次薄弱问题自成闭环。

**Architecture:** 复用模块四模拟面试引擎(CLI 会话 `--session-id`/`--resume` + 失败降级 + 轮次硬停 + is_weak 打标),但独立数据表、项目专属追问 prompt、项目专属 5 维评分 schema、产出 ProjectMap。packages/shared 加 deepdive 模型;apps/server 加两表 + deepdive 服务 + /api/deepdives 路由;apps/web 加选项目+对话+知识地图页。纯新增,向后兼容。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind(web);Vitest;AI 经 ClaudeCliProvider(会话 + completeJson/completeJsonSession)。

## Global Constraints

- AI 调用**只**经 `AiProvider`;返回 JSON **必须** zod 校验,失败重试一次再降级报错(`completeJson`/`completeJsonSession`)。地图非流式整包。
- 多轮上下文**优先 CLI 会话**;调用失败**必须降级**为无状态拼 history(复用模块四 answerTurn 模式),不得因会话丢失而崩。
- SQLite **全程参数化**;多步写用 `transaction`(已存在)。
- 简历 version 必须 `status === 'confirmed'`,否则 HTTP 409;projectName 必须在该版本 `structured.projects[].name` 中,否则 400;session 不存在 404,非 active 409。
- 后端只绑 127.0.0.1;AI 输出当不可信数据,前端**不用** `dangerouslySetInnerHTML`,纯文本渲染。
- 轮次上限默认 8,夹紧整数 1–15;每次 AI 调用有超时;**路由层硬停**:`turnIndex+1 >= maxRounds` 时强制结束出地图,无论 AI 是否还想问。
- `is_weak` 阈值:本轮总分 `score < 30`(满分 50 的 60%)→ 1。
- 追问 prompt 严格围绕该项目、锚定简历原句,不跑题、不问脱离项目的纯八股;答不上来时评分区分"真不会/表达差"且 `betterAnswer` 给出该怎么答;知识地图字段不杜撰,blindSpots 记答不出/答错的点。
- TypeScript 严格模式;**不破坏现有 100 个测试**;纯新增,不改动模块四代码。
- node:sqlite:`DatabaseSync`;`db.exec('CREATE TABLE IF NOT EXISTS ...')`;`prepare().run/get/all`;无 `.pragma()`。
- 前端组件测试首行 `// @vitest-environment jsdom`;jsdom 无 `scrollIntoView` 需 polyfill;沿用根 vitest.config.ts。

## 文件结构

```
packages/shared/src/
  deepdive.ts              # 新增:DeepdiveFeedbackSchema, DeepdiveStepSchema, ProjectMapSchema
  index.ts                 # 修改:导出 deepdive
apps/server/src/
  db/connection.ts         # 修改:建 project_deepdive_sessions/turns 两表
  db/repo.ts               # 修改:deepdive session/turn CRUD;exportAll 加表
  prompts/deepdive-system.txt  # 新增:技术面试官人设(用户提供的 prompt,适配单项目)
  prompts/deepdive-step.txt    # 新增:5 维评分 + 追问 JSON 约束
  prompts/deepdive-map.txt     # 新增:项目知识地图 JSON 约束
  services/deepdive.ts     # 新增:startDeepdive / answerDeepdive(含降级) / generateMap
  routes/deepdive.ts       # 新增:POST /api/deepdives、/:id/answer、GET /:id、GET /api/deepdives
  index.ts                 # 修改:挂载 deepdiveRouter
apps/web/src/
  api.ts                   # 修改:startDeepdive/answerDeepdive/getDeepdive/listDeepdives
  pages/ProjectDeepdive.tsx  # 新增:选项目 + 对话 + 5维评分 + 知识地图 + 本次薄弱问题
  App.tsx                  # 修改:导航加「项目深挖」+ 流转
```

实施顺序:1(shared)→ 2(数据层)→ 3(服务 startDeepdive)→ 4(answerDeepdive+降级)→ 5(generateMap)→ 6(路由)→ 7(前端 api+页面)→ 8(导航+冒烟)。

---

### Task 1: 共享数据模型(deepdive)

**Files:**
- Create: `packages/shared/src/deepdive.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/deepdive.test.ts`

**Interfaces:**
- Produces:
  - `DeepdiveFeedbackSchema` → `{ scores:{techDepth,implementationClarity,architectureAwareness,metricsAwareness,expression: each number 0-10}, total:number(0-50), strengths:string[], vague:string[], missingDetails:string[], followUps:string[], betterAnswer:string }`
  - `DeepdiveStepSchema` → `{ feedback: DeepdiveFeedback | null, nextQuestion: string | null }`
  - `ProjectMapSchema` → `{ projectName, background, businessGoal, techApproach, personalContribution: string; coreChallenges, alternatives, risks, optimizations, hotQuestions, blindSpots: string[]; evaluation: string }`
  - 类型 `DeepdiveFeedback`/`DeepdiveStep`/`ProjectMap`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/deepdive.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { DeepdiveFeedbackSchema, DeepdiveStepSchema, ProjectMapSchema } from './deepdive'

const fb = { scores:{ techDepth:8, implementationClarity:7, architectureAwareness:6, metricsAwareness:5, expression:7 },
  total:33, strengths:['召回讲清楚了'], vague:['阈值没说清'], missingDetails:['去重策略'], followUps:['数据泄漏?'], betterAnswer:'先讲…' }

describe('deepdive schemas', () => {
  it('accepts valid feedback', () => { expect(DeepdiveFeedbackSchema.parse(fb)).toEqual(fb) })
  it('rejects out-of-range dimension', () => {
    expect(() => DeepdiveFeedbackSchema.parse({ ...fb, scores:{ ...fb.scores, techDepth:11 } })).toThrow()
  })
  it('accepts a step with null feedback (first turn)', () => {
    expect(DeepdiveStepSchema.parse({ feedback:null, nextQuestion:'你的 RAG 如何召回?' }).nextQuestion).toBe('你的 RAG 如何召回?')
  })
  it('accepts a step ending the deepdive', () => {
    expect(DeepdiveStepSchema.parse({ feedback:fb, nextQuestion:null }).nextQuestion).toBeNull()
  })
  it('accepts a valid project map', () => {
    const m = { projectName:'P', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c',
      coreChallenges:['难'], alternatives:['别的'], evaluation:'e', risks:['风险'], optimizations:['优化'],
      hotQuestions:['追问'], blindSpots:['盲区'] }
    expect(ProjectMapSchema.parse(m)).toEqual(m)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- deepdive` → FAIL(无法导入 `./deepdive`)

- [ ] **Step 3: 实现**

`packages/shared/src/deepdive.ts`:
```ts
import { z } from 'zod'
const d10 = z.number().min(0).max(10)
export const DeepdiveFeedbackSchema = z.object({
  scores: z.object({
    techDepth: d10, implementationClarity: d10, architectureAwareness: d10,
    metricsAwareness: d10, expression: d10,
  }),
  total: z.number().min(0).max(50),
  strengths: z.array(z.string()),
  vague: z.array(z.string()),
  missingDetails: z.array(z.string()),
  followUps: z.array(z.string()),
  betterAnswer: z.string(),
})
export type DeepdiveFeedback = z.infer<typeof DeepdiveFeedbackSchema>

export const DeepdiveStepSchema = z.object({
  feedback: DeepdiveFeedbackSchema.nullable(),
  nextQuestion: z.string().nullable(),
})
export type DeepdiveStep = z.infer<typeof DeepdiveStepSchema>

export const ProjectMapSchema = z.object({
  projectName: z.string(), background: z.string(), businessGoal: z.string(),
  techApproach: z.string(), personalContribution: z.string(),
  coreChallenges: z.array(z.string()), alternatives: z.array(z.string()),
  evaluation: z.string(), risks: z.array(z.string()), optimizations: z.array(z.string()),
  hotQuestions: z.array(z.string()), blindSpots: z.array(z.string()),
})
export type ProjectMap = z.infer<typeof ProjectMapSchema>
```
`packages/shared/src/index.ts` 增加:`export * from './deepdive'`

- [ ] **Step 4: 运行确认通过** — `npm test -- deepdive` → PASS(5)

- [ ] **Step 5: 全量回归 + 提交**
```bash
npm test   # 现有 100 仍绿
git add packages/shared/src/deepdive.ts packages/shared/src/deepdive.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 项目深挖模型(5维反馈/步骤/知识地图)"
```

---

### Task 2: 数据层(两表 + repo)

**Files:**
- Modify: `apps/server/src/db/connection.ts`, `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加)

**Interfaces:**
- Consumes: `DeepdiveFeedback`/`ProjectMap`(Task 1), 现有 `openDb`/`createResume`/`createVersion`
- Produces:
  - `createDeepdiveSession(db, {resumeVersionId, projectName, cliSessionId, maxRounds}): number`
  - `getDeepdiveSession(db, id): { id, resumeVersionId, projectName, cliSessionId:string|null, maxRounds, status:'active'|'finished', map:ProjectMap|null } | undefined`
  - `finishDeepdiveSession(db, id, map:ProjectMap): void`
  - `createDeepdiveTurn(db, {sessionId, turnIndex, question}): number`
  - `answerDeepdiveTurn(db, turnId, {answer, score, feedback:DeepdiveFeedback}): void`(is_weak = score<30)
  - `listDeepdiveTurns(db, sessionId): Array<{ id, turnIndex, question, answer:string|null, score:number|null, feedback:DeepdiveFeedback|null, isWeak:boolean }>`
  - `listDeepdiveSessions(db): { id, projectName, status, total:number|null, createdAt }[]`(total 取 map 存在则用各轮总分平均,简化为 null 若未完成)
  - `exportAll` 加 `deepdiveSessions` + `deepdiveTurns`

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { createDeepdiveSession, getDeepdiveSession, finishDeepdiveSession,
  createDeepdiveTurn, answerDeepdiveTurn, listDeepdiveTurns, listDeepdiveSessions } from './repo'

describe('deepdive repo', () => {
  function setup() {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
      projects:[{name:'体验生判',role:'负责人',period:'',stack:['LLM'],bullets:['RAG 召回'],metrics:[]}], skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    return { db, vid }
  }
  const fb = { scores:{techDepth:5,implementationClarity:5,architectureAwareness:5,metricsAwareness:5,expression:5},
    total:25, strengths:[], vague:['浅'], missingDetails:[], followUps:[], betterAnswer:'深入' }
  it('round-trips a session + turns and computes is_weak', () => {
    const { db, vid } = setup()
    const sid = createDeepdiveSession(db, { resumeVersionId:vid, projectName:'体验生判', cliSessionId:'uuid', maxRounds:8 })
    expect(getDeepdiveSession(db, sid)!.projectName).toBe('体验生判')
    const t = createDeepdiveTurn(db, { sessionId:sid, turnIndex:0, question:'RAG 怎么召回?' })
    answerDeepdiveTurn(db, t, { answer:'嗯就召回', score:25, feedback:fb })
    expect(listDeepdiveTurns(db, sid)[0].isWeak).toBe(true) // 25 < 30
  })
  it('finishDeepdiveSession writes map + flips status; listDeepdiveSessions lists it', () => {
    const { db, vid } = setup()
    const sid = createDeepdiveSession(db, { resumeVersionId:vid, projectName:'体验生判', cliSessionId:null, maxRounds:8 })
    const map = { projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c',
      coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] }
    finishDeepdiveSession(db, sid, map)
    expect(getDeepdiveSession(db, sid)!.status).toBe('finished')
    expect(getDeepdiveSession(db, sid)!.map!.blindSpots[0]).toBe('阈值')
    expect(listDeepdiveSessions(db).length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- repo` → FAIL

- [ ] **Step 3: 迁移(connection.ts,追加到 migrate 的 exec)**

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_deepdive_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      project_name TEXT NOT NULL, cli_session_id TEXT,
      max_rounds INTEGER NOT NULL DEFAULT 8, status TEXT NOT NULL DEFAULT 'active',
      map_json TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS project_deepdive_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES project_deepdive_sessions(id),
      turn_index INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT,
      score INTEGER, feedback_json TEXT, is_weak INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
  `)
```

- [ ] **Step 4: repo.ts 新增**

```ts
import { ProjectMapSchema, DeepdiveFeedbackSchema, type ProjectMap, type DeepdiveFeedback } from '@aios/shared'

export function createDeepdiveSession(db: DatabaseSync, s: { resumeVersionId:number; projectName:string; cliSessionId:string|null; maxRounds:number }): number {
  return Number(db.prepare('INSERT INTO project_deepdive_sessions (resume_version_id,project_name,cli_session_id,max_rounds) VALUES (?,?,?,?)')
    .run(s.resumeVersionId, s.projectName, s.cliSessionId, s.maxRounds).lastInsertRowid)
}
export function getDeepdiveSession(db: DatabaseSync, id: number) {
  const r = db.prepare('SELECT * FROM project_deepdive_sessions WHERE id=?').get(id) as any
  if (!r) return undefined
  return { id: r.id, resumeVersionId: r.resume_version_id, projectName: r.project_name,
    cliSessionId: r.cli_session_id ?? null, maxRounds: r.max_rounds, status: r.status as 'active'|'finished',
    map: r.map_json ? ProjectMapSchema.parse(JSON.parse(r.map_json)) : null }
}
export function finishDeepdiveSession(db: DatabaseSync, id: number, map: ProjectMap): void {
  db.prepare("UPDATE project_deepdive_sessions SET status='finished', map_json=? WHERE id=?").run(JSON.stringify(map), id)
}
export function createDeepdiveTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO project_deepdive_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerDeepdiveTurn(db: DatabaseSync, turnId: number, a: { answer:string; score:number; feedback:DeepdiveFeedback }): void {
  db.prepare('UPDATE project_deepdive_turns SET answer=?, score=?, feedback_json=?, is_weak=? WHERE id=?')
    .run(a.answer, a.score, JSON.stringify(a.feedback), a.score < 30 ? 1 : 0, turnId)
}
export function listDeepdiveTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM project_deepdive_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null,
    score: r.score ?? null, feedback: r.feedback_json ? DeepdiveFeedbackSchema.parse(JSON.parse(r.feedback_json)) : null,
    isWeak: !!r.is_weak }))
}
export function listDeepdiveSessions(db: DatabaseSync) {
  const rows = db.prepare('SELECT id,project_name,status,created_at FROM project_deepdive_sessions ORDER BY id DESC').all() as any[]
  return rows.map(r => {
    const scored = db.prepare('SELECT score FROM project_deepdive_turns WHERE session_id=? AND score IS NOT NULL').all(r.id) as any[]
    const total = scored.length ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length) : null
    return { id: r.id, projectName: r.project_name, status: r.status as 'active'|'finished', total, createdAt: r.created_at as string }
  })
}
```
`exportAll` 加:`deepdiveSessions: db.prepare('SELECT * FROM project_deepdive_sessions').all(), deepdiveTurns: db.prepare('SELECT * FROM project_deepdive_turns').all()`

- [ ] **Step 5: 运行确认通过** — `npm test -- repo` → PASS

- [ ] **Step 6: 提交**
```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): project_deepdive 两表 + repo(is_weak<30)"
```

---

### Task 3: 服务 — prompts + startDeepdive

**Files:**
- Create: `apps/server/src/prompts/deepdive-system.txt`, `deepdive-step.txt`, `deepdive-map.txt`
- Create: `apps/server/src/services/deepdive.ts`
- Test: `apps/server/src/services/deepdive.test.ts`

**Interfaces:**
- Consumes: `AiProvider`(会话方法), `StructuredResume`(shared)
- Produces:
  - `buildDeepdiveSystem(): string`(读 deepdive-system.txt)
  - `findProject(resume, projectName): StructuredResume['projects'][number] | undefined`(导出供路由校验用)
  - `startDeepdive(ai, { resume, projectName }): Promise<{ cliSessionId: string; firstQuestion: string }>` — 开会话,注入系统 prompt + 该项目完整结构(name/role/period/stack/bullets/metrics 原句)+ 简历其余上下文,产出直接进技术细节、锚定简历原句的第一问。

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/deepdive.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startDeepdive, findProject } from './deepdive'

const resume = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
  projects:[{name:'体验生判',role:'负责人',period:'',stack:['Zeus','RAG'],bullets:['用 LLM 对 query/类别打分'],metrics:['acc+1.5pp']}],
  skills:[],awards:[] } as any

describe('deepdive service', () => {
  it('findProject locates by name', () => {
    expect(findProject(resume, '体验生判')!.stack).toContain('RAG')
    expect(findProject(resume, '不存在')).toBeUndefined()
  })
  it('startDeepdive opens a session and returns first question', async () => {
    let captured = ''
    const ai: AiProvider = {
      async complete(){ return 'q' }, async *stream(){ yield 'q' },
      startSession(){ return 'dd-sess' },
      async continueSession(_s, o){ captured = o.prompt; return '你提到用 LLM 打分,Prompt 如何设计?' },
    }
    const r = await startDeepdive(ai, { resume, projectName:'体验生判' })
    expect(r.cliSessionId).toBe('dd-sess')
    expect(r.firstQuestion).toContain('Prompt')
    expect(captured).toContain('体验生判')   // 项目结构注入了 prompt
    expect(captured).toContain('用 LLM 对 query/类别打分')  // bullets 原句注入
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- services/deepdive` → FAIL

- [ ] **Step 3: 写 prompts + 实现**

`apps/server/src/prompts/deepdive-system.txt`(采用用户提供的项目深挖 prompt,适配单项目):
```
你是一位资深技术面试官,重点对候选人简历中的**指定项目**进行技术深挖。你的任务不是问泛泛的项目介绍,而是基于该项目的真实内容,提出有技术深度、有针对性、能判断候选人是否真正理解实现细节的问题。

严格围绕这个指定项目提问,尤其关注技术方案、模型/算法、系统架构、数据流程、工程实现、性能优化、评估方法和线上问题排查。所有问题必须与该项目强相关,不能脱离项目问纯概念题,也不能问与项目无关的八股。

【追问必须锚定简历原句】每个问题都要引用候选人简历里对该项目的具体表述再深入,例如"你提到用 LLM 对 query/类别/大卡/ASR 打分,这个 Prompt 如何设计?输出格式如何约束?如何处理输出不稳定?"。不要问"你做了什么/难点是什么/效果怎么样"这类表层问题,直接进技术细节。

提问技术方向(围绕该项目):
1. 技术方案设计:为什么选这个方案?考虑过其他方案吗(如 RAG vs Fine-tuning、规则 vs 模型、多阶段 vs 端到端)?
2. 架构设计:整体架构?数据如何流转?模块如何交互?瓶颈在哪?
3. 核心算法/模型:用了什么算法/模型/策略?输入输出?关键逻辑?为什么能解决问题?
4. 数据处理:训练/评估/业务数据如何构建、清洗、去重、处理噪声/长尾/异常/负样本?
5. Prompt/Agent/RAG 细节:Prompt 如何设计?RAG 如何召回、chunk、评估召回质量?Agent 如何拆任务、避免幻觉?
6. 评估指标:效果如何衡量?指标如何定义?离线与线上是否一致?如何证明提升由该方案带来?
7. 工程落地:如何部署、保证稳定性、处理超时/重试/并发/日志监控/成本?
8. 性能优化:数据量/QPS/用户量扩大 10 倍,哪里先出问题?如何优化?
9. 异常排查:上线后效果下降/延迟升高/输出异常/指标波动,如何从数据、Prompt、模型、召回、规则定位?
10. 技术复盘:重做一次会怎么改进?有无更优模型/数据流/架构?

规则:每次只问一个问题,等候选人回答后必须**基于其回答继续追问**,而不是机械换题。如果回答像在背项目介绍、缺技术细节、说不清实现逻辑、无法解释为什么这么设计,必须继续追问、不轻易放过。目标是帮候选人真正掌握项目技术细节、在真实面试中经得起连续追问。
```
`apps/server/src/prompts/deepdive-step.txt`:
```
基于候选人刚才的回答,评分并决定下一步追问。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. feedback.scores 五个维度各 0-10:techDepth(技术理解深度)、implementationClarity(实现细节清晰度)、architectureAwareness(架构与工程意识)、metricsAwareness(指标与评估意识)、expression(面试表达质量);total 为五者之和(0-50)。
3. feedback 还需给出:strengths(讲得好的技术点)、vague(过于空泛处)、missingDetails(缺失的关键实现细节)、followUps(面试官可能继续追问什么)、betterAnswer(更好的技术回答应如何组织)。
4. 若候选人答"不清楚/没细想",要区分是真不会还是表达差,照常给分(可低),且 betterAnswer 必须给出这道题**该怎么答**,帮他学会,而不是只扣分。
5. nextQuestion:基于其回答继续深挖的下一个技术问题;若应结束则为 null。
6. JSON 结构:
{ "feedback": { "scores": {"techDepth":0,"implementationClarity":0,"architectureAwareness":0,"metricsAwareness":0,"expression":0}, "total":0, "strengths":[], "vague":[], "missingDetails":[], "followUps":[], "betterAnswer":"" }, "nextQuestion": "下一个问题，或 null" }
```
`apps/server/src/prompts/deepdive-map.txt`:
```
深挖结束,基于该项目的简历内容与全部问答,生成「项目知识地图」。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 各字段基于简历与候选人回答,**不得杜撰**候选人没提到的内容;不确定处留简短或空。
3. blindSpots:本次问到但候选人答不出/答错/明显薄弱的技术点。
4. JSON 结构:
{ "projectName":"", "background":"", "businessGoal":"", "techApproach":"", "personalContribution":"",
  "coreChallenges":[], "alternatives":[], "evaluation":"", "risks":[], "optimizations":[], "hotQuestions":[], "blindSpots":[] }
```
`apps/server/src/services/deepdive.ts`:
```ts
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
```

- [ ] **Step 4: 运行确认通过** — `npm test -- services/deepdive` → PASS(2)

- [ ] **Step 5: 提交**
```bash
git add apps/server/src/prompts/deepdive-system.txt apps/server/src/prompts/deepdive-step.txt apps/server/src/prompts/deepdive-map.txt apps/server/src/services/deepdive.ts apps/server/src/services/deepdive.test.ts
git commit -m "feat(server): 项目深挖服务 startDeepdive + 技术面试官 prompts"
```

---

### Task 4: answerDeepdive(会话续接 + 降级 + 5维评分)

**Files:**
- Modify: `apps/server/src/services/deepdive.ts`
- Test: `apps/server/src/services/deepdive.test.ts`(追加)

**Interfaces:**
- Consumes: `completeJson`/`completeJsonSession`(claude-cli), `DeepdiveStepSchema`(shared)
- Produces:
  - `answerDeepdive(ai, ctx): Promise<DeepdiveStep>`,ctx:`{ cliSessionId:string|null; resume:StructuredResume; projectName:string; history:Array<{question:string;answer:string}>; question:string; answer:string; turnIndex:number; maxRounds:number }`
  - 行为:构造 step prompt(含本轮回答 + 「若 turnIndex+1>=maxRounds 则 nextQuestion 必须为 null」);优先 `completeJsonSession`;失败或无会话 → 降级 `completeJson` 拼 projectBrief + history。

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { answerDeepdive } from './deepdive'
const stepOut = JSON.stringify({ feedback:{ scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }, nextQuestion:'那召回排序如何做?' })

describe('answerDeepdive', () => {
  const base = { resume, projectName:'体验生判', history:[{question:'q',answer:'a'}], question:'q', answer:'a', turnIndex:0, maxRounds:8 }
  it('uses the CLI session when available', async () => {
    let used = false
    const ai: AiProvider = { async complete(){return stepOut}, async *stream(){yield stepOut},
      startSession(){return 's'}, async continueSession(){ used = true; return stepOut } }
    const step = await answerDeepdive(ai, { ...base, cliSessionId:'s1' })
    expect(used).toBe(true); expect(step.nextQuestion).toBe('那召回排序如何做?')
  })
  it('falls back to stateless when session throws', async () => {
    let usedComplete = false
    const ai: AiProvider = { async complete(){ usedComplete = true; return stepOut }, async *stream(){yield stepOut},
      startSession(){return 's'}, async continueSession(){ throw new Error('resume failed') } }
    const step = await answerDeepdive(ai, { ...base, cliSessionId:'s1' })
    expect(usedComplete).toBe(true); expect(step.feedback!.total).toBe(30)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- services/deepdive` → FAIL

- [ ] **Step 3: 实现(追加到 deepdive.ts)**

```ts
import { completeJson, completeJsonSession } from '../ai/claude-cli'
import { DeepdiveStepSchema, type DeepdiveStep } from '@aios/shared'

const STEP = readFileSync(join(dir, '../prompts/deepdive-step.txt'), 'utf8')

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
```

- [ ] **Step 4: 运行确认通过** — `npm test -- services/deepdive` → PASS(start + 2 answer)

- [ ] **Step 5: 提交**
```bash
git add apps/server/src/services/deepdive.ts apps/server/src/services/deepdive.test.ts
git commit -m "feat(server): answerDeepdive — 会话续接 + 失败降级 + 5维评分"
```

---

### Task 5: generateMap

**Files:**
- Modify: `apps/server/src/services/deepdive.ts`
- Test: `apps/server/src/services/deepdive.test.ts`(追加)

**Interfaces:**
- Consumes: `completeJson`, `ProjectMapSchema`(shared)
- Produces: `generateMap(ai, { resume, projectName, turns }): Promise<ProjectMap>` — 基于项目简历 + 全部问答生成知识地图(非流式)。

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { generateMap } from './deepdive'
const mapOut = JSON.stringify({ projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c',
  coreChallenges:['难'], alternatives:['别的'], evaluation:'e', risks:['风险'], optimizations:['优化'], hotQuestions:['追问'], blindSpots:['阈值'] })

describe('generateMap', () => {
  it('returns a validated project map', async () => {
    const ai: AiProvider = { async complete(){ return mapOut }, async *stream(){ yield mapOut } }
    const m = await generateMap(ai, { resume, projectName:'体验生判', turns:[{question:'q',answer:'a',score:30}] })
    expect(m.projectName).toBe('体验生判'); expect(m.blindSpots).toContain('阈值')
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- services/deepdive` → FAIL

- [ ] **Step 3: 实现(追加)**

```ts
import { ProjectMapSchema, type ProjectMap } from '@aios/shared'
const MAP = readFileSync(join(dir, '../prompts/deepdive-map.txt'), 'utf8')

export function generateMap(ai: AiProvider, input: {
  resume: StructuredResume; projectName: string; turns: Array<{ question: string; answer: string; score: number }>
}): Promise<ProjectMap> {
  const body = input.turns.map((t, i) => `Q${i}: ${t.question}\nA${i}: ${t.answer}\n本轮总分: ${t.score}`).join('\n\n')
  const prompt = `${projectBrief(input.resume, input.projectName)}\n\n深挖问答与评分:\n${body}\n\n请生成该项目的知识地图。`
  return completeJson(ai, ProjectMapSchema, { system: `${SYSTEM}\n\n${MAP}`, prompt })
}
```
> import 若 Task 3/4 已有,合并,勿重复。

- [ ] **Step 4: 运行确认通过 + 全量回归** — `npm test -- services/deepdive` → PASS;`npm test` 全绿

- [ ] **Step 5: 提交**
```bash
git add apps/server/src/services/deepdive.ts apps/server/src/services/deepdive.test.ts
git commit -m "feat(server): generateMap 生成项目知识地图"
```

---

### Task 6: 路由(状态机 + 硬停)

**Files:**
- Create: `apps/server/src/routes/deepdive.ts`
- Modify: `apps/server/src/index.ts`(挂载)
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`(`describe('deepdive routes', ...)`)

**Interfaces:**
- Consumes: `startDeepdive`/`answerDeepdive`/`generateMap`/`findProject`(services), `getVersion`/`createDeepdiveSession`/`getDeepdiveSession`/`finishDeepdiveSession`/`createDeepdiveTurn`/`answerDeepdiveTurn`/`listDeepdiveTurns`/`listDeepdiveSessions`(repo), `HttpError`
- Produces:
  - `deepdiveRouter(db, ai): Router`
  - `POST /api/deepdives`(body `{versionId, projectName, maxRounds?}`):version 不存在 404 / 未 confirmed 409;`findProject` 不到 400;maxRounds 夹紧整数 1–15(默认 8);startDeepdive → createDeepdiveSession + createDeepdiveTurn(0) → `{sessionId, turnIndex:0, question}`
  - `POST /api/deepdives/:id/answer`(body `{answer}`):session 不存在 404 / 非 active 409 / 无待答 turn 409;取待答 turn、装配 history(含当前)、调 answerDeepdive → answerDeepdiveTurn 回填;**硬停** `pending.turnIndex+1 >= session.maxRounds` 即结束(忽略 AI 的非空 nextQuestion);继续则建下一 turn,结束则 generateMap + finishDeepdiveSession → `{feedback, nextQuestion, turnIndex, finished, map?}`
  - `GET /api/deepdives/:id` → `{session, turns}`
  - `GET /api/deepdives` → `listDeepdiveSessions`

- [ ] **Step 1: 写失败测试(追加)**

```ts
// 会话感知 fake:parse / 首问 / step / map 按 system|prompt 分辨
function deepdiveAi() {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
    projects:[{name:'体验生判',role:'负责人',period:'',stack:['RAG'],bullets:['LLM 打分'],metrics:[]}], skills:[],awards:[] })
  const firstQ = '你提到 LLM 打分,Prompt 如何设计?'
  const stepGo = JSON.stringify({ feedback:{ scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }, nextQuestion:'召回排序?' })
  const stepEnd = JSON.stringify({ feedback:{ scores:{techDepth:5,implementationClarity:5,architectureAwareness:5,metricsAwareness:5,expression:5}, total:25, strengths:[], vague:['浅'], missingDetails:[], followUps:[], betterAnswer:'应…' }, nextQuestion:null })
  const map = JSON.stringify({ projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c', coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] })
  let answers = 0
  const handle = (system: string, prompt: string) => {
    if (system.includes('简历解析器')) return parsed
    if (prompt.includes('生成该项目的知识地图')) return map
    if (prompt.includes('提出关于该项目的第一个深挖问题')) return firstQ
    if (prompt.includes('请评分并决定下一步追问')) { answers++; return answers >= 2 ? stepEnd : stepGo }
    return firstQ
  }
  return { async complete(o:any){ return handle(o.system ?? '', o.prompt) }, async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'dd' }, async continueSession(_s:string, o:any){ return handle(o.system ?? '', o.prompt) } } as any
}

describe('deepdive routes', () => {
  async function confirmed(app:any) {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    return up.body.versionId
  }
  it('rejects start before confirm (409) and unknown project (400)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, deepdiveAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    expect((await request(app).post('/api/deepdives').send({ versionId: up.body.versionId, projectName:'体验生判' })).status).toBe(409)
    const vid = await confirmed(app)
    expect((await request(app).post('/api/deepdives').send({ versionId: vid, projectName:'不存在的项目' })).status).toBe(400)
  })
  it('runs a deepdive to a knowledge map', async () => {
    const db = openDb(':memory:'); const app = createApp(db, deepdiveAi())
    const vid = await confirmed(app)
    const start = await request(app).post('/api/deepdives').send({ versionId: vid, projectName:'体验生判', maxRounds:8 })
    expect(start.status).toBe(200); expect(start.body.question).toBeTruthy()
    const sid = start.body.sessionId
    const a1 = await request(app).post(`/api/deepdives/${sid}/answer`).send({ answer:'用哈希' })
    expect(a1.body.finished).toBe(false); expect(a1.body.feedback.total).toBe(30)
    const a2 = await request(app).post(`/api/deepdives/${sid}/answer`).send({ answer:'不清楚' })
    expect(a2.body.finished).toBe(true); expect(a2.body.map.blindSpots).toContain('阈值')
    const got = await request(app).get(`/api/deepdives/${sid}`)
    expect(got.body.session.status).toBe('finished')
    expect((await request(app).get('/api/deepdives')).body.length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- resumes` → FAIL(/api/deepdives 404)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/deepdive.ts`:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { startDeepdive, answerDeepdive, generateMap, findProject } from '../services/deepdive'
import { getVersion, createDeepdiveSession, getDeepdiveSession, finishDeepdiveSession,
  createDeepdiveTurn, answerDeepdiveTurn, listDeepdiveTurns, listDeepdiveSessions } from '../db/repo'
import { HttpError } from '../middleware/error'

export function deepdiveRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.get('/deepdives', (_req, res) => res.json(listDeepdiveSessions(db)))

  r.post('/deepdives', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再深挖')
      const projectName = String(req.body.projectName ?? '')
      if (!findProject(v.structured, projectName)) throw new HttpError(400, '该项目不在简历中')
      const maxRounds = Math.min(Math.max(Math.trunc(Number(req.body.maxRounds)) || 8, 1), 15)
      const { cliSessionId, firstQuestion } = await startDeepdive(ai, { resume: v.structured, projectName })
      const sessionId = createDeepdiveSession(db, { resumeVersionId: v.id, projectName, cliSessionId, maxRounds })
      createDeepdiveTurn(db, { sessionId, turnIndex: 0, question: firstQuestion })
      res.json({ sessionId, turnIndex: 0, question: firstQuestion })
    } catch (e) { next(e) }
  })

  r.post('/deepdives/:id/answer', async (req, res, next) => {
    try {
      const session = getDeepdiveSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '深挖会话不存在')
      if (session.status !== 'active') throw new HttpError(409, '深挖已结束')
      const turns = listDeepdiveTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的问题')
      const answer = String(req.body.answer ?? '')
      const v = getVersion(db, session.resumeVersionId)!
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await answerDeepdive(ai, {
        cliSessionId: session.cliSessionId, resume: v.structured, projectName: session.projectName,
        history, question: pending.question, answer, turnIndex: pending.turnIndex, maxRounds: session.maxRounds,
      })
      const score = step.feedback?.total ?? 0
      const feedback = step.feedback ?? { scores: { techDepth:0, implementationClarity:0, architectureAwareness:0, metricsAwareness:0, expression:0 }, total: 0, strengths: [], vague: [], missingDetails: [], followUps: [], betterAnswer: '' }
      answerDeepdiveTurn(db, pending.id, { answer, score, feedback })

      const reachedCap = pending.turnIndex + 1 >= session.maxRounds
      const shouldContinue = step.nextQuestion && !reachedCap
      if (shouldContinue) {
        createDeepdiveTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.nextQuestion! })
        return res.json({ feedback: step.feedback, nextQuestion: step.nextQuestion, turnIndex: pending.turnIndex + 1, finished: false })
      }
      const allTurns = listDeepdiveTurns(db, session.id).filter(t => t.answer !== null)
        .map(t => ({ question: t.question, answer: t.answer!, score: t.score ?? 0 }))
      const map = await generateMap(ai, { resume: v.structured, projectName: session.projectName, turns: allTurns })
      finishDeepdiveSession(db, session.id, map)
      res.json({ feedback: step.feedback, nextQuestion: null, turnIndex: pending.turnIndex, finished: true, map })
    } catch (e) { next(e) }
  })

  r.get('/deepdives/:id', (req, res, next) => {
    try {
      const session = getDeepdiveSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '深挖会话不存在')
      res.json({ session, turns: listDeepdiveTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
```

- [ ] **Step 4: 挂载 index.ts** — `import { deepdiveRouter } from './routes/deepdive'` + `app.use('/api', deepdiveRouter(db, ai))`

- [ ] **Step 5: 运行确认通过 + 全量 + tsc** — `npm test`(全绿)+ `npx tsc --noEmit -p apps/server/tsconfig.json`(0)

- [ ] **Step 6: 提交**
```bash
git add apps/server/src/routes/deepdive.ts apps/server/src/index.ts apps/server/src/routes/resumes.test.ts
git commit -m "feat(server): /api/deepdives 路由 — 深挖状态机 + 轮次硬停 + 知识地图"
```

---

### Task 7: 前端 api + 项目深挖页

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/pages/ProjectDeepdive.tsx`
- Test: `apps/web/src/pages/ProjectDeepdive.test.tsx`

**Interfaces:**
- Consumes: `/api/deepdives*`;类型 `DeepdiveFeedback`/`ProjectMap`(shared);`StructuredResume`(取 projects);`Card`/`Button`(ui)
- Produces:
  - `api.startDeepdive(input:{versionId:number; projectName:string; maxRounds?:number}): Promise<{sessionId:number; turnIndex:number; question:string}>`
  - `api.answerDeepdive(sessionId:number, answer:string): Promise<{feedback:DeepdiveFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; map?:ProjectMap}>`
  - `api.getDeepdive(sessionId:number): Promise<{session:any; turns:any[]}>`
  - `api.listDeepdives(): Promise<{id:number; projectName:string; status:'active'|'finished'; total:number|null; createdAt:string}[]>`
  - `<ProjectDeepdive versionId:number; structured:StructuredResume; onBack:()=>void />` — 选项目(从 structured.projects;空则空状态)+ 历史列表 → 开始 → 聊天式追问 + 5维评分卡 → 结束显示知识地图 + 本次薄弱问题(is_weak turns)

- [ ] **Step 1: 改 api**

`apps/web/src/api.ts`(import 加 `DeepdiveFeedback, ProjectMap`;追加方法):
```ts
import type { /* 现有... */ DeepdiveFeedback, ProjectMap } from '@aios/shared'
  startDeepdive: (input: { versionId:number; projectName:string; maxRounds?:number }) =>
    j<{sessionId:number; turnIndex:number; question:string}>('/api/deepdives', json(input)),
  answerDeepdive: (sessionId:number, answer:string) =>
    j<{feedback:DeepdiveFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; map?:ProjectMap}>(
      `/api/deepdives/${sessionId}/answer`, json({ answer })),
  getDeepdive: (sessionId:number) => j<{session:any; turns:any[]}>(`/api/deepdives/${sessionId}`),
  listDeepdives: () => j<{id:number; projectName:string; status:'active'|'finished'; total:number|null; createdAt:string}[]>('/api/deepdives'),
```

- [ ] **Step 2: 写失败测试**

`apps/web/src/pages/ProjectDeepdive.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ProjectDeepdive } from './ProjectDeepdive'
import { api } from '../api'

const structured = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
  projects:[{name:'体验生判',role:'负责人',period:'',stack:['RAG'],bullets:['LLM 打分'],metrics:[]}], skills:[],awards:[] } as any
const fb = { scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'listDeepdives').mockResolvedValue([] as any)
  vi.spyOn(api, 'startDeepdive').mockResolvedValue({ sessionId:1, turnIndex:0, question:'Prompt 如何设计?' } as any)
  vi.spyOn(api, 'answerDeepdive').mockResolvedValue({
    feedback: fb, nextQuestion:null, turnIndex:0, finished:true,
    map:{ projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c', coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] },
  } as any)
})

describe('ProjectDeepdive', () => {
  it('selects a project, answers, and shows the knowledge map', async () => {
    const { getByText, getByLabelText, findByText } = render(<ProjectDeepdive versionId={2} structured={structured} onBack={()=>{}} />)
    fireEvent.click(getByText(/体验生判/))            // 选项目开始
    await findByText(/Prompt 如何设计/)
    fireEvent.change(getByLabelText(/你的回答/), { target: { value:'我的回答' } })
    fireEvent.click(getByText(/提交/))
    await findByText(/项目知识地图/)
    expect(getByText(/阈值/)).toBeTruthy()             // 盲区/薄弱问题渲染
  })
  it('shows empty state when resume has no projects', async () => {
    const { findByText } = render(<ProjectDeepdive versionId={2} structured={{ ...structured, projects: [] }} onBack={()=>{}} />)
    await findByText(/未检测到项目/)
  })
})
```

- [ ] **Step 3: 运行确认失败** — `npm test -- ProjectDeepdive` → FAIL

- [ ] **Step 4: 实现 ProjectDeepdive.tsx**

（聊天式复用模块四模式;5 维评分展示为条形;结束展示知识地图分区卡片 + 本次薄弱问题。完整实现如下。）
```tsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Card, Button } from '../components/ui'
import { ChevronLeft, Loader2 } from 'lucide-react'
import type { StructuredResume, DeepdiveFeedback, ProjectMap } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string; feedback?: DeepdiveFeedback }
const DIM_LABEL: Record<keyof DeepdiveFeedback['scores'], string> = {
  techDepth:'技术深度', implementationClarity:'实现清晰度', architectureAwareness:'架构工程', metricsAwareness:'指标评估', expression:'表达质量',
}

export function ProjectDeepdive({ versionId, structured, onBack }: { versionId: number; structured: StructuredResume; onBack: () => void }) {
  const [phase, setPhase] = useState<'select'|'chat'|'done'>('select')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [map, setMap] = useState<ProjectMap | null>(null)
  const [weakTurns, setWeakTurns] = useState<{ question:string; total:number; betterAnswer:string }[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'chat') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [msgs, busy, phase])

  async function start(projectName: string) {
    setBusy(true); setError('')
    try {
      const r = await api.startDeepdive({ versionId, projectName })
      setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.question }]); setPhase('chat')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function submit() {
    if (!sessionId || !input.trim()) return
    const mine = input
    setMsgs(m => [...m, { role:'me', text: mine }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.answerDeepdive(sessionId, mine)
      setMsgs(m => { const c = [...m]; for (let i=c.length-1;i>=0;i--) if (c[i].role==='me'){ c[i]={...c[i],feedback:r.feedback??undefined}; break } return c })
      if (r.finished && r.map) {
        setMap(r.map)
        const got = await api.getDeepdive(sessionId)
        setWeakTurns(got.turns.filter((t:any)=>t.isWeak).map((t:any)=>({ question:t.question, total:t.score, betterAnswer:t.feedback?.betterAnswer ?? '' })))
        setPhase('done')
      } else if (r.nextQuestion) setMsgs(m => [...m, { role:'ai', text: r.nextQuestion! }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); if(!busy) submit() } }

  const Back = () => (
    <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={15} /> 返回</button>
  )

  if (phase === 'select') {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <div><h1 className="text-xl font-semibold tracking-tight">项目深挖</h1>
          <p className="mt-1 text-sm text-muted">选一个简历项目,AI 面试官会围绕它连续追问技术细节并打分,最后生成项目知识地图。</p></div>
        {structured.projects.length === 0 ? (
          <Card className="p-5 text-sm text-muted">未检测到项目,请回「简历大师」补充并确认项目后再来。</Card>
        ) : (
          <div className="space-y-2">
            {structured.projects.map((p, i) => (
              <button key={i} onClick={() => start(p.name)} disabled={busy}
                className="flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2">
                <div><span className="text-sm font-medium text-text">{p.name}</span>
                  <span className="ml-2 text-xs text-faint">{p.role}{p.stack.length ? ` · ${p.stack.slice(0,3).join('/')}` : ''}</span></div>
                {busy ? <Loader2 size={15} className="animate-spin text-muted" /> : <span className="text-xs text-accent">深挖 →</span>}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  if (phase === 'done' && map) {
    const Section = ({ t, children }: { t:string; children:React.ReactNode }) => (
      <div className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{t}</h4>{children}</div>
    )
    const List = ({ items }: { items:string[] }) => items.length
      ? <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{items.map((x,i)=><li key={i}>{x}</li>)}</ul>
      : <p className="text-sm text-faint">—</p>
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <h1 className="text-xl font-semibold tracking-tight">项目知识地图 · {map.projectName}</h1>
        <Card className="space-y-4 p-5">
          <Section t="项目背景"><p className="text-sm text-muted">{map.background}</p></Section>
          <Section t="业务目标"><p className="text-sm text-muted">{map.businessGoal}</p></Section>
          <Section t="技术方案"><p className="text-sm text-muted">{map.techApproach}</p></Section>
          <Section t="个人贡献"><p className="text-sm text-muted">{map.personalContribution}</p></Section>
          <Section t="核心难点"><List items={map.coreChallenges} /></Section>
          <Section t="替代方案"><List items={map.alternatives} /></Section>
          <Section t="效果评估"><p className="text-sm text-muted">{map.evaluation}</p></Section>
          <Section t="风险与排查"><List items={map.risks} /></Section>
          <Section t="可优化方向"><List items={map.optimizations} /></Section>
          <Section t="面试高频追问"><List items={map.hotQuestions} /></Section>
          <Section t="暴露的盲区"><List items={map.blindSpots} /></Section>
        </Card>
        {weakTurns.length > 0 && (
          <Card className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-text">本次薄弱问题</h3>
            {weakTurns.map((w, i) => (
              <div key={i} className="rounded-btn border border-border bg-surface-2 p-3 text-sm">
                <p className="font-medium text-text">{w.question} <span className="text-xs text-danger">({w.total}/50)</span></p>
                {w.betterAnswer && <p className="mt-1 text-muted">更优答法:{w.betterAnswer}</p>}
              </div>
            ))}
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Back />
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-card px-4 py-2.5 text-sm ${m.role==='ai'?'bg-surface-2 text-text':'bg-accent text-white'}`}>{m.text}</div>
            {m.feedback && (
              <div className="mt-1 w-full max-w-[85%] space-y-2 rounded-card border border-border bg-surface p-3 text-xs">
                <div className="flex items-center justify-between"><span className="font-medium text-text">本轮 {m.feedback.total}/50</span></div>
                {(Object.keys(DIM_LABEL) as (keyof DeepdiveFeedback['scores'])[]).map(k => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-muted">{DIM_LABEL[k]}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: `${m.feedback!.scores[k]*10}%` }} /></div>
                    <span className="w-6 text-right text-muted">{m.feedback!.scores[k]}</span>
                  </div>
                ))}
                {m.feedback.vague.length>0 && <p className="text-muted">空泛:{m.feedback.vague.join('；')}</p>}
                {m.feedback.betterAnswer && <p className="text-muted">更优答法:{m.feedback.betterAnswer}</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 面试官思考中…</div>}
        <div ref={endRef} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <textarea aria-label="你的回答" rows={3} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}
          className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="回答技术追问…（Enter 提交，Shift+Enter 换行）" />
        <Button variant="primary" onClick={submit} disabled={busy}>提交</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 运行确认通过** — `npm test -- ProjectDeepdive` → PASS

- [ ] **Step 6: 提交**
```bash
git add apps/web/src/api.ts apps/web/src/pages/ProjectDeepdive.tsx apps/web/src/pages/ProjectDeepdive.test.tsx
git commit -m "feat(web): 项目深挖页(选项目/追问/5维评分/知识地图/薄弱问题)"
```

---

### Task 8: 导航接入 + App 流转 + 端到端冒烟

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: 现有回归(App 无单测,靠 tsc + build + 既有测试)

**Interfaces:**
- Consumes: `ProjectDeepdive`(Task 7)
- Produces: 顶部导航加「项目深挖」(lucide `Layers` 图标);选中后,若有 `confirmedVersion` 且 `confirmedStructured` 则渲染 `<ProjectDeepdive versionId structured onBack>`,否则提示先去简历大师确认简历。

- [ ] **Step 1: 改 App.tsx**

view 联合类型加 `'deepdive'`;navItems 加 `{ id:'deepdive', label:'项目深挖', icon: Layers }`(`import { Layers } from 'lucide-react'`);import `ProjectDeepdive`;主区:
```tsx
{view === 'deepdive'
  ? (confirmedVersion !== null && confirmedStructured !== null
      ? <ProjectDeepdive versionId={confirmedVersion} structured={confirmedStructured} onBack={() => setView('resume')} />
      : <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          请先到「简历大师」上传并确认一份简历,再进行项目深挖。</div>)
  : /* 其余现有分支 */ }
```
> `confirmedStructured` 是 App 已有状态(简历确认后经 onDraft 置位)。deepdive 视图复用它作为项目来源。

- [ ] **Step 2: 全量回归 + 类型检查 + 构建** — `npm test`(全绿)→ `npx tsc --noEmit -p apps/web/tsconfig.json`(0)→ `npm run build --workspace=apps/web`(成功)

- [ ] **Step 3: 提交**
```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): 导航接入项目深挖 + App 流转"
```

- [ ] **Step 4: 端到端冒烟(真机,控制者执行,不交子代理)**

重启后端;用 CSQ(已 confirmed)的一个项目经 API 跑一整场:`POST /api/deepdives {versionId, projectName}` → 多次 `POST /api/deepdives/:id/answer {answer}`(含一次答"不清楚"验证评分不塌 + betterAnswer 给出答法)直到 `finished:true` → `GET /api/deepdives/:id` 看知识地图 + is_weak。验证:追问锚定简历项目、连续深挖、5 维评分、达上限硬停出地图、盲区/薄弱问题正确。记录耗时与结论到进度账本。

---

## 实施顺序与依赖

Task 1(shared)→ 2(数据层)→ 3(服务 start)→ 4(answer+降级)→ 5(map)→ 6(路由状态机+硬停)→ 7(前端 api+页面)→ 8(导航+冒烟)。严格按序;每个 Task 自带测试与提交。Task 8 真机冒烟由控制者完成。


