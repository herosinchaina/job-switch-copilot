# 模块一实现计划:LeetCode Hot100 学习(最小闭环)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整 Hot100 题库(元数据)+ AI 多轮引导式讲题(不直接给答案、不评分)+ 三态进度跟踪,跑通「浏览 → 引导学懂 → 标记掌握 → 看进度」闭环。

**Architecture:** 沿用 monorepo。种子题库 `hot100.json` 启动时幂等导入 SQLite;引导讲题复用模块四已有的 AiProvider 会话能力(startSession/continueSession/completeJsonSession + 失败降级);进度三态存 lc_progress;前端题库浏览页 + 引导聊天页(复用模块四 UI 模式)。纯新增,完全向后兼容。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind(web);Vitest;AI 经 ClaudeCliProvider 会话适配层。

## Global Constraints

- AI 调用**只**经 `AiProvider`;引导每轮 AI 输出经 zod 校验(`GuideStepSchema`),失败重试一次再降级报错(沿用 `completeJsonSession`/`completeJson`)。
- 引导**多轮上下文优先 CLI 会话**,调用失败**必须降级**为无状态拼 history(复用模块四模式),不得因会话丢失而崩。
- 引导**不评分**(学习非考试),只记录引导 Q&A。引导 prompt **绝不输出完整答案代码**,循序渐进(考点→暴力→为什么慢→优化→模板→复杂度→易错点)。
- **版权**:只用 `hot100.json` 的元数据 + keyIdea,**不存/不复制 LeetCode 官方题面正文**;AI 引导是即时教学内容。
- SQLite **全程参数化**;种子导入用 `INSERT OR IGNORE`(幂等);后端只绑 127.0.0.1;前端**不用** `dangerouslySetInnerHTML`,纯文本渲染。
- 简历/面试无依赖;本模块独立。
- TypeScript 严格模式;**不破坏现有 82 个测试**;纯新增。
- node:sqlite:`DatabaseSync`;`db.exec('CREATE TABLE IF NOT EXISTS ...')`;`prepare().run/get/all`;无 `.pragma()`。
- 进度三态:`new | learning | mastered`;无 lc_progress 记录即视为 `new`。
- 前端组件测试首行 `// @vitest-environment jsdom`;沿用根 vitest.config.ts。

## 文件结构

```
packages/shared/src/
  leetcode.ts              # 新增:Difficulty/ProgressStatus/LcProblemSchema/GuideStepSchema
  index.ts                 # 修改:导出 leetcode
apps/server/src/
  data/hot100.json         # 已存在(种子,100 题)
  db/connection.ts         # 修改:建 lc_problems/lc_progress/lc_guide_sessions/lc_guide_turns
  db/seed.ts               # 新增:seedProblems(幂等导入)
  db/repo.ts               # 修改:题库/进度/引导会话 CRUD;exportAll 加表
  prompts/guide-system.txt # 新增:引导老师人设
  prompts/guide-step.txt   # 新增:引导推进 JSON 约束
  services/guide.ts        # 新增:startGuide / continueGuide(含降级)
  routes/leetcode.ts       # 新增:/api/lc/*
  index.ts                 # 修改:openDb 后 seedProblems;挂载 leetcodeRouter
apps/web/src/
  api.ts                   # 修改:lc 六方法
  pages/Leetcode.tsx       # 新增:题库浏览 + 进度
  pages/LcGuide.tsx        # 新增:引导讲题聊天页
  App.tsx                  # 修改:导航加「算法学习」+ 流转
```

实施顺序:1(shared)→ 2(数据层+种子)→ 3(引导服务)→ 4(路由)→ 5(前端 api+题库页)→ 6(引导页+导航+冒烟)。

---

### Task 1: 共享数据模型(leetcode)

**Files:**
- Create: `packages/shared/src/leetcode.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/leetcode.test.ts`

**Interfaces:**
- Produces:
  - `DIFFICULTIES = ['easy','medium','hard'] as const`;`Difficulty`
  - `PROGRESS_STATUSES = ['new','learning','mastered'] as const`;`ProgressStatus`
  - `LcProblemSchema` → `{ leetcodeId:number, title:string, difficulty:Difficulty, topic:string, keyIdea:string, url:string }`;`LcProblem`
  - `GuideStepSchema` → `{ guidance:string, done:boolean }`;`GuideStep`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/leetcode.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { LcProblemSchema, GuideStepSchema, DIFFICULTIES, PROGRESS_STATUSES } from './leetcode'

