# 模块六 错题本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在知识库之上构建错题本——对来自模拟面试/项目深挖的差题提供 AI 重做评分攻克闭环 + 错因洞察面板。

**Architecture:** 复用 `knowledge_items` 表(仅 `source∈{interview,deepdive}` 算错题),新增 `conquered_at` 列 + `knowledge_attempts` 重做尝试表。重做走 `AiProvider` 无状态简化评分(题目+参考+新答案),AI 只打分,verdict 由后端按统一 60 分阈值算,达标写 `conquered_at`。前端新增「错题本」页(待攻克/已攻克/洞察 三 Tab)。

**Tech Stack:** monorepo(pnpm/npm workspaces);后端 Express + `node:sqlite`;共享 zod 类型 `@aios/shared`;前端 React19 + Vite + Tailwind + recharts;测试 vitest(+ @testing-library/react)。

## Global Constraints

- **零改动模块三既有功能**:仅加列(`conquered_at`)+ 加表(`knowledge_attempts`)+ export 一行 + 新路由/新页面。不改 knowledge CRUD/复习逻辑。
- **错题范围**:仅 `source ∈ {interview, deepdive}`。手动条目不算错题。
- **AI 输出 zod 校验**:非法 JSON → 重试 → 降级报错(用现成 `completeJson`,内置 2 次重试)。
- **verdict 后端算,不信任 AI**:`verdict = score >= CONQUER_THRESHOLD ? 'pass' : 'fail'`,`CONQUER_THRESHOLD = 60`(0-100 制,对应面试/深挖共同的 60% 及格线)。
- **攻克后不打回**:`conquered_at` 一旦置位不再改;已攻克再重做只追加 attempt。
- **安全**:SQL 参数化;写用 `transaction(db, fn)`;AI 走默认模型(非 LeetCode 引导,不强制 sonnet);限并发/超时沿用现有基础设施。
- **静态路由段先于 `/:id` 注册**(沿用现有约定)。
- **分支**:`feat/error-book`,每任务独立提交,测试通过 + tsc 干净 + build 成功后 push。合并 main 需用户显式授权。
- **测试命令**:`npm test`(vitest run,根目录跑全量);类型检查 `npx tsc --noEmit`;前端构建 `npm run build --workspace=apps/web`。

---

## File Structure

- `packages/shared/src/knowledge.ts`(修改)— 新增 attempt 相关 schema + `CONQUER_THRESHOLD`,`KnowledgeItemSchema` 加 `conqueredAt`。
- `apps/server/src/db/connection.ts`(修改)— 加列 + 建表 + 索引。
- `apps/server/src/db/repo.ts`(修改)— `createAttempt`/`listAttempts`/`listBookItems`/`bookStats`;`exportAll` 加一行;`rowToKnowledgeItem` 补 `conqueredAt`。
- `apps/server/src/services/errorbook.ts`(新建)— `gradeAttempt(ai, {question, reference, answer})` 简化评分。
- `apps/server/src/prompts/errorbook-grade.txt`(新建)— 评分 system prompt。
- `apps/server/src/routes/errorbook.ts`(新建)— 4 个端点。
- `apps/server/src/index.ts`(修改)— 注册 `errorbookRouter(db, ai)`。
- `apps/web/src/api.ts`(修改)— 4 个客户端方法。
- `apps/web/src/pages/ErrorBook.tsx`(新建)— 三 Tab 页面。
- `apps/web/src/pages/ErrorBook.test.tsx`(新建)— 前端测试。
- `apps/web/src/App.tsx`(修改)— 导航项 + view。
- `docs/项目交接-模块六错题本-完成.md`(新建)— 交接文档。

---
## Task 1: 共享类型 — attempt schema + 阈值 + conqueredAt

**Files:**
- Modify: `packages/shared/src/knowledge.ts`
- Test: `packages/shared/src/knowledge.test.ts`(若不存在则 Create)

**Interfaces:**
- Consumes: 现有 `KnowledgeItemSchema`、`z`。
- Produces:
  - `CONQUER_THRESHOLD = 60`(number 常量)
  - `AttemptGradeRawSchema` → `{ score:number(0-100), comment:string, gaps:string[] }`(AI 原始输出)
  - `KnowledgeAttemptFeedbackSchema` → `{ score, verdict:'pass'|'fail', comment, gaps }`;类型 `KnowledgeAttemptFeedback`
  - `KnowledgeAttemptSchema` → `{ id, itemId, answer, score, feedback:KnowledgeAttemptFeedback, createdAt }`;类型 `KnowledgeAttempt`
  - `KnowledgeItemSchema` 增加 `conqueredAt: string | null`

- [ ] **Step 1: 写失败测试**

在 `packages/shared/src/knowledge.test.ts` 追加(无此文件则新建,顶部 `import { describe, it, expect } from 'vitest'` + `import { AttemptGradeRawSchema, KnowledgeAttemptFeedbackSchema, KnowledgeAttemptSchema, CONQUER_THRESHOLD, KnowledgeItemSchema } from './knowledge'`):