describe('leetcode schemas', () => {
  it('accepts a valid problem', () => {
    const p = { leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'HashMap 存补数', url:'https://leetcode.cn/problems/two-sum/' }
    expect(LcProblemSchema.parse(p)).toEqual(p)
  })
  it('rejects bad difficulty', () => {
    expect(() => LcProblemSchema.parse({ leetcodeId:1, title:'x', difficulty:'eazy', topic:'哈希', keyIdea:'k', url:'u' })).toThrow()
  })
  it('accepts a guide step', () => {
    expect(GuideStepSchema.parse({ guidance:'先想想考点', done:false })).toEqual({ guidance:'先想想考点', done:false })
  })
  it('exposes enums', () => {
    expect(DIFFICULTIES).toEqual(['easy','medium','hard'])
    expect(PROGRESS_STATUSES).toEqual(['new','learning','mastered'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- leetcode`
Expected: FAIL — 无法导入 `./leetcode`

- [ ] **Step 3: 实现**

`packages/shared/src/leetcode.ts`:
```ts
import { z } from 'zod'
export const DIFFICULTIES = ['easy','medium','hard'] as const
export type Difficulty = typeof DIFFICULTIES[number]
export const PROGRESS_STATUSES = ['new','learning','mastered'] as const
export type ProgressStatus = typeof PROGRESS_STATUSES[number]

export const LcProblemSchema = z.object({
  leetcodeId: z.number(),
  title: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  topic: z.string(),
  keyIdea: z.string(),
  url: z.string(),
})
export type LcProblem = z.infer<typeof LcProblemSchema>

export const GuideStepSchema = z.object({ guidance: z.string(), done: z.boolean() })
export type GuideStep = z.infer<typeof GuideStepSchema>
```
`packages/shared/src/index.ts` 增加:
```ts
export * from './leetcode'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- leetcode`
Expected: PASS(4 passed)

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全部 PASS(现有 82 仍绿)
```bash
git add packages/shared/src/leetcode.ts packages/shared/src/leetcode.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): LeetCode 题目/引导步骤数据模型"
```

---

### Task 2: 数据层(表 + 种子导入 + repo)

**Files:**
- Modify: `apps/server/src/db/connection.ts`
- Create: `apps/server/src/db/seed.ts`
- Modify: `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加)

**Interfaces:**
- Consumes: `LcProblem`/`ProgressStatus`(Task 1), 现有 `openDb`
- Produces:
  - `seedProblems(db): void`(读 `../data/hot100.json`,`INSERT OR IGNORE`,幂等)
  - `listProblems(db): Array<LcProblem & { status:ProgressStatus }>`(LEFT JOIN,无记录=new)
  - `getProblem(db, leetcodeId): (LcProblem & {status}) | undefined`
  - `setProgress(db, leetcodeId, status:ProgressStatus): void`(UPSERT)
  - `progressSummary(db): { total:number, mastered:number, learning:number, byTopic: Array<{topic:string,total:number,mastered:number}> }`
  - 引导:`createGuideSession(db,{leetcodeId,cliSessionId}):number`、`getGuideSession(db,id)`、`finishGuideSession(db,id)`、`createGuideTurn(db,{sessionId,turnIndex,question}):number`、`answerGuideTurn(db,turnId,answer)`、`listGuideTurns(db,sessionId)`
  - `exportAll` 增加 lcProgress/lcGuideSessions/lcGuideTurns

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { seedProblems, listProblems, getProblem, setProgress, progressSummary,
  createGuideSession, getGuideSession, finishGuideSession, createGuideTurn, answerGuideTurn, listGuideTurns } from './repo'

describe('leetcode repo', () => {
  it('seeds 100 problems idempotently', () => {
    const db = openDb(':memory:')
    seedProblems(db); seedProblems(db)               // 跑两次
    expect(listProblems(db).length).toBe(100)
    expect(getProblem(db, 1)!.title).toBe('两数之和')
    expect(getProblem(db, 1)!.status).toBe('new')    // 无进度记录默认 new
  })
  it('sets progress and summarizes', () => {
    const db = openDb(':memory:'); seedProblems(db)
    setProgress(db, 1, 'mastered'); setProgress(db, 1, 'mastered')  // UPSERT
    expect(getProblem(db, 1)!.status).toBe('mastered')
    const s = progressSummary(db)
    expect(s.total).toBe(100); expect(s.mastered).toBe(1)
    expect(s.byTopic.find(t => t.topic === '哈希')!.total).toBeGreaterThan(0)
  })
  it('round-trips a guide session + turns', () => {
    const db = openDb(':memory:'); seedProblems(db)
    const sid = createGuideSession(db, { leetcodeId:1, cliSessionId:'uuid-1' })
    expect(getGuideSession(db, sid)!.status).toBe('active')
    const t = createGuideTurn(db, { sessionId:sid, turnIndex:0, question:'考点是什么?' })
    answerGuideTurn(db, t, '哈希查找')
    expect(listGuideTurns(db, sid)[0].answer).toBe('哈希查找')
    finishGuideSession(db, sid)
    expect(getGuideSession(db, sid)!.status).toBe('finished')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- repo`
Expected: FAIL — seedProblems 等未定义

- [ ] **Step 3: 迁移(connection.ts)**

`migrate()` SQL 追加:
```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS lc_problems (
      leetcode_id INTEGER PRIMARY KEY, title TEXT NOT NULL, difficulty TEXT NOT NULL,
      topic TEXT NOT NULL, key_idea TEXT NOT NULL, url TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lc_progress (
      leetcode_id INTEGER PRIMARY KEY REFERENCES lc_problems(leetcode_id),
      status TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS lc_guide_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, leetcode_id INTEGER NOT NULL REFERENCES lc_problems(leetcode_id),
      cli_session_id TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS lc_guide_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES lc_guide_sessions(id),
      turn_index INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT, created_at TEXT DEFAULT (datetime('now')));
  `)
```

- [ ] **Step 4: 种子导入(seed.ts)**

`apps/server/src/db/seed.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { LcProblemSchema, type LcProblem } from '@aios/shared'
import { z } from 'zod'

export function seedProblems(db: DatabaseSync): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../data/hot100.json')
  const problems = z.array(LcProblemSchema).parse(JSON.parse(readFileSync(file, 'utf8')))
  const stmt = db.prepare('INSERT OR IGNORE INTO lc_problems (leetcode_id,title,difficulty,topic,key_idea,url) VALUES (?,?,?,?,?,?)')
  for (const p of problems as LcProblem[]) stmt.run(p.leetcodeId, p.title, p.difficulty, p.topic, p.keyIdea, p.url)
}
```

- [ ] **Step 5: repo.ts 新增**

```ts
import { LcProblemSchema, type LcProblem, type ProgressStatus } from '@aios/shared'

type ProblemWithStatus = LcProblem & { status: ProgressStatus }
function rowToProblem(r: any): ProblemWithStatus {
  return { leetcodeId: r.leetcode_id, title: r.title, difficulty: r.difficulty, topic: r.topic,
    keyIdea: r.key_idea, url: r.url, status: (r.status ?? 'new') as ProgressStatus }
}
export function listProblems(db: DatabaseSync): ProblemWithStatus[] {
  const rows = db.prepare(`SELECT p.*, pr.status FROM lc_problems p
    LEFT JOIN lc_progress pr ON pr.leetcode_id = p.leetcode_id ORDER BY p.leetcode_id`).all() as any[]
  return rows.map(rowToProblem)
}
export function getProblem(db: DatabaseSync, leetcodeId: number): ProblemWithStatus | undefined {
  const r = db.prepare(`SELECT p.*, pr.status FROM lc_problems p
    LEFT JOIN lc_progress pr ON pr.leetcode_id = p.leetcode_id WHERE p.leetcode_id=?`).get(leetcodeId) as any
  return r ? rowToProblem(r) : undefined
}
export function setProgress(db: DatabaseSync, leetcodeId: number, status: ProgressStatus): void {
  db.prepare(`INSERT INTO lc_progress (leetcode_id,status,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(leetcode_id) DO UPDATE SET status=excluded.status, updated_at=datetime('now')`).run(leetcodeId, status)
}
export function progressSummary(db: DatabaseSync) {
  const total = (db.prepare('SELECT COUNT(*) c FROM lc_problems').get() as any).c
  const mastered = (db.prepare("SELECT COUNT(*) c FROM lc_progress WHERE status='mastered'").get() as any).c
  const learning = (db.prepare("SELECT COUNT(*) c FROM lc_progress WHERE status='learning'").get() as any).c
  const byTopic = db.prepare(`SELECT p.topic,
      COUNT(*) total,
      SUM(CASE WHEN pr.status='mastered' THEN 1 ELSE 0 END) mastered
    FROM lc_problems p LEFT JOIN lc_progress pr ON pr.leetcode_id=p.leetcode_id
    GROUP BY p.topic`).all() as any[]
  return { total, mastered, learning, byTopic: byTopic.map(t => ({ topic: t.topic, total: t.total, mastered: Number(t.mastered) })) }
}
export function createGuideSession(db: DatabaseSync, s: { leetcodeId:number; cliSessionId:string|null }): number {
  return Number(db.prepare('INSERT INTO lc_guide_sessions (leetcode_id,cli_session_id) VALUES (?,?)')
    .run(s.leetcodeId, s.cliSessionId).lastInsertRowid)
}
export function getGuideSession(db: DatabaseSync, id: number) {
  const r = db.prepare('SELECT * FROM lc_guide_sessions WHERE id=?').get(id) as any
  if (!r) return undefined
  return { id: r.id, leetcodeId: r.leetcode_id, cliSessionId: r.cli_session_id ?? null, status: r.status as 'active'|'finished' }
}
export function finishGuideSession(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE lc_guide_sessions SET status='finished' WHERE id=?").run(id)
}
export function createGuideTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO lc_guide_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerGuideTurn(db: DatabaseSync, turnId: number, answer: string): void {
  db.prepare('UPDATE lc_guide_turns SET answer=? WHERE id=?').run(answer, turnId)
}
export function listGuideTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM lc_guide_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null }))
}
```
`exportAll` 增加:`lcProgress: db.prepare('SELECT * FROM lc_progress').all(), lcGuideSessions: db.prepare('SELECT * FROM lc_guide_sessions').all(), lcGuideTurns: db.prepare('SELECT * FROM lc_guide_turns').all()`。
> 注意:`getProblem` 返回的 difficulty 直接取自 DB 文本(种子导入时已是 easy/medium/hard),不必再过 schema。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- repo`
Expected: PASS(3 个新用例)

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/db/connection.ts apps/server/src/db/seed.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): LeetCode 题库表 + 种子幂等导入 + 进度/引导 repo"
```

---

### Task 3: 引导服务(startGuide + continueGuide + 降级)

**Files:**
- Create: `apps/server/src/prompts/guide-system.txt`, `apps/server/src/prompts/guide-step.txt`
- Create: `apps/server/src/services/guide.ts`
- Test: `apps/server/src/services/guide.test.ts`

**Interfaces:**
- Consumes: `AiProvider`(会话方法,模块四已加), `completeJsonSession`/`completeJson`(claude-cli), `GuideStepSchema`/`LcProblem`(shared)
- Produces:
  - `startGuide(ai, problem: LcProblem): Promise<{ cliSessionId: string; firstGuidance: string }>`
  - `continueGuide(ai, ctx): Promise<GuideStep>`,ctx:`{ cliSessionId: string | null; problem: LcProblem; history: Array<{ question: string; answer: string }>; question: string; answer: string }`
    - 优先 `completeJsonSession(ai, GuideStepSchema, cliSessionId, {system, prompt})`;失败或无会话 → 降级 `completeJson(ai, GuideStepSchema, {system, prompt+history})`

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/guide.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startGuide, continueGuide } from './guide'

const problem = { leetcodeId:1, title:'两数之和', difficulty:'easy' as const, topic:'哈希', keyIdea:'HashMap 存补数', url:'u' }
const stepOut = JSON.stringify({ guidance:'很好,那你想想暴力解的复杂度?', done:false })

describe('guide service', () => {
  it('startGuide opens a session and returns first guidance', async () => {
    const ai: AiProvider = {
      async complete(){ return '这题考点是什么?先别看答案,想想。' },
      async *stream(){ yield '' },
      startSession(){ return 'g-sess' },
      async continueSession(){ return '这题考点是什么?先别看答案,想想。' },
    }
    const r = await startGuide(ai, problem)
    expect(r.cliSessionId).toBe('g-sess')
    expect(r.firstGuidance).toContain('考点')
  })
  it('continueGuide uses the session', async () => {
    let used = false
    const ai: AiProvider = {
      async complete(){ return stepOut }, async *stream(){ yield stepOut },
      startSession(){ return 's' }, async continueSession(){ used = true; return stepOut },
    }
    const step = await continueGuide(ai, { cliSessionId:'g', problem, history:[{question:'q',answer:'a'}], question:'q', answer:'a' })
    expect(used).toBe(true); expect(step.done).toBe(false)
  })
  it('continueGuide falls back to stateless when session throws', async () => {
    let usedComplete = false
    const ai: AiProvider = {
      async complete(){ usedComplete = true; return stepOut }, async *stream(){ yield stepOut },
      startSession(){ return 's' }, async continueSession(){ throw new Error('resume failed') },
    }
    const step = await continueGuide(ai, { cliSessionId:'g', problem, history:[{question:'q',answer:'a'}], question:'q', answer:'a' })
    expect(usedComplete).toBe(true); expect(step.guidance).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/guide`
Expected: FAIL — 无法导入 `./guide`

- [ ] **Step 3: 写 prompts + 实现**

`apps/server/src/prompts/guide-system.txt`:
```
你是一位耐心的算法老师,正在用苏格拉底式方法引导学生学懂一道 LeetCode 题。铁律:
- 绝不直接给出完整答案代码;通过提问一步步引导学生自己想出来。
- 引导顺序:这题考什么 → 暴力解怎么写 → 为什么会超时/不够好 → 如何想到优化 → 关键模板/数据结构 → 时间空间复杂度 → 常见易错点。
- 每次只推进一小步,结合学生上一步的回答给简短点拨,再抛出下一个引导问题。
- 学生答错或卡住时给提示,不替他写答案。
- 语气鼓励、具体。
```
`apps/server/src/prompts/guide-step.txt`:
```
基于学生刚才的回答,给出本步的引导(点拨 + 下一个引导问题)。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. guidance:对学生回答的简短点拨 + 下一步引导问题(绝不给完整答案代码)。
3. done:当七个引导环节(考点/暴力/为什么慢/优化/模板/复杂度/易错点)已基本走完、学生已掌握时设为 true,否则 false。
4. JSON 结构:{ "guidance":"", "done":false }
```
`apps/server/src/services/guide.ts`:
```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/guide`
Expected: PASS(3 passed)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/guide-system.txt apps/server/src/prompts/guide-step.txt apps/server/src/services/guide.ts apps/server/src/services/guide.test.ts
git commit -m "feat(server): 引导式讲题服务 startGuide/continueGuide(会话+降级,不给答案)"
```

---

### Task 4: 路由(/api/lc/*)+ 启动种子

**Files:**
- Create: `apps/server/src/routes/leetcode.ts`
- Modify: `apps/server/src/index.ts`(openDb 后 seedProblems;挂载 leetcodeRouter)
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`(`describe('leetcode routes', ...)`)

**Interfaces:**
- Consumes: `startGuide`/`continueGuide`(Task 3), repo 函数(Task 2), `seedProblems`(Task 2), `PROGRESS_STATUSES`(shared), `HttpError`
- Produces:
  - `leetcodeRouter(db, ai): Router`
  - `GET /api/lc/problems` → `(LcProblem & {status})[]`
  - `GET /api/lc/summary` → 进度统计
  - `PUT /api/lc/problems/:id/progress`(body `{status}`)→ 非法 status 400;题不存在 404;否则 setProgress → `{ ok:true }`
  - `POST /api/lc/guides`(body `{leetcodeId}`)→ 题不存在 404;startGuide → 建 session+turn0 → `{ sessionId, guidance }`
  - `POST /api/lc/guides/:id/step`(body `{answer}`)→ session 不存在 404,非 active 409,无待答 turn 409 → continueGuide → 回填+建下一 turn(done 则 finishGuideSession 不建新 turn)→ `{ guidance, done }`
  - `GET /api/lc/guides/:id` → `{ session, turns }`
- `createApp` 须在构造时确保题库已 seed(见 Step 4)

- [ ] **Step 1: 写失败测试(追加)**

```ts
// 引导用会话感知 fake(复用现有 import:request/openDb/createApp/AiProvider)
function lcAi() {
  const firstG = '这题考点是什么?先想想。'
  const step = JSON.stringify({ guidance:'不错,继续想优化', done:false })
  const stepDone = JSON.stringify({ guidance:'你已经掌握了,真棒', done:true })
  let n = 0
  const handle = (prompt: string) => {
    if (prompt.includes('开始引导我学这道题')) return firstG
    n++; return n >= 2 ? stepDone : step
  }
  return {
    async complete(o:any){ return handle(o.prompt) },
    async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'g-sess' },
    async continueSession(_s:string, o:any){ return handle(o.prompt) },
  } as any
}

describe('leetcode routes', () => {
  it('lists seeded problems and summary', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    const list = await request(app).get('/api/lc/problems')
    expect(list.status).toBe(200); expect(list.body.length).toBe(100)
    expect(list.body[0].status).toBe('new')
    const sum = await request(app).get('/api/lc/summary')
    expect(sum.body.total).toBe(100)
  })
  it('sets progress (400 on bad status, 404 unknown id)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    expect((await request(app).put('/api/lc/problems/1/progress').send({ status:'mastered' })).status).toBe(200)
    expect((await request(app).put('/api/lc/problems/1/progress').send({ status:'wat' })).status).toBe(400)
    expect((await request(app).put('/api/lc/problems/99999/progress').send({ status:'mastered' })).status).toBe(404)
    expect((await request(app).get('/api/lc/summary')).body.mastered).toBe(1)
  })
  it('runs a guide session to done', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    const start = await request(app).post('/api/lc/guides').send({ leetcodeId:1 })
    expect(start.status).toBe(200); expect(start.body.guidance).toBeTruthy()
    const sid = start.body.sessionId
    const s1 = await request(app).post(`/api/lc/guides/${sid}/step`).send({ answer:'用哈希表' })
    expect(s1.body.done).toBe(false)
    const s2 = await request(app).post(`/api/lc/guides/${sid}/step`).send({ answer:'存补数,O(n)' })
    expect(s2.body.done).toBe(true)
    const got = await request(app).get(`/api/lc/guides/${sid}`)
    expect(got.body.session.status).toBe('finished')
  })
  it('404 guide on unknown problem', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    expect((await request(app).post('/api/lc/guides').send({ leetcodeId:99999 })).status).toBe(404)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- resumes`
Expected: FAIL — /api/lc/* 404(未挂载;且 createApp 未 seed)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/leetcode.ts`:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { PROGRESS_STATUSES, type ProgressStatus } from '@aios/shared'
import { listProblems, getProblem, setProgress, progressSummary,
  createGuideSession, getGuideSession, finishGuideSession, createGuideTurn, answerGuideTurn, listGuideTurns } from '../db/repo'
import { startGuide, continueGuide } from '../services/guide'
import { HttpError } from '../middleware/error'

export function leetcodeRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.get('/lc/problems', (_req, res) => res.json(listProblems(db)))
  r.get('/lc/summary', (_req, res) => res.json(progressSummary(db)))

  r.put('/lc/problems/:id/progress', (req, res, next) => {
    try {
      const status = req.body.status as ProgressStatus
      if (!PROGRESS_STATUSES.includes(status)) throw new HttpError(400, 'status 非法')
      if (!getProblem(db, Number(req.params.id))) throw new HttpError(404, '题目不存在')
      setProgress(db, Number(req.params.id), status)
      res.json({ ok: true })
    } catch (e) { next(e) }
  })

  r.post('/lc/guides', async (req, res, next) => {
    try {
      const problem = getProblem(db, Number(req.body.leetcodeId))
      if (!problem) throw new HttpError(404, '题目不存在')
      const { cliSessionId, firstGuidance } = await startGuide(ai, problem)
      const sessionId = createGuideSession(db, { leetcodeId: problem.leetcodeId, cliSessionId })
      createGuideTurn(db, { sessionId, turnIndex: 0, question: firstGuidance })
      res.json({ sessionId, guidance: firstGuidance })
    } catch (e) { next(e) }
  })

  r.post('/lc/guides/:id/step', async (req, res, next) => {
    try {
      const session = getGuideSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '引导会话不存在')
      if (session.status !== 'active') throw new HttpError(409, '引导已结束')
      const turns = listGuideTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的引导')
      const answer = String(req.body.answer ?? '')
      const problem = getProblem(db, session.leetcodeId)!
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await continueGuide(ai, { cliSessionId: session.cliSessionId, problem, history, question: pending.question, answer })
      answerGuideTurn(db, pending.id, answer)
      if (step.done) {
        finishGuideSession(db, session.id)
      } else {
        createGuideTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.guidance })
      }
      res.json({ guidance: step.guidance, done: step.done })
    } catch (e) { next(e) }
  })

  r.get('/lc/guides/:id', (req, res, next) => {
    try {
      const session = getGuideSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '引导会话不存在')
      res.json({ session, turns: listGuideTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
```

- [ ] **Step 4: index.ts 种子 + 挂载**

`createApp(db, ai)` 内,挂载路由前调用一次种子(幂等,保证题库就绪;`:memory:` 测试库也会被 seed):
```ts
import { seedProblems } from './db/seed'
import { leetcodeRouter } from './routes/leetcode'
// createApp 内,在 app.use 之前:
  seedProblems(db)
// 其他 app.use('/api', ...) 之间:
  app.use('/api', leetcodeRouter(db, ai))
```
> 把 seed 放在 `createApp` 里(而非仅 main()),这样测试的内存库也有题库,且生产启动也 seed。幂等(INSERT OR IGNORE)所以多次调用安全。

- [ ] **Step 5: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS(含 leetcode 路由用例)。再 `npx tsc --noEmit -p apps/server/tsconfig.json`(0 错)。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/routes/leetcode.ts apps/server/src/index.ts apps/server/src/routes/resumes.test.ts
git commit -m "feat(server): /api/lc 路由(题库/进度/引导)+ 启动幂等种子"
```

---

### Task 5: 前端 api + 题库浏览页

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/pages/Leetcode.tsx`
- Test: `apps/web/src/pages/Leetcode.test.tsx`

**Interfaces:**
- Consumes: `/api/lc/*`(Task 4);`LcProblem`/`ProgressStatus`(shared);`Card`/`Badge`(ui)
- Produces:
  - `api.lcProblems(): Promise<(LcProblem & {status:ProgressStatus})[]>`
  - `api.lcSummary(): Promise<{total:number;mastered:number;learning:number;byTopic:{topic:string;total:number;mastered:number}[]}>`
  - `api.setLcProgress(leetcodeId:number, status:ProgressStatus): Promise<{ok:true}>`
  - `<Leetcode onOpen={(leetcodeId:number)=>void} />` — 顶部完成率(mastered/total)+ 难度筛选;按 topic 分组列题(题号/标题/难度 badge/掌握度);点题 → onOpen

- [ ] **Step 1: 改 api**

`apps/web/src/api.ts`(import 加 `ProgressStatus`、`LcProblem`;追加方法):
```ts
import type { /* 现有... */ ProgressStatus, LcProblem } from '@aios/shared'
  lcProblems: () => j<(LcProblem & { status: ProgressStatus })[]>('/api/lc/problems'),
  lcSummary: () => j<{total:number;mastered:number;learning:number;byTopic:{topic:string;total:number;mastered:number}[]}>('/api/lc/summary'),
  setLcProgress: (leetcodeId:number, status:ProgressStatus) =>
    j<{ok:true}>(`/api/lc/problems/${leetcodeId}/progress`, { ...json({ status }), method:'PUT' }),
  startGuide: (leetcodeId:number) => j<{sessionId:number; guidance:string}>('/api/lc/guides', json({ leetcodeId })),
  stepGuide: (sessionId:number, answer:string) => j<{guidance:string; done:boolean}>(`/api/lc/guides/${sessionId}/step`, json({ answer })),
  getGuide: (sessionId:number) => j<{session:any; turns:any[]}>(`/api/lc/guides/${sessionId}`),
```
> startGuide/stepGuide/getGuide 在本任务加(Task 6 用)。

- [ ] **Step 2: 写失败测试**

`apps/web/src/pages/Leetcode.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { Leetcode } from './Leetcode'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'lcProblems').mockResolvedValue([
    { leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'k', url:'u', status:'new' },
    { leetcodeId:49, title:'字母异位词分组', difficulty:'medium', topic:'哈希', keyIdea:'k', url:'u', status:'mastered' },
  ] as any)
  vi.spyOn(api, 'lcSummary').mockResolvedValue({ total:2, mastered:1, learning:0, byTopic:[{topic:'哈希',total:2,mastered:1}] } as any)
})

describe('Leetcode', () => {
  it('renders problems grouped, progress, and opens a problem', async () => {
    const onOpen = vi.fn()
    const { getByText, findByText } = render(<Leetcode onOpen={onOpen} />)
    await findByText(/两数之和/)
    expect(getByText(/字母异位词分组/)).toBeTruthy()
    expect(getByText(/哈希/)).toBeTruthy()           // 专题分组标题
    fireEvent.click(getByText(/两数之和/))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(1))
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- Leetcode`
Expected: FAIL — 无法导入 `./Leetcode`

- [ ] **Step 4: 实现 Leetcode 页**

`apps/web/src/pages/Leetcode.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Card, Badge } from '../components/ui'
import type { LcProblem, ProgressStatus, Difficulty } from '@aios/shared'

type P = LcProblem & { status: ProgressStatus }
const DIFF_LABEL: Record<Difficulty,string> = { easy:'简单', medium:'中等', hard:'困难' }
const DIFF_TONE: Record<Difficulty,'muted'|'warn'|'danger'> = { easy:'muted', medium:'warn', hard:'danger' }
const STATUS_LABEL: Record<ProgressStatus,string> = { new:'未学', learning:'学习中', mastered:'已掌握' }

export function Leetcode({ onOpen }: { onOpen: (leetcodeId: number) => void }) {
  const [problems, setProblems] = useState<P[]>([])
  const [summary, setSummary] = useState<{total:number;mastered:number}|null>(null)
  const [filter, setFilter] = useState<Difficulty | 'all'>('all')

  useEffect(() => { api.lcProblems().then(setProblems).catch(()=>{}); api.lcSummary().then(setSummary).catch(()=>{}) }, [])

  const groups = useMemo(() => {
    const filtered = problems.filter(p => filter === 'all' || p.difficulty === filter)
    const byTopic = new Map<string, P[]>()
    for (const p of filtered) { const a = byTopic.get(p.topic) ?? []; a.push(p); byTopic.set(p.topic, a) }
    return [...byTopic.entries()]
  }, [problems, filter])

  const pct = summary && summary.total ? Math.round((summary.mastered / summary.total) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">算法学习 · Hot100</h1>
        {summary && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-sm text-muted"><span>已掌握 {summary.mastered} / {summary.total}</span><span>{pct}%</span></div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {(['all','easy','medium','hard'] as const).map(d => (
          <button key={d} onClick={() => setFilter(d)}
            className={`cursor-pointer rounded-btn px-3 py-1 text-sm ${filter===d?'bg-accent text-white':'bg-surface-2 text-muted hover:text-text'}`}>
            {d==='all'?'全部':DIFF_LABEL[d]}
          </button>
        ))}
      </div>
      {groups.map(([topic, items]) => (
        <div key={topic} className="space-y-2">
          <h2 className="text-sm font-semibold text-text">{topic} <span className="text-xs font-normal text-faint">({items.length})</span></h2>
          <div className="space-y-1.5">
            {items.map(p => (
              <button key={p.leetcodeId} onClick={() => onOpen(p.leetcodeId)}
                className="flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface-2">
                <span className="text-sm text-text"><span className="text-faint">#{p.leetcodeId}</span> {p.title}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={DIFF_TONE[p.difficulty]}>{DIFF_LABEL[p.difficulty]}</Badge>
                  <span className="text-xs text-muted">{STATUS_LABEL[p.status]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- Leetcode`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/api.ts apps/web/src/pages/Leetcode.tsx apps/web/src/pages/Leetcode.test.tsx
git commit -m "feat(web): api lc 方法 + 算法题库浏览页(专题分组/难度筛选/进度)"
```

---

### Task 6: 引导讲题页 + 导航流转 + 端到端冒烟

**Files:**
- Create: `apps/web/src/pages/LcGuide.tsx`
- Modify: `apps/web/src/App.tsx`(导航加「算法学习」+ Leetcode↔LcGuide 流转)
- Test: `apps/web/src/pages/LcGuide.test.tsx`

**Interfaces:**
- Consumes: `api.startGuide/stepGuide/lcProblems/setLcProgress`(Task 5)、`GuideStep`(shared)、`Card`/`Button`(ui)
- Produces:
  - `<LcGuide leetcodeId:number onBack:()=>void />` — 挂载即 startGuide;聊天式(复用模块四气泡 + Enter 提交 + 自动滚动);顶部题目信息(取自 lcProblems 找到该题)+「去 LeetCode 做题」外链(`url`)+ 掌握度切换(调 setLcProgress);AI 引导 / 输入思考往复;done 后提示「本题引导完成」。

- [ ] **Step 1: 写失败测试**

`apps/web/src/pages/LcGuide.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, findByText as _f } from '@testing-library/react'
import { LcGuide } from './LcGuide'
import { api } from '../api'

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'lcProblems').mockResolvedValue([{ leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'k', url:'https://lc/two-sum', status:'new' }] as any)
  vi.spyOn(api, 'startGuide').mockResolvedValue({ sessionId:7, guidance:'这题考点是什么?' } as any)
  vi.spyOn(api, 'stepGuide').mockResolvedValue({ guidance:'你已掌握,真棒', done:true } as any)
  vi.spyOn(api, 'setLcProgress').mockResolvedValue({ ok:true } as any)
})

describe('LcGuide', () => {
  it('starts guide, answers, reaches done', async () => {
    const { getByText, getByLabelText, findByText } = render(<LcGuide leetcodeId={1} onBack={()=>{}} />)
    await findByText(/这题考点是什么/)
    fireEvent.change(getByLabelText(/你的思考/), { target: { value: '哈希表' } })
    fireEvent.click(getByText(/提交/))
    await findByText(/本题引导完成/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- LcGuide`
Expected: FAIL — 无法导入 `./LcGuide`

- [ ] **Step 3: 实现 LcGuide**

`apps/web/src/pages/LcGuide.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Button } from '../components/ui'
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react'
import type { ProgressStatus } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string }

export function LcGuide({ leetcodeId, onBack }: { leetcodeId: number; onBack: () => void }) {
  const [problem, setProblem] = useState<{ title:string; url:string; topic:string } | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api.lcProblems().then(ps => { const p = ps.find(x => x.leetcodeId === leetcodeId); if (alive && p) setProblem({ title:p.title, url:p.url, topic:p.topic }) }).catch(()=>{})
    setBusy(true)
    api.startGuide(leetcodeId)
      .then(r => { if (!alive) return; setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.guidance }]) })
      .catch(e => { if (alive) setError(e.message) }).finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [leetcodeId])

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [msgs, busy])

  async function submit() {
    if (!sessionId || !input.trim() || done) return
    const mine = input
    setMsgs(m => [...m, { role:'me', text: mine }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.stepGuide(sessionId, mine)
      setMsgs(m => [...m, { role:'ai', text: r.guidance }])
      if (r.done) setDone(true)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) submit() }
  }
  function mark(status: ProgressStatus) { api.setLcProgress(leetcodeId, status).catch(()=>{}) }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={15} /> 返回题库</button>
      {problem && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4">
          <div>
            <span className="text-sm font-semibold text-text">{problem.title}</span>
            <span className="ml-2 text-xs text-faint">{problem.topic}</span>
            <a href={problem.url} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">去 LeetCode 做题 <ExternalLink size={12} /></a>
          </div>
          <div className="flex items-center gap-1">
            {(['learning','mastered'] as const).map(s => (
              <button key={s} onClick={() => mark(s)} className="cursor-pointer rounded-btn bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-text">
                标记{s==='learning'?'学习中':'已掌握'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-card px-4 py-2.5 text-sm ${m.role==='ai' ? 'bg-surface-2 text-text' : 'bg-accent text-white'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 老师思考中…</div>}
        {done && <p className="text-center text-sm text-success">本题引导完成,记得动手在 LeetCode 上写一遍!</p>}
        <div ref={endRef} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!done && (
        <div className="flex gap-2">
          <textarea aria-label="你的思考" rows={3} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}
            className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="写下你的思路…（Enter 提交，Shift+Enter 换行）" />
          <Button variant="primary" onClick={submit} disabled={busy}>提交</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 改 App.tsx 导航 + 流转**

view 联合类型加 `'leetcode'`;navItems 加 `{ id:'leetcode', label:'算法学习', icon: Code2 }`(`import { Code2 } from 'lucide-react'`);import `Leetcode`/`LcGuide`;新增状态 `const [guideFor, setGuideFor] = useState<number | null>(null)`;主区:
```tsx
{view === 'leetcode'
  ? (guideFor !== null
      ? <LcGuide leetcodeId={guideFor} onBack={() => setGuideFor(null)} />
      : <Leetcode onOpen={setGuideFor} />)
  : /* 其余现有分支 */ }
```
> leetcode 视图独立于 confirmedVersion(算法学习不依赖简历)。切到其他 view 时 `guideFor` 不必清(留着也无碍);可在切换 nav 时顺手 `setGuideFor(null)` 保持干净。

- [ ] **Step 5: 全量回归 + 类型检查 + 构建**

Run: `npm test`(全绿)→ `npx tsc --noEmit -p apps/web/tsconfig.json`(0 错)→ `npm run build --workspace=apps/web`(成功)。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/pages/LcGuide.tsx apps/web/src/App.tsx apps/web/src/pages/LcGuide.test.tsx
git commit -m "feat(web): 引导讲题页 + 导航接入算法学习"
```

- [ ] **Step 7: 端到端冒烟(真机,控制者执行,不交子代理)**

重启后端(种子会自动导入 100 题);经 API:`GET /api/lc/problems`(确认 100 题)→ `POST /api/lc/guides {leetcodeId:1}`(开引导)→ 多次 `POST /api/lc/guides/:id/step {answer}` 直到 `done:true` → `PUT /api/lc/problems/1/progress {status:'mastered'}` → `GET /api/lc/summary`(mastered=1)。验证:引导循序渐进、不直接给答案代码;done 收口;进度统计正确。记录到进度账本。

---

## 实施顺序与依赖

Task 1(shared)→ 2(数据层+种子)→ 3(引导服务)→ 4(路由+启动种子)→ 5(前端 api+题库页)→ 6(引导页+导航+冒烟)。严格按序;每个 Task 自带测试与提交。Task 6 真机冒烟由控制者完成。