```ts
describe('error-book schemas', () => {
  it('CONQUER_THRESHOLD is 60', () => {
    expect(CONQUER_THRESHOLD).toBe(60)
  })
  it('AttemptGradeRawSchema accepts score+comment+gaps, defaults gaps', () => {
    const r = AttemptGradeRawSchema.parse({ score: 72, comment: '不错' })
    expect(r.gaps).toEqual([])
    expect(r.score).toBe(72)
  })
  it('AttemptGradeRawSchema rejects out-of-range score', () => {
    expect(() => AttemptGradeRawSchema.parse({ score: 120, comment: 'x' })).toThrow()
  })
  it('KnowledgeAttemptFeedbackSchema requires verdict enum', () => {
    expect(() => KnowledgeAttemptFeedbackSchema.parse({ score: 60, verdict: 'maybe', comment: '', gaps: [] })).toThrow()
  })
  it('KnowledgeAttemptSchema parses a full row', () => {
    const a = KnowledgeAttemptSchema.parse({
      id: 1, itemId: 2, answer: 'ans', score: 80,
      feedback: { score: 80, verdict: 'pass', comment: 'ok', gaps: [] }, createdAt: '2026-07-10',
    })
    expect(a.feedback.verdict).toBe('pass')
  })
  it('KnowledgeItemSchema accepts conqueredAt null and string', () => {
    const base = { id:1, question:'q', answer:null, reference:null, tags:[], source:'interview',
      sourceRef:null, note:null, mastery:0, reviewDue:'2026-07-10', reviewInterval:0, reviewCount:0,
      createdAt:'2026-07-10', updatedAt:'2026-07-10' }
    expect(KnowledgeItemSchema.parse({ ...base, conqueredAt: null }).conqueredAt).toBeNull()
    expect(KnowledgeItemSchema.parse({ ...base, conqueredAt: '2026-07-10' }).conqueredAt).toBe('2026-07-10')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace=@aios/shared`
Expected: FAIL(`AttemptGradeRawSchema` 等未导出 / `conqueredAt` 未知字段)

- [ ] **Step 3: 实现**

在 `packages/shared/src/knowledge.ts` 的 `KnowledgeItemSchema` 内,`updatedAt` 之后加一行字段:

```ts
  conqueredAt: z.string().nullable(),
```

在文件末尾(`REVIEW_GRADES` 之后)追加:

```ts
// ── 错题本(模块六) ──────────────────────────────────────────
export const CONQUER_THRESHOLD = 60

// AI 原始输出:只打分+点评,不自称通过与否
export const AttemptGradeRawSchema = z.object({
  score: z.number().min(0).max(100),
  comment: z.string(),
  gaps: z.array(z.string()).default([]),
})
export type AttemptGradeRaw = z.infer<typeof AttemptGradeRawSchema>

export const KnowledgeAttemptFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(['pass', 'fail']),
  comment: z.string(),
  gaps: z.array(z.string()).default([]),
})
export type KnowledgeAttemptFeedback = z.infer<typeof KnowledgeAttemptFeedbackSchema>

export const KnowledgeAttemptSchema = z.object({
  id: z.number(),
  itemId: z.number(),
  answer: z.string(),
  score: z.number(),
  feedback: KnowledgeAttemptFeedbackSchema,
  createdAt: z.string(),
})
export type KnowledgeAttempt = z.infer<typeof KnowledgeAttemptSchema>
```

> 注意:`KnowledgeItemSchema` 加了必填 `conqueredAt` 后,`repo.ts` 的 `rowToKnowledgeItem` 必须一并补该字段(Task 2 处理),否则现有 knowledge 测试会红。因此 Task 1 与 Task 2 之间不单独跑全量;本任务只跑 shared 包测试。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace=@aios/shared`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/knowledge.ts packages/shared/src/knowledge.test.ts
git commit -m "feat(shared): 错题本 attempt schema + CONQUER_THRESHOLD + conqueredAt

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 2: DB 迁移 + repo(conqueredAt + attempts 表 + 查询/统计)

**Files:**
- Modify: `apps/server/src/db/connection.ts`
- Modify: `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(若不存在则 Create)

**Interfaces:**
- Consumes: `transaction`、`rowToKnowledgeItem`、`createKnowledgeItem`(现有);shared 的 `KnowledgeAttempt`、`KnowledgeAttemptFeedback`、`KnowledgeItem`。
- Produces:
  - `createAttempt(db, a: { itemId:number; answer:string; feedback:KnowledgeAttemptFeedback }): { attempt:KnowledgeAttempt; conquered:boolean }`
    — 事务:插 attempt;若 `feedback.verdict==='pass'` 且该 item `conquered_at IS NULL` 则置 `conquered_at=datetime('now')` 并返回 `conquered:true`(否则 false)。
  - `listAttempts(db, itemId:number): KnowledgeAttempt[]` — 按 id 倒序。
  - `listBookItems(db, f: { status?:'pending'|'conquered'; source?:string; tag?:string }): Array<KnowledgeItem & { attemptCount:number }>`
    — 仅 `source IN ('interview','deepdive')`;`status='conquered'` → `conquered_at IS NOT NULL`,否则(默认 pending)→ `IS NULL`;可选 source/tag 过滤;按 `updated_at DESC`。
  - `bookStats(db): { total:number; pending:number; conquered:number; bySource:{source:string;count:number}[]; byTag:{tag:string;count:number}[]; conqueredLast7Days:number }`
    — 范围均限 `source IN ('interview','deepdive')`;`byTag` 统计**未攻克**条目的标签计数(薄弱分布)。

- [ ] **Step 1: 写失败测试**

在 `apps/server/src/db/repo.test.ts` 追加(文件已存在;确保顶部有 `import { openDb } from './repo'` 及所需导入,新增导入 `createAttempt, listAttempts, listBookItems, bookStats, createKnowledgeItem`)。用内存库 `openDb(':memory:')`:

```ts
describe('error-book repo', () => {
  function seed(db: any) {
    // 两条面试差题 + 一条深挖 + 一条手动(不应算错题)
    const i1 = createKnowledgeItem(db, { question:'q-i1', answer:'a', reference:'ref', tags:['rag'], note:null, source:'interview', sourceRef:'t1' })
    const i2 = createKnowledgeItem(db, { question:'q-i2', answer:'a', reference:null, tags:['sql'], note:null, source:'interview', sourceRef:'t2' })
    const d1 = createKnowledgeItem(db, { question:'q-d1', answer:'a', reference:'ref', tags:['rag'], note:null, source:'deepdive', sourceRef:'t3' })
    createKnowledgeItem(db, { question:'q-m', answer:null, reference:null, tags:['x'], note:null, source:'manual', sourceRef:null })
    return { i1, i2, d1 }
  }
  it('listBookItems excludes manual and defaults to pending', () => {
    const db = openDb(':memory:'); const { } = seed(db)
    const items = listBookItems(db, {})
    expect(items).toHaveLength(3)
    expect(items.every(x => x.source !== 'manual')).toBe(true)
    expect(items.every(x => typeof x.attemptCount === 'number')).toBe(true)
  })
  it('createAttempt with pass verdict sets conquered_at and moves item to conquered list', () => {
    const db = openDb(':memory:'); const { i1 } = seed(db)
    const { conquered } = createAttempt(db, { itemId: i1, answer:'better', feedback:{ score:80, verdict:'pass', comment:'ok', gaps:[] } })
    expect(conquered).toBe(true)
    expect(listBookItems(db, { status:'pending' }).find(x => x.id === i1)).toBeUndefined()
    expect(listBookItems(db, { status:'conquered' }).find(x => x.id === i1)).toBeTruthy()
  })
  it('createAttempt with fail verdict does not conquer', () => {
    const db = openDb(':memory:'); const { i1 } = seed(db)
    const { conquered } = createAttempt(db, { itemId: i1, answer:'bad', feedback:{ score:40, verdict:'fail', comment:'', gaps:['x'] } })
    expect(conquered).toBe(false)
    expect(listBookItems(db, { status:'pending' }).find(x => x.id === i1)).toBeTruthy()
  })
  it('re-attempting a conquered item does not overwrite conquered_at and returns conquered:false', () => {
    const db = openDb(':memory:'); const { i1 } = seed(db)
    createAttempt(db, { itemId: i1, answer:'a', feedback:{ score:80, verdict:'pass', comment:'', gaps:[] } })
    const second = createAttempt(db, { itemId: i1, answer:'b', feedback:{ score:90, verdict:'pass', comment:'', gaps:[] } })
    expect(second.conquered).toBe(false)
    expect(listAttempts(db, i1)).toHaveLength(2)
  })
  it('listAttempts returns newest first', () => {
    const db = openDb(':memory:'); const { i1 } = seed(db)
    const a1 = createAttempt(db, { itemId:i1, answer:'first', feedback:{ score:30, verdict:'fail', comment:'', gaps:[] } }).attempt
    const a2 = createAttempt(db, { itemId:i1, answer:'second', feedback:{ score:70, verdict:'pass', comment:'', gaps:[] } }).attempt
    const list = listAttempts(db, i1)
    expect(list[0].id).toBe(a2.id); expect(list[1].id).toBe(a1.id)
  })
  it('listBookItems filters by source and tag', () => {
    const db = openDb(':memory:'); seed(db)
    expect(listBookItems(db, { source:'deepdive' }).every(x => x.source === 'deepdive')).toBe(true)
    expect(listBookItems(db, { tag:'rag' }).every(x => x.tags.includes('rag'))).toBe(true)
  })
  it('bookStats aggregates totals, sources and weak tags', () => {
    const db = openDb(':memory:'); const { i1 } = seed(db)
    createAttempt(db, { itemId:i1, answer:'a', feedback:{ score:80, verdict:'pass', comment:'', gaps:[] } })
    const s = bookStats(db)
    expect(s.total).toBe(3)
    expect(s.conquered).toBe(1)
    expect(s.pending).toBe(2)
    expect(s.conqueredLast7Days).toBe(1)
    expect(s.bySource.find(x => x.source === 'interview')!.count).toBe(2)
    // i1 已攻克,其 rag 标签不再计入薄弱;剩 d1(rag) 与 i2(sql)
    expect(s.byTag.find(x => x.tag === 'rag')!.count).toBe(1)
    expect(s.byTag.find(x => x.tag === 'sql')!.count).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace=@aios/server`
Expected: FAIL(`createAttempt` 等未定义;`conqueredAt` 使既有 knowledge 测试也可能红)

- [ ] **Step 3a: 迁移(connection.ts)**

在 `migrate()` 内 `knowledge_items` 建表语句**之后**追加(与 `reviews` 加列同风格):

```ts
  // 模块六 错题本:攻克状态列(幂等)
  try { db.exec('ALTER TABLE knowledge_items ADD COLUMN conquered_at TEXT') } catch { /* 已存在 */ }
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES knowledge_items(id),
      answer TEXT NOT NULL,
      score INTEGER NOT NULL,
      feedback_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS ix_ka_item ON knowledge_attempts(item_id);
  `)
```

- [ ] **Step 3b: repo — rowToKnowledgeItem 补 conqueredAt**

在 `repo.ts` 的 `rowToKnowledgeItem` 的 parse 对象里,`updatedAt: r.updated_at,` 之后加:

```ts
    conqueredAt: r.conquered_at ?? null,
```

- [ ] **Step 3c: repo — 新增错题本函数**

在 `knowledgeStats` 之后追加。先在文件顶部 import 里补 `KnowledgeAttempt`、`KnowledgeAttemptFeedback` 类型(与现有 `KnowledgeItem` 同一 import 行):

```ts
function rowToAttempt(r: any): KnowledgeAttempt {
  return { id: r.id, itemId: r.item_id, answer: r.answer, score: r.score,
    feedback: JSON.parse(r.feedback_json) as KnowledgeAttemptFeedback, createdAt: r.created_at }
}

export function createAttempt(db: DatabaseSync, a: { itemId: number; answer: string; feedback: KnowledgeAttemptFeedback }): { attempt: KnowledgeAttempt; conquered: boolean } {
  return transaction(db, () => {
    const id = Number(db.prepare('INSERT INTO knowledge_attempts (item_id,answer,score,feedback_json) VALUES (?,?,?,?)')
      .run(a.itemId, a.answer, a.feedback.score, JSON.stringify(a.feedback)).lastInsertRowid)
    let conquered = false
    if (a.feedback.verdict === 'pass') {
      const cur = db.prepare('SELECT conquered_at FROM knowledge_items WHERE id=?').get(a.itemId) as any
      if (cur && cur.conquered_at == null) {
        db.prepare(`UPDATE knowledge_items SET conquered_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(a.itemId)
        conquered = true
      }
    }
    const attempt = rowToAttempt(db.prepare('SELECT * FROM knowledge_attempts WHERE id=?').get(id))
    return { attempt, conquered }
  })
}

export function listAttempts(db: DatabaseSync, itemId: number): KnowledgeAttempt[] {
  return (db.prepare('SELECT * FROM knowledge_attempts WHERE item_id=? ORDER BY id DESC').all(itemId) as any[]).map(rowToAttempt)
}

export function listBookItems(db: DatabaseSync, f: { status?: 'pending' | 'conquered'; source?: string; tag?: string }): (KnowledgeItem & { attemptCount: number })[] {
  const where: string[] = [`source IN ('interview','deepdive')`]
  const params: any[] = []
  where.push(f.status === 'conquered' ? 'conquered_at IS NOT NULL' : 'conquered_at IS NULL')
  if (f.source === 'interview' || f.source === 'deepdive') { where.push('source=?'); params.push(f.source) }
  if (f.tag) { where.push('tags LIKE ?'); params.push(`%${JSON.stringify(f.tag)}%`) }
  const rows = db.prepare(`SELECT * FROM knowledge_items WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`).all(...params) as any[]
  return rows.map(r => {
    const c = (db.prepare('SELECT COUNT(*) c FROM knowledge_attempts WHERE item_id=?').get(r.id) as any).c
    return { ...rowToKnowledgeItem(r), attemptCount: Number(c) }
  })
}

export function bookStats(db: DatabaseSync) {
  const scope = `source IN ('interview','deepdive')`
  const total = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE ${scope}`).get() as any).c
  const conquered = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE ${scope} AND conquered_at IS NOT NULL`).get() as any).c
  const pending = total - conquered
  const bySourceRows = db.prepare(`SELECT source, COUNT(*) c FROM knowledge_items WHERE ${scope} GROUP BY source`).all() as any[]
  const bySource = bySourceRows.map(r => ({ source: r.source as string, count: Number(r.c) }))
  const conqueredLast7Days = (db.prepare(
    `SELECT COUNT(*) c FROM knowledge_items WHERE ${scope} AND conquered_at IS NOT NULL AND date(conquered_at) >= date('now','localtime','-6 days')`
  ).get() as any).c
  // byTag:仅统计未攻克(薄弱)条目
  const weakRows = db.prepare(`SELECT tags FROM knowledge_items WHERE ${scope} AND conquered_at IS NULL`).all() as any[]
  const tagCount = new Map<string, number>()
  for (const r of weakRows) for (const t of JSON.parse(r.tags ?? '[]')) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  const byTag = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
  return { total, pending, conquered, bySource, byTag, conqueredLast7Days: Number(conqueredLast7Days) }
}
```

- [ ] **Step 3d: exportAll 加一行**

在 `exportAll` 的返回对象里 `knowledgeItems: ...` 之后加:

```ts
    knowledgeAttempts: db.prepare('SELECT * FROM knowledge_attempts').all(),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace=@aios/server`
Expected: PASS(含既有 knowledge 测试仍绿——`rowToKnowledgeItem` 已补 conqueredAt)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): 错题本 DB 迁移 + repo(attempts/攻克/统计)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 3: 评分 service + prompt(简化独立评分)

**Files:**
- Create: `apps/server/src/prompts/errorbook-grade.txt`
- Create: `apps/server/src/services/errorbook.ts`
- Test: `apps/server/src/services/errorbook.test.ts`

**Interfaces:**
- Consumes: `AiProvider`、`completeJson`(现有,内置 2 次重试 + zod)、shared 的 `AttemptGradeRawSchema`、`CONQUER_THRESHOLD`、`KnowledgeAttemptFeedback`。
- Produces:
  - `gradeAttempt(ai: AiProvider, input: { question:string; reference:string|null; answer:string }): Promise<KnowledgeAttemptFeedback>`
    — 组 prompt → `completeJson(ai, AttemptGradeRawSchema, ...)` → 后端算 `verdict = raw.score >= CONQUER_THRESHOLD ? 'pass':'fail'` → 返回 `{ score, verdict, comment, gaps }`。

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/errorbook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { gradeAttempt } from './errorbook'

function fakeAi(raw: object): AiProvider {
  const s = JSON.stringify(raw)
  return { async complete(){ return s }, async *stream(){ yield s } }
}

describe('gradeAttempt', () => {
  it('marks pass when score >= 60 (verdict computed server-side)', async () => {
    const fb = await gradeAttempt(fakeAi({ score: 75, comment: '答得不错', gaps: ['缺少复杂度分析'] }),
      { question: 'q', reference: 'ref', answer: 'my answer' })
    expect(fb.verdict).toBe('pass')
    expect(fb.score).toBe(75)
    expect(fb.gaps).toEqual(['缺少复杂度分析'])
  })
  it('marks fail when score < 60 even if AI text implies success', async () => {
    const fb = await gradeAttempt(fakeAi({ score: 40, comment: '你答对了' }),
      { question: 'q', reference: null, answer: 'a' })
    expect(fb.verdict).toBe('fail')
    expect(fb.gaps).toEqual([])
  })
  it('throws after retries when AI returns invalid JSON', async () => {
    const ai: AiProvider = { async complete(){ return '不是JSON' }, async *stream(){ yield '' } }
    await expect(gradeAttempt(ai, { question:'q', reference:null, answer:'a' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace=@aios/server`
Expected: FAIL(`gradeAttempt` 未定义)

- [ ] **Step 3a: prompt 文件**

`apps/server/src/prompts/errorbook-grade.txt`:

```
你是一名严格但公正的技术面试评分官。考生正在"重做"一道他之前答错的题目。
你会收到:题目、参考答案(可能为空)、考生本次的新答案。
请只依据题目本身评估这次新答案的质量,给出 0-100 的分数(60 为及格线)。

严格返回以下 JSON,不要输出任何多余文字:
{
  "score": <0-100 的整数>,
  "comment": "<一句话总评:好在哪/差在哪>",
  "gaps": ["<仍然缺失或答错的关键点>", "..."]
}
若参考答案为空,请依据你的专业知识判断正确性。gaps 可为空数组。
```

- [ ] **Step 3b: service 实现**

`apps/server/src/services/errorbook.ts`:

```ts
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
    gaps: raw.gaps,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace=@aios/server`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/errorbook-grade.txt apps/server/src/services/errorbook.ts apps/server/src/services/errorbook.test.ts
git commit -m "feat(server): 错题本简化评分 service(AI 打分,后端算 verdict)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 4: 后端路由 + 组装

**Files:**
- Create: `apps/server/src/routes/errorbook.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/src/routes/errorbook.test.ts`

**Interfaces:**
- Consumes: `AiProvider`;repo 的 `listBookItems`、`bookStats`、`listAttempts`、`createAttempt`、`getKnowledgeItem`;service 的 `gradeAttempt`;`HttpError`。
- Produces(挂在 `/api` 前缀):
  - `GET /error-book?status=&source=&tag=` → `listBookItems`(status 仅接受 pending/conquered,其他值 400)
  - `GET /error-book/stats` → `bookStats`
  - `GET /error-book/items/:id/attempts` → `listAttempts`(条目不存在 404)
  - `POST /error-book/items/:id/attempt` body `{ answer }` → 校验条目存在且 source∈{interview,deepdive} 否则 400/404;`answer` 空 400;调 `gradeAttempt` → `createAttempt` → 返回 `{ feedback, conquered, attempt }`
  - 导出 `errorbookRouter(db, ai)`

> 路径用 `/error-book/items/:id/attempt`(而非 `/knowledge/:id/attempt`),避免与现有 `/knowledge/:id` 段冲突,错题本自成一片前缀。

- [ ] **Step 1: 写失败测试**

`apps/server/src/routes/errorbook.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createKnowledgeItem } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

function aiScoring(score: number): AiProvider {
  const s = JSON.stringify({ score, comment: 'c', gaps: [] })
  return { async complete(){ return s }, async *stream(){ yield s } }
}
let db: DatabaseSync

describe('error-book routes', () => {
  beforeEach(() => { db = openDb(':memory:') })

  it('GET /error-book lists pending weak items, excludes manual', async () => {
    createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    createKnowledgeItem(db, { question:'qm', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].question).toBe('qi')
  })

  it('GET /error-book rejects invalid status with 400', async () => {
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book?status=bogus')
    expect(res.status).toBe(400)
  })

  it('POST attempt with high score conquers the item', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(85))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'my new answer' })
    expect(res.status).toBe(200)
    expect(res.body.conquered).toBe(true)
    expect(res.body.feedback.verdict).toBe('pass')
    // 现在应出现在 conquered 列表
    const conq = await request(app).get('/api/error-book?status=conquered')
    expect(conq.body.find((x: any) => x.id === id)).toBeTruthy()
  })

  it('POST attempt with low score does not conquer', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(40))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'weak' })
    expect(res.body.conquered).toBe(false)
    expect(res.body.feedback.verdict).toBe('fail')
  })

  it('POST attempt rejects manual item with 400', async () => {
    const id = createKnowledgeItem(db, { question:'qm', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'x' })
    expect(res.status).toBe(400)
  })

  it('POST attempt rejects empty answer with 400', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: '  ' })
    expect(res.status).toBe(400)
  })

  it('GET attempts returns history; 404 for missing item', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(70))
    await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'a1' })
    const list = await request(app).get(`/api/error-book/items/${id}/attempts`)
    expect(list.body).toHaveLength(1)
    const missing = await request(app).get('/api/error-book/items/9999/attempts')
    expect(missing.status).toBe(404)
  })

  it('GET stats returns totals', async () => {
    createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:['t'], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book/stats')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.pending).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace=@aios/server`
Expected: FAIL(`/api/error-book` 404;`errorbookRouter` 未定义)

- [ ] **Step 3a: 路由实现**

`apps/server/src/routes/errorbook.ts`:

```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { HttpError } from '../middleware/error'
import { listBookItems, bookStats, listAttempts, createAttempt, getKnowledgeItem } from '../db/repo'
import { gradeAttempt } from '../services/errorbook'

export function errorbookRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.get('/error-book', (req, res, next) => {
    try {
      const status = req.query.status
      if (status !== undefined && status !== 'pending' && status !== 'conquered') throw new HttpError(400, 'status 非法')
      const source = req.query.source ? String(req.query.source) : undefined
      res.json(listBookItems(db, {
        status: status as 'pending' | 'conquered' | undefined,
        source, tag: req.query.tag ? String(req.query.tag) : undefined,
      }))
    } catch (e) { next(e) }
  })

  r.get('/error-book/stats', (_req, res) => res.json(bookStats(db)))

  r.get('/error-book/items/:id/attempts', (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      res.json(listAttempts(db, item.id))
    } catch (e) { next(e) }
  })

  r.post('/error-book/items/:id/attempt', async (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      if (item.source !== 'interview' && item.source !== 'deepdive') throw new HttpError(400, '该条目不是错题')
      const answer = String(req.body.answer ?? '').trim()
      if (!answer) throw new HttpError(400, 'answer 不能为空')
      const feedback = await gradeAttempt(ai, { question: item.question, reference: item.reference, answer })
      const { attempt, conquered } = createAttempt(db, { itemId: item.id, answer, feedback })
      res.json({ feedback, conquered, attempt })
    } catch (e) { next(e) }
  })

  return r
}
```

- [ ] **Step 3b: 组装(index.ts)**

在 import 区加 `import { errorbookRouter } from './routes/errorbook'`;在 `app.use('/api', knowledgeRouter(db))` 之后加:

```ts
  app.use('/api', errorbookRouter(db, ai))
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace=@aios/server`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/routes/errorbook.ts apps/server/src/routes/errorbook.test.ts apps/server/src/index.ts
git commit -m "feat(server): 错题本路由(列表/统计/重做历史/AI 重做评分)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 5: 前端 api 客户端方法

**Files:**
- Modify: `apps/web/src/api.ts`

**Interfaces:**
- Consumes: 现有 `j`、`json` 助手;shared 类型 `KnowledgeItem`、`KnowledgeAttempt`、`KnowledgeAttemptFeedback`。
- Produces(挂到 `api` 对象):
  - `listErrorBook(f?: { status?:'pending'|'conquered'; source?:string; tag?:string }) => Promise<(KnowledgeItem & { attemptCount:number })[]>`
  - `errorBookStats() => Promise<{ total:number; pending:number; conquered:number; bySource:{source:string;count:number}[]; byTag:{tag:string;count:number}[]; conqueredLast7Days:number }>`
  - `listAttempts(id:number) => Promise<KnowledgeAttempt[]>`
  - `submitAttempt(id:number, answer:string) => Promise<{ feedback:KnowledgeAttemptFeedback; conquered:boolean; attempt:KnowledgeAttempt }>`

> 这一步无独立单测(纯薄封装);由 Task 6 的页面测试通过 mock 这些方法间接覆盖。与 Task 6 合并提交也可,但按右尺寸原则单独成任务便于审查。

- [ ] **Step 1: 修改 import 行**

`apps/web/src/api.ts` 顶部 import 里追加 `KnowledgeAttempt, KnowledgeAttemptFeedback`(与现有 `KnowledgeItem` 同一行)。

- [ ] **Step 2: 在 `api` 对象 `importKnowledge` 之后加方法**

```ts
  listErrorBook: (f: { status?:'pending'|'conquered'; source?:string; tag?:string } = {}) => {
    const p = new URLSearchParams()
    if (f.status) p.set('status', f.status)
    if (f.source) p.set('source', f.source)
    if (f.tag) p.set('tag', f.tag)
    const qs = p.toString()
    return j<(KnowledgeItem & { attemptCount:number })[]>(`/api/error-book${qs ? '?' + qs : ''}`)
  },
  errorBookStats: () => j<{ total:number; pending:number; conquered:number; bySource:{source:string;count:number}[]; byTag:{tag:string;count:number}[]; conqueredLast7Days:number }>('/api/error-book/stats'),
  listAttempts: (id:number) => j<KnowledgeAttempt[]>(`/api/error-book/items/${id}/attempts`),
  submitAttempt: (id:number, answer:string) => j<{ feedback:KnowledgeAttemptFeedback; conquered:boolean; attempt:KnowledgeAttempt }>(`/api/error-book/items/${id}/attempt`, json({ answer })),
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit --project apps/web`
Expected: 0 error

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/api.ts
git commit -m "feat(web): 错题本 api 客户端方法

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 前端错题本页面 + 导航

**Files:**
- Create: `apps/web/src/pages/ErrorBook.tsx`
- Create: `apps/web/src/pages/ErrorBook.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `api.listErrorBook/errorBookStats/listAttempts/submitAttempt`;`Card/Button/Badge`、`Markdown`;lucide `Target`。
- Produces: `export function ErrorBook()`;App 新增 `view='errorbook'` + 导航项。

- [ ] **Step 1: 写失败测试**

`apps/web/src/pages/ErrorBook.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ErrorBook } from './ErrorBook'
import { api } from '../api'

const weak = { id:1, question:'RAG 如何召回?', answer:'旧答', reference:'参考答案文本', tags:['rag'],
  source:'interview', sourceRef:'t1', note:null, mastery:0, reviewDue:'2026-07-10',
  reviewInterval:0, reviewCount:0, createdAt:'2026-07-10', updatedAt:'2026-07-10', conqueredAt:null, attemptCount:0 }

beforeEach(() => {
  vi.spyOn(api, 'listErrorBook').mockResolvedValue([weak] as any)
  vi.spyOn(api, 'errorBookStats').mockResolvedValue({ total:1, pending:1, conquered:0, bySource:[{source:'interview',count:1}], byTag:[{tag:'rag',count:1}], conqueredLast7Days:0 } as any)
  vi.spyOn(api, 'listAttempts').mockResolvedValue([] as any)
  vi.spyOn(api, 'submitAttempt').mockResolvedValue({ feedback:{ score:85, verdict:'pass', comment:'答得好', gaps:[] }, conquered:true, attempt:{ id:1, itemId:1, answer:'新答', score:85, feedback:{ score:85, verdict:'pass', comment:'答得好', gaps:[] }, createdAt:'2026-07-10' } } as any)
})

describe('ErrorBook', () => {
  it('lists pending weak items', async () => {
    const { findByText } = render(<ErrorBook />)
    expect(await findByText(/RAG 如何召回/)).toBeTruthy()
  })
  it('redo flow: expand, write answer, submit, see pass verdict', async () => {
    const { findByText, getByText, getByLabelText } = render(<ErrorBook />)
    fireEvent.click(await findByText(/RAG 如何召回/))
    fireEvent.change(getByLabelText(/重做答案/), { target:{ value:'我的新答案' } })
    fireEvent.click(getByText(/让 AI 评分/))
    await waitFor(() => expect(api.submitAttempt).toHaveBeenCalledWith(1, '我的新答案'))
    expect(await findByText(/答得好/)).toBeTruthy()
    expect(await findByText(/通过/)).toBeTruthy()
  })
  it('insight tab renders stats', async () => {
    const { findByText, getByText } = render(<ErrorBook />)
    await findByText(/RAG 如何召回/)
    fireEvent.click(getByText(/洞察/))
    expect(await findByText(/待攻克/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace=@aios/web`
Expected: FAIL(`./ErrorBook` 不存在)

- [ ] **Step 3: 实现页面(见下方完整代码块)**

创建 `apps/web/src/pages/ErrorBook.tsx`,完整内容:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Button, Badge } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Target, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { KnowledgeItem, KnowledgeAttemptFeedback } from '@aios/shared'

const SOURCE_LABEL: Record<string, string> = { interview: '模拟面试', deepdive: '项目深挖' }
type BookItem = KnowledgeItem & { attemptCount: number }
type Tab = 'pending' | 'conquered' | 'insight'

export function ErrorBook() {
  const [tab, setTab] = useState<Tab>('pending')
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Target size={20} className="text-accent" />
        <h1 className="text-xl font-semibold tracking-tight">错题本</h1>
      </div>
      <div className="flex gap-1">
        {(['pending', 'conquered', 'insight'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`cursor-pointer rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
            {t === 'pending' ? '待攻克' : t === 'conquered' ? '已攻克' : '洞察'}
          </button>
        ))}
      </div>
      {tab === 'insight' ? <Insight /> : <List key={tab} status={tab} />}
    </div>
  )
}

function List({ status }: { status: 'pending' | 'conquered' }) {
  const [items, setItems] = useState<BookItem[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  async function load() { setItems(await api.listErrorBook({ status }).catch(() => [])) }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [status])

  if (items === null) return <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> 加载中…</div>
  if (items.length === 0) return <Card className="p-6 text-sm text-muted">{status === 'pending' ? '没有待攻克的错题。去「模拟面试」或「项目深挖」答错的题,存入知识库后会出现在这里。' : '还没有攻克任何错题,加油!'}</Card>

  return (
    <div className="space-y-2">
      {items.map(it => (
        <Card key={it.id} className="p-4">
          <button onClick={() => setExpanded(e => e === it.id ? null : it.id)} className="w-full cursor-pointer text-left">
            <p className="text-sm font-medium text-text">{it.question}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {it.tags.map(t => <Badge key={t} tone="accent">{t}</Badge>)}
              <Badge tone="muted">{SOURCE_LABEL[it.source] ?? it.source}</Badge>
              {it.conqueredAt && <Badge tone="accent">已攻克 🎉</Badge>}
              <span className="text-xs text-faint">重做 {it.attemptCount} 次</span>
            </div>
          </button>
          {expanded === it.id && <Redo item={it} onConquered={load} />}
        </Card>
      ))}
    </div>
  )
}

function Redo({ item, onConquered }: { item: BookItem; onConquered: () => void }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<KnowledgeAttemptFeedback | null>(null)
  const [error, setError] = useState('')

  async function submit() {
    if (!answer.trim()) { setError('答案不能为空'); return }
    setBusy(true); setError('')
    try {
      const res = await api.submitAttempt(item.id, answer.trim())
      setFb(res.feedback)
      if (res.conquered) onConquered()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const field = 'w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40'
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {item.reference && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">参考答案</p><Markdown>{item.reference}</Markdown></div>}
      <label className="block space-y-1"><span className="text-sm text-muted">重做答案(支持 Markdown)</span>
        <textarea aria-label="重做答案" rows={4} value={answer} onChange={e => setAnswer(e.target.value)} className={field} /></label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button variant="primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} 让 AI 评分</Button>
      {fb && (
        <div className="space-y-2 rounded-card border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            {fb.verdict === 'pass' ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-danger" />}
            <span className="text-sm font-medium">{fb.verdict === 'pass' ? '通过' : '未通过'} · {fb.score} 分</span>
          </div>
          <Markdown>{fb.comment}</Markdown>
          {fb.gaps.length > 0 && (
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">仍需补强</p>
              <ul className="list-disc pl-5 text-sm text-muted">{fb.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  )
}

function Insight() {
  const [s, setS] = useState<Awaited<ReturnType<typeof api.errorBookStats>> | null>(null)
  useEffect(() => { api.errorBookStats().then(setS).catch(() => {}) }, [])
  if (!s) return <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> 加载中…</div>

  const metrics = [
    { label: '总错题', value: s.total }, { label: '待攻克', value: s.pending },
    { label: '已攻克', value: s.conquered }, { label: '近 7 天攻克', value: s.conqueredLast7Days },
  ]
  const maxTag = Math.max(1, ...s.byTag.map(t => t.count))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(m => (
          <Card key={m.label} className="p-4"><p className="text-2xl font-semibold text-text">{m.value}</p><p className="text-xs text-muted">{m.label}</p></Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-text">按来源</p>
        {s.bySource.map(b => <div key={b.source} className="flex justify-between text-sm"><span className="text-muted">{SOURCE_LABEL[b.source] ?? b.source}</span><span className="text-text">{b.count}</span></div>)}
      </Card>
      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-text">薄弱知识点(未攻克)</p>
        {s.byTag.length === 0 ? <p className="text-sm text-muted">暂无标签数据</p> : s.byTag.map(t => (
          <div key={t.tag} className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted">{t.tag}</span><span className="text-faint">{t.count}</span></div>
            <div className="h-1.5 w-full rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / maxTag) * 100}%` }} /></div>
          </div>
        ))}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: App.tsx 接线**

在 `apps/web/src/App.tsx`:
1. import 行加 `ErrorBook`:`import { ErrorBook } from './pages/ErrorBook'`,lucide import 加 `Target`。
2. `view` 联合类型加 `'errorbook'`:`useState<'dashboard' | 'resume' | 'interview' | 'leetcode' | 'deepdive' | 'knowledge' | 'errorbook'>`。
3. `navItems` 在 knowledge 项之后加:`{ id: 'errorbook' as const, label: '错题本', icon: Target },`。
4. main 渲染:在 `view === 'knowledge' ? (<KnowledgeBase />) :` 之后加一支 `view === 'errorbook' ? (<ErrorBook />) :`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test --workspace=@aios/web`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/pages/ErrorBook.tsx apps/web/src/pages/ErrorBook.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): 错题本页面(待攻克/已攻克/洞察)+ 导航

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 全量验证 + 交接文档

**Files:**
- Create: `docs/项目交接-模块六错题本-完成.md`

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿(原有 + 错题本新增用例)

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit --project apps/server && npx tsc --noEmit --project apps/web`
Expected: 0 error

- [ ] **Step 3: 前端构建**

Run: `npm run build --workspace=apps/web`
Expected: 成功(允许 chunk >500kB 常规警告)

- [ ] **Step 4: 写交接文档**

`docs/项目交接-模块六错题本-完成.md`,套用模块三交接文档结构(定位/已落地文件清单/攻克算法/验证结果/Git 状态/未来模块),末尾更新"已完成模块表"加入模块六。

- [ ] **Step 5: 提交并推送分支**

```bash
git add docs/项目交接-模块六错题本-完成.md
git commit -m "docs: 模块六 错题本完成交接文档

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin feat/error-book
```

> 合并到 main 需用户显式授权(走 PR 或授权直推),本计划不自动合并。

- [ ] **Step 6: 真机冒烟(用户执行)**

`npm run dev` → 面试/深挖产差题 → 存入知识库 → 错题本待攻克 → 重做写答案 → AI 评分 → 通过则进已攻克 → 洞察面板核对计数 → 深浅色。

---

## Self-Review 结果

- **Spec 覆盖**:定位/范围(Task 2 `listBookItems` 排除 manual)、C 状态方案(Task 1/2 conqueredAt+attempts 表)、AI 简化评分(Task 3)、后端算 verdict(Task 3)、4 端点(Task 4)、三 Tab 前端 + 洞察(Task 6)、导出一行(Task 2 Step 3d)、测试与验证(Task 7)—— 全部有对应任务。
- **占位符**:无 TBD/TODO;所有代码步骤含完整代码。
- **类型一致**:`createAttempt` 入参 `{ itemId, answer, feedback }`、返回 `{ attempt, conquered }` 在 Task 2/4 一致;`gradeAttempt` 返回 `KnowledgeAttemptFeedback` 在 Task 3/4 一致;api 方法名 `listErrorBook/errorBookStats/listAttempts/submitAttempt` 在 Task 5/6 一致;`CONQUER_THRESHOLD=60` 单一来源。

