# 模块三实现计划:知识库(差题沉淀 + 手动新增 + 艾宾浩斯复习)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 长期知识积累中心。统一 `knowledge_items` 表汇入三条来源(模块四/五 is_weak 差题一键导入、手动新增、艾宾浩斯自评复习)。**本模块零 AI 调用**——纯 CRUD + 本地间隔算法。

**Architecture:** packages/shared 加 `knowledge.ts`(zod 模型);apps/server 加一张表(connection.ts)+ 一组 repo 函数 + `/api/knowledge` 路由;apps/web 加受控 Markdown 组件 + `KnowledgeBase` 页(知识库 Tab + 今日复习 Tab)+ 导航项 + 模块四/五结束页各加一个「存入知识库」按钮。纯新增,向后兼容,不改现有流程。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind + react-markdown/remark-gfm(web);Vitest。**无 AiProvider 依赖。**

## Global Constraints

- 本模块**不调用任何 AI**;纯 CRUD + 固定阶梯间隔算法。
- SQLite **全程参数化**;多步写(导入去重、review 读改写)用 `transaction`(已存在)。
- 时间统一 ISO 文本;到期判定按**日期**比较:`date(review_due) <= date('now','localtime')`,绕开时区/时刻边界。
- 去重:`(source, source_ref)` 部分唯一索引(source_ref 非空时生效);重复导入静默跳过,不覆盖用户后来的编辑。
- 后端只绑 127.0.0.1;条目内容(含 AI 生成的 betterAnswer / 用户输入)当不可信数据,前端经**受控 Markdown 渲染**——`react-markdown` + `remark-gfm`,**不启用 `rehype-raw`**(默认不透传原始 HTML),不用 `dangerouslySetInnerHTML`。
- TypeScript 严格模式;**不破坏现有 116 个测试**;纯新增。
- node:sqlite:`DatabaseSync`;`db.exec('CREATE TABLE IF NOT EXISTS ...')`;`prepare().run/get/all`;`INSERT OR IGNORE` 做去重导入。
- 前端组件测试首行 `// @vitest-environment jsdom`;jsdom 无 `scrollIntoView` 需 polyfill;沿用根 vitest.config.ts。
- 依赖以固定版本 pin(react-markdown / remark-gfm)。

## 复习间隔算法(自评驱动,无 AI)

```
INTERVALS = [1, 2, 4, 7, 15, 30]   // 天;下标 = 已复习阶段
```
- **记住了(remembered)**:`review_count += 1`;`review_interval = INTERVALS[min(review_count, 5)]`;`review_due = date('now','localtime', '+<interval> days')`;`mastery = min(5, mastery + 1)`。
- **没记住(forgot)**:`review_count = 0`;`review_interval = 1`;`review_due = 明天`(date +1 day,不设今天避免同日死循环);`mastery = max(0, mastery - 1)`。

## 文件结构

```
packages/shared/src/
  knowledge.ts             # 新增:KnowledgeSource, KnowledgeItemInputSchema, KnowledgeItemSchema, ReviewGrade
  index.ts                 # 修改:export * from './knowledge'
apps/server/src/
  db/connection.ts         # 修改:建 knowledge_items 表 + 部分唯一索引
  db/repo.ts               # 修改:knowledge CRUD + import + review + tags + stats;exportAll 加表
  routes/knowledge.ts      # 新增:/api/knowledge CRUD + /due + /tags + /:id/review + /import
  index.ts                 # 修改:挂载 knowledgeRouter
apps/web/src/
  components/Markdown.tsx   # 新增:受控 Markdown 渲染(react-markdown + remark-gfm,禁 HTML)
  api.ts                   # 修改:knowledge 全套方法
  pages/KnowledgeBase.tsx   # 新增:知识库 Tab + 今日复习 Tab
  pages/MockInterview.tsx   # 修改:报告页加「存入知识库」按钮
  pages/ProjectDeepdive.tsx # 修改:知识地图页加「存入知识库」按钮
  App.tsx                  # 修改:导航加「知识库」+ 渲染
  package.json             # 修改:加 react-markdown + remark-gfm
```

实施顺序:1(shared)→ 2(数据层)→ 3(路由)→ 4(web 依赖 + Markdown 组件 + api)→ 5(KnowledgeBase 页)→ 6(导入按钮接入模块四/五)→ 7(导航 + 冒烟)。严格按序;每个 Task 自带测试与提交。

---

<!-- APPEND-MARKER -->

### Task 1: 共享数据模型(knowledge)

**Files:**
- Create: `packages/shared/src/knowledge.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/knowledge.test.ts`

**Interfaces:**
- Produces:
  - `KNOWLEDGE_SOURCES = ['interview','deepdive','manual'] as const`;`KnowledgeSource`
  - `KnowledgeItemInputSchema` → `{ question:string(min 1), answer:string|null(default null), reference:string|null(default null), tags:string[](default []), note:string|null(default null) }`;`KnowledgeItemInput`
  - `KnowledgeItemSchema` → `{ id, question, answer:string|null, reference:string|null, tags:string[], source:enum, sourceRef:string|null, note:string|null, mastery:0-5, reviewDue, reviewInterval, reviewCount, createdAt, updatedAt }`;`KnowledgeItem`
  - `REVIEW_GRADES = ['remembered','forgot'] as const`;`ReviewGrade`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/knowledge.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { KnowledgeItemInputSchema, KnowledgeItemSchema } from './knowledge'

describe('knowledge schemas', () => {
  it('defaults optional input fields', () => {
    const v = KnowledgeItemInputSchema.parse({ question: 'Q' })
    expect(v).toEqual({ question:'Q', answer:null, reference:null, tags:[], note:null })
  })
  it('rejects empty question', () => {
    expect(() => KnowledgeItemInputSchema.parse({ question:'' })).toThrow()
  })
  it('accepts a full item', () => {
    const item = { id:1, question:'Q', answer:'a', reference:'r', tags:['ai'], source:'manual',
      sourceRef:null, note:null, mastery:2, reviewDue:'2026-07-08', reviewInterval:2, reviewCount:1,
      createdAt:'2026-07-07', updatedAt:'2026-07-07' }
    expect(KnowledgeItemSchema.parse(item)).toEqual(item)
  })
  it('rejects out-of-range mastery and unknown source', () => {
    const base = { id:1, question:'Q', answer:null, reference:null, tags:[], sourceRef:null, note:null,
      mastery:2, reviewDue:'d', reviewInterval:0, reviewCount:0, createdAt:'c', updatedAt:'u' }
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'manual', mastery:6 })).toThrow()
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'weird' })).toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- knowledge` → FAIL(无法导入 `./knowledge`)

- [ ] **Step 3: 实现**

`packages/shared/src/knowledge.ts`:
```ts
import { z } from 'zod'

export const KNOWLEDGE_SOURCES = ['interview', 'deepdive', 'manual'] as const
export type KnowledgeSource = typeof KNOWLEDGE_SOURCES[number]

export const KnowledgeItemInputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().default(null),
})
export type KnowledgeItemInput = z.infer<typeof KnowledgeItemInputSchema>

export const KnowledgeItemSchema = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string().nullable(),
  reference: z.string().nullable(),
  tags: z.array(z.string()),
  source: z.enum(KNOWLEDGE_SOURCES),
  sourceRef: z.string().nullable(),
  note: z.string().nullable(),
  mastery: z.number().min(0).max(5),
  reviewDue: z.string(),
  reviewInterval: z.number(),
  reviewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>

export const REVIEW_GRADES = ['remembered', 'forgot'] as const
export type ReviewGrade = typeof REVIEW_GRADES[number]
```
`packages/shared/src/index.ts` 增加:`export * from './knowledge'`

- [ ] **Step 4: 运行确认通过** — `npm test -- knowledge` → PASS(4)

- [ ] **Step 5: 全量回归 + 提交**
```bash
npm test   # 现有 116 仍绿
git add packages/shared/src/knowledge.ts packages/shared/src/knowledge.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 知识库模型(条目/输入/复习自评)"
```

---

### Task 2: 数据层(表 + repo)

**Files:**
- Modify: `apps/server/src/db/connection.ts`, `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加)

**Interfaces:**
- Consumes: `KnowledgeItem`/`KnowledgeItemInput`/`KnowledgeSource`/`ReviewGrade`(Task 1), 现有 `openDb`
- Produces:
  - `createKnowledgeItem(db, input & { source:KnowledgeSource; sourceRef:string|null }): number` — review_due 置今天(立即可复习)、interval 0、count 0、mastery 0;tags JSON 序列化
  - `importWeakItem(db, { source, sourceRef, question, answer, reference }): number | null` — INSERT OR IGNORE;新插入返回 id,已存在(去重命中)返回 null
  - `getKnowledgeItem(db, id): KnowledgeItem | undefined`
  - `updateKnowledgeItem(db, id, input:KnowledgeItemInput): void` — 改 question/answer/reference/tags/note + updated_at;不动复习字段
  - `deleteKnowledgeItem(db, id): void`
  - `listKnowledgeItems(db, filter:{ source?; tag?; mastery?; q? }): KnowledgeItem[]` — q 用 LIKE 命中 question/answer/reference/note(参数化);ORDER BY updated_at DESC
  - `listDueItems(db): KnowledgeItem[]` — `date(review_due) <= date('now','localtime')`,ORDER BY review_due ASC
  - `reviewKnowledgeItem(db, id, grade:ReviewGrade): KnowledgeItem` — 按算法更新,transaction 包裹,返回更新后条目
  - `listAllTags(db): string[]` — 各行 tags JSON 合并去重
  - `knowledgeStats(db): { total; due; mastered }`
  - `exportAll` 加 `knowledgeItems`
- 统一 `rowToKnowledgeItem(r)`:tags JSON.parse、下划线转驼峰、`KnowledgeItemSchema.parse` 兜底

- [ ] **Step 1: 写失败测试(追加)**

```ts
import { createKnowledgeItem, importWeakItem, getKnowledgeItem, updateKnowledgeItem,
  deleteKnowledgeItem, listKnowledgeItems, listDueItems, reviewKnowledgeItem, listAllTags } from './repo'

describe('knowledge repo', () => {
  it('create → get round-trip, tags preserved', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:'a', reference:'r', tags:['ai','rag'], note:null, source:'manual', sourceRef:null })
    const item = getKnowledgeItem(db, id)!
    expect(item.question).toBe('Q'); expect(item.tags).toEqual(['ai','rag'])
    expect(item.source).toBe('manual'); expect(item.mastery).toBe(0)
  })
  it('importWeakItem dedupes by (source, source_ref)', () => {
    const db = openDb(':memory:')
    const a = importWeakItem(db, { source:'interview', sourceRef:'42', question:'Q', answer:'a', reference:'ref' })
    const b = importWeakItem(db, { source:'interview', sourceRef:'42', question:'Q', answer:'a', reference:'ref' })
    expect(a).not.toBeNull(); expect(b).toBeNull()
    expect(listKnowledgeItems(db, {}).length).toBe(1)
  })
  it('filters by source/tag/mastery and q (LIKE)', () => {
    const db = openDb(':memory:')
    createKnowledgeItem(db, { question:'RAG 召回', answer:null, reference:null, tags:['ai'], note:null, source:'manual', sourceRef:null })
    createKnowledgeItem(db, { question:'排序算法', answer:null, reference:null, tags:['algo'], note:null, source:'manual', sourceRef:null })
    expect(listKnowledgeItems(db, { tag:'ai' }).length).toBe(1)
    expect(listKnowledgeItems(db, { q:'召回' }).length).toBe(1)
  })
  it('listDueItems: due=today matches, due=tomorrow does not', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    expect(listDueItems(db).map(i=>i.id)).toContain(id)   // 新建即今天到期
    reviewKnowledgeItem(db, id, 'remembered')              // due 推到 +1 天
    expect(listDueItems(db).map(i=>i.id)).not.toContain(id)
  })
  it('reviewKnowledgeItem: remembered advances, forgot resets', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    let it = reviewKnowledgeItem(db, id, 'remembered')
    expect(it.reviewCount).toBe(1); expect(it.reviewInterval).toBe(2); expect(it.mastery).toBe(1)
    it = reviewKnowledgeItem(db, id, 'forgot')
    expect(it.reviewCount).toBe(0); expect(it.reviewInterval).toBe(1); expect(it.mastery).toBe(0)
  })
  it('update leaves review fields untouched; delete removes; listAllTags dedupes', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:['ai'], note:null, source:'manual', sourceRef:null })
    reviewKnowledgeItem(db, id, 'remembered')
    updateKnowledgeItem(db, id, { question:'Q2', answer:'a', reference:null, tags:['ai','x'], note:'n' })
    const it = getKnowledgeItem(db, id)!
    expect(it.question).toBe('Q2'); expect(it.reviewCount).toBe(1)  // 复习字段不被 update 重置
    expect(listAllTags(db).sort()).toEqual(['ai','x'])
    deleteKnowledgeItem(db, id)
    expect(getKnowledgeItem(db, id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- repo` → FAIL

- [ ] **Step 3: 迁移(connection.ts,追加到 migrate 末尾)**

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL, answer TEXT, reference TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL, source_ref TEXT, note TEXT,
      mastery INTEGER NOT NULL DEFAULT 0,
      review_due TEXT NOT NULL, review_interval INTEGER NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE UNIQUE INDEX IF NOT EXISTS ux_ki_source_ref
      ON knowledge_items(source, source_ref) WHERE source_ref IS NOT NULL;
  `)
```

- [ ] **Step 4: repo.ts 新增**

```ts
import { KnowledgeItemSchema, type KnowledgeItem, type KnowledgeItemInput,
  type KnowledgeSource, type ReviewGrade } from '@aios/shared'

const INTERVALS = [1, 2, 4, 7, 15, 30]

function rowToKnowledgeItem(r: any): KnowledgeItem {
  return KnowledgeItemSchema.parse({
    id: r.id, question: r.question, answer: r.answer ?? null, reference: r.reference ?? null,
    tags: JSON.parse(r.tags ?? '[]'), source: r.source, sourceRef: r.source_ref ?? null,
    note: r.note ?? null, mastery: r.mastery, reviewDue: r.review_due,
    reviewInterval: r.review_interval, reviewCount: r.review_count,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })
}

export function createKnowledgeItem(db: DatabaseSync, input: KnowledgeItemInput & { source: KnowledgeSource; sourceRef: string | null }): number {
  return Number(db.prepare(`INSERT INTO knowledge_items
    (question,answer,reference,tags,source,source_ref,note,review_due,review_interval,review_count)
    VALUES (?,?,?,?,?,?,?, date('now','localtime'), 0, 0)`)
    .run(input.question, input.answer, input.reference, JSON.stringify(input.tags ?? []),
      input.source, input.sourceRef, input.note).lastInsertRowid)
}

export function importWeakItem(db: DatabaseSync, w: { source: KnowledgeSource; sourceRef: string; question: string; answer: string | null; reference: string | null }): number | null {
  const res = db.prepare(`INSERT OR IGNORE INTO knowledge_items
    (question,answer,reference,tags,source,source_ref,note,review_due,review_interval,review_count)
    VALUES (?,?,?, '[]', ?,?, NULL, date('now','localtime'), 0, 0)`)
    .run(w.question, w.answer, w.reference, w.source, w.sourceRef)
  return res.changes ? Number(res.lastInsertRowid) : null
}

export function getKnowledgeItem(db: DatabaseSync, id: number): KnowledgeItem | undefined {
  const r = db.prepare('SELECT * FROM knowledge_items WHERE id=?').get(id) as any
  return r ? rowToKnowledgeItem(r) : undefined
}

export function updateKnowledgeItem(db: DatabaseSync, id: number, input: KnowledgeItemInput): void {
  db.prepare(`UPDATE knowledge_items SET question=?, answer=?, reference=?, tags=?, note=?, updated_at=datetime('now') WHERE id=?`)
    .run(input.question, input.answer, input.reference, JSON.stringify(input.tags ?? []), input.note, id)
}

export function deleteKnowledgeItem(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM knowledge_items WHERE id=?').run(id)
}

export function listKnowledgeItems(db: DatabaseSync, f: { source?: string; tag?: string; mastery?: number; q?: string }): KnowledgeItem[] {
  const where: string[] = []; const params: any[] = []
  if (f.source) { where.push('source=?'); params.push(f.source) }
  if (typeof f.mastery === 'number') { where.push('mastery=?'); params.push(f.mastery) }
  if (f.q) { where.push('(question LIKE ? OR answer LIKE ? OR reference LIKE ? OR note LIKE ?)')
    const like = `%${f.q}%`; params.push(like, like, like, like) }
  if (f.tag) { where.push('tags LIKE ?'); params.push(`%${JSON.stringify(f.tag).slice(1,-1)}%`) } // 命中 JSON 里的 "tag"
  const sql = `SELECT * FROM knowledge_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`
  return (db.prepare(sql).all(...params) as any[]).map(rowToKnowledgeItem)
}

export function listDueItems(db: DatabaseSync): KnowledgeItem[] {
  const rows = db.prepare(`SELECT * FROM knowledge_items WHERE date(review_due) <= date('now','localtime') ORDER BY review_due ASC`).all() as any[]
  return rows.map(rowToKnowledgeItem)
}

export function reviewKnowledgeItem(db: DatabaseSync, id: number, grade: ReviewGrade): KnowledgeItem {
  return transaction(db, () => {
    const cur = getKnowledgeItem(db, id)
    if (!cur) throw new Error('knowledge item not found')
    if (grade === 'remembered') {
      const count = cur.reviewCount + 1
      const interval = INTERVALS[Math.min(count, INTERVALS.length - 1)]
      db.prepare(`UPDATE knowledge_items SET review_count=?, review_interval=?, mastery=?,
        review_due=date('now','localtime','+' || ? || ' days'), updated_at=datetime('now') WHERE id=?`)
        .run(count, interval, Math.min(5, cur.mastery + 1), interval, id)
    } else {
      db.prepare(`UPDATE knowledge_items SET review_count=0, review_interval=1, mastery=?,
        review_due=date('now','localtime','+1 days'), updated_at=datetime('now') WHERE id=?`)
        .run(Math.max(0, cur.mastery - 1), id)
    }
    return getKnowledgeItem(db, id)!
  })
}

export function listAllTags(db: DatabaseSync): string[] {
  const rows = db.prepare('SELECT tags FROM knowledge_items').all() as any[]
  const set = new Set<string>()
  for (const r of rows) for (const t of JSON.parse(r.tags ?? '[]')) set.add(t)
  return [...set]
}

export function knowledgeStats(db: DatabaseSync) {
  const total = (db.prepare('SELECT COUNT(*) c FROM knowledge_items').get() as any).c
  const due = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE date(review_due) <= date('now','localtime')`).get() as any).c
  const mastered = (db.prepare('SELECT COUNT(*) c FROM knowledge_items WHERE mastery>=5').get() as any).c
  return { total, due, mastered }
}
```
`exportAll` 加:`knowledgeItems: db.prepare('SELECT * FROM knowledge_items').all()`

> 注:tag 过滤用 `tags LIKE '%"tag"%'` 命中 JSON 数组里带引号的完整标签,避免子串误命中(如 tag `ai` 不误中 `air`)。`JSON.stringify(f.tag).slice(1,-1)` 得到不含外层引号的转义串,两侧用 `%"..."%` 更稳——实现时用 `` `%${JSON.stringify(f.tag)}%` `` 亦可(含引号)。取其一并让测试通过即可。

- [ ] **Step 5: 运行确认通过** — `npm test -- repo` → PASS

- [ ] **Step 6: 提交**
```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): knowledge_items 表 + repo(CRUD/导入去重/艾宾浩斯复习)"
```

---
<!-- APPEND-MARKER-2 -->

### Task 3: 路由(/api/knowledge)

**Files:**
- Create: `apps/server/src/routes/knowledge.ts`
- Modify: `apps/server/src/index.ts`(挂载,**注意 knowledgeRouter 不需要 ai 参数**)
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`(`describe('knowledge routes', ...)`)

**Interfaces:**
- Consumes: repo 的 knowledge 全套 + `listTurns`/`listDeepdiveTurns`(读 is_weak 差题), `HttpError`, `KnowledgeItemInputSchema`/`REVIEW_GRADES`(shared)
- Produces `knowledgeRouter(db): Router`(**无 ai**):
  - `GET /knowledge?source&tag&mastery&q` → `listKnowledgeItems`
  - `GET /knowledge/due` → `listDueItems`(**必须在 `/knowledge/:id` 之前注册**)
  - `GET /knowledge/tags` → `listAllTags`(同上,先于 `/:id`)
  - `POST /knowledge`(body `KnowledgeItemInput`)→ zod parse → `createKnowledgeItem(source='manual', sourceRef=null)` → 新条目
  - `POST /knowledge/import`(body `{ from:'interview'|'deepdive'; sessionId:number }`)→ 读该 session is_weak turns,`transaction` 内逐条 `importWeakItem` → `{ imported, skipped }`
  - `GET /knowledge/:id` → 单条(404)
  - `PUT /knowledge/:id`(body `KnowledgeItemInput`)→ 404 / zod → `updateKnowledgeItem` → 更新后条目
  - `DELETE /knowledge/:id` → `{ ok:true }`(404)
  - `POST /knowledge/:id/review`(body `{ grade }`)→ 404 / grade 校验 → `reviewKnowledgeItem` → 更新后条目
- 路由注册顺序:静态段(`/due`、`/tags`、`/import`)全部在含参数的 `/:id*` 之前。

- [ ] **Step 1: 写失败测试(追加)**

```ts
// 不需要会话感知 ai;knowledge 路由无 AI。用已有 createApp(db, fakeAi) 即可,knowledge 分支不触达 ai。
describe('knowledge routes', () => {
  it('CRUD + review + due + tags', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    // create
    const c = await request(app).post('/api/knowledge').send({ question:'RAG 召回?', tags:['ai'] })
    expect(c.status).toBe(200); const id = c.body.id
    expect(c.body.source).toBe('manual')
    // list + filter
    expect((await request(app).get('/api/knowledge?tag=ai')).body.length).toBe(1)
    expect((await request(app).get('/api/knowledge?q=召回')).body.length).toBe(1)
    // tags 不被 :id 吞
    expect((await request(app).get('/api/knowledge/tags')).body).toContain('ai')
    // due:新建即今天到期
    expect((await request(app).get('/api/knowledge/due')).body.map((x:any)=>x.id)).toContain(id)
    // review remembered → 移出今日到期
    const rv = await request(app).post(`/api/knowledge/${id}/review`).send({ grade:'remembered' })
    expect(rv.body.reviewCount).toBe(1)
    expect((await request(app).get('/api/knowledge/due')).body.map((x:any)=>x.id)).not.toContain(id)
    // update
    await request(app).put(`/api/knowledge/${id}`).send({ question:'RAG 召回优化?', tags:['ai','rag'] })
    expect((await request(app).get(`/api/knowledge/${id}`)).body.question).toBe('RAG 召回优化?')
    // 404s
    expect((await request(app).get('/api/knowledge/9999')).status).toBe(404)
    // delete
    expect((await request(app).delete(`/api/knowledge/${id}`)).body.ok).toBe(true)
    expect((await request(app).get(`/api/knowledge/${id}`)).status).toBe(404)
  })
  it('imports is_weak turns from an interview session with dedupe', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    // 直接用 repo 造一个含 is_weak turn 的 interview session
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null,
      structured:{ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }, status:'confirmed' })
    const sid = createSession(db, { resumeVersionId:vid, jobDescriptionId:null, cliSessionId:null, role:'x', roundType:'tech', maxRounds:6 })
    const t = createTurn(db, { sessionId:sid, turnIndex:0, question:'弱题?' })
    answerTurnRow(db, t, { answer:'不会', score:20, feedback:{ score:20, highlights:[], gaps:['浅'], better:'应当…' } })
    const imp = await request(app).post('/api/knowledge/import').send({ from:'interview', sessionId:sid })
    expect(imp.body).toEqual({ imported:1, skipped:0 })
    const again = await request(app).post('/api/knowledge/import').send({ from:'interview', sessionId:sid })
    expect(again.body).toEqual({ imported:0, skipped:1 })  // 去重
  })
})
```
> 测试需 import `createSession, createTurn, answerTurnRow, createResume, createVersion`(已在 repo)。

- [ ] **Step 2: 运行确认失败** — `npm test -- resumes` → FAIL(/api/knowledge 404)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/knowledge.ts`:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { KnowledgeItemInputSchema, REVIEW_GRADES, type ReviewGrade } from '@aios/shared'
import { HttpError } from '../middleware/error'
import { createKnowledgeItem, importWeakItem, getKnowledgeItem, updateKnowledgeItem,
  deleteKnowledgeItem, listKnowledgeItems, listDueItems, reviewKnowledgeItem, listAllTags,
  listTurns, listDeepdiveTurns, transaction } from '../db/repo'

export function knowledgeRouter(db: DatabaseSync) {
  const r = Router()

  r.get('/knowledge', (req, res) => {
    const q = req.query
    res.json(listKnowledgeItems(db, {
      source: q.source ? String(q.source) : undefined,
      tag: q.tag ? String(q.tag) : undefined,
      mastery: q.mastery !== undefined ? Number(q.mastery) : undefined,
      q: q.q ? String(q.q) : undefined,
    }))
  })

  r.get('/knowledge/due', (_req, res) => res.json(listDueItems(db)))
  r.get('/knowledge/tags', (_req, res) => res.json(listAllTags(db)))

  r.post('/knowledge', (req, res, next) => {
    try {
      const input = KnowledgeItemInputSchema.parse(req.body)
      const id = createKnowledgeItem(db, { ...input, source: 'manual', sourceRef: null })
      res.json(getKnowledgeItem(db, id))
    } catch (e) { next(e) }
  })

  r.post('/knowledge/import', (req, res, next) => {
    try {
      const from = String(req.body.from)
      const sessionId = Number(req.body.sessionId)
      if (from !== 'interview' && from !== 'deepdive') throw new HttpError(400, 'from 非法')
      const turns = from === 'interview' ? listTurns(db, sessionId) : listDeepdiveTurns(db, sessionId)
      const weak = turns.filter((t: any) => t.isWeak && t.answer !== null)
      let imported = 0, skipped = 0
      transaction(db, () => {
        for (const t of weak as any[]) {
          const reference = from === 'interview' ? (t.feedback?.better ?? null) : (t.feedback?.betterAnswer ?? null)
          const id = importWeakItem(db, { source: from, sourceRef: String(t.id), question: t.question, answer: t.answer, reference })
          if (id === null) skipped++; else imported++
        }
      })
      res.json({ imported, skipped })
    } catch (e) { next(e) }
  })

  r.get('/knowledge/:id', (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      res.json(item)
    } catch (e) { next(e) }
  })

  r.put('/knowledge/:id', (req, res, next) => {
    try {
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      const input = KnowledgeItemInputSchema.parse(req.body)
      updateKnowledgeItem(db, Number(req.params.id), input)
      res.json(getKnowledgeItem(db, Number(req.params.id)))
    } catch (e) { next(e) }
  })

  r.delete('/knowledge/:id', (req, res, next) => {
    try {
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      deleteKnowledgeItem(db, Number(req.params.id))
      res.json({ ok: true })
    } catch (e) { next(e) }
  })

  r.post('/knowledge/:id/review', (req, res, next) => {
    try {
      const grade = String(req.body.grade) as ReviewGrade
      if (!REVIEW_GRADES.includes(grade)) throw new HttpError(400, 'grade 非法')
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      res.json(reviewKnowledgeItem(db, Number(req.params.id), grade))
    } catch (e) { next(e) }
  })

  return r
}
```

- [ ] **Step 4: 挂载 index.ts** — `import { knowledgeRouter } from './routes/knowledge'` + `app.use('/api', knowledgeRouter(db))`(无 ai)

- [ ] **Step 5: 运行确认通过 + tsc** — `npm test`(全绿)+ `npx tsc --noEmit -p apps/server/tsconfig.json`(0)

- [ ] **Step 6: 提交**
```bash
git add apps/server/src/routes/knowledge.ts apps/server/src/index.ts apps/server/src/routes/resumes.test.ts
git commit -m "feat(server): /api/knowledge 路由 — CRUD + 复习 + 差题导入去重"
```

---

### Task 4: web 依赖 + 受控 Markdown 组件 + api

**Files:**
- Modify: `apps/web/package.json`(加 `react-markdown` + `remark-gfm`,pin 版本), root `package-lock`(npm install 生成)
- Create: `apps/web/src/components/Markdown.tsx`
- Modify: `apps/web/src/api.ts`
- Test: `apps/web/src/components/Markdown.test.tsx`

**Interfaces:**
- Produces:
  - `<Markdown>{text}</Markdown>` — react-markdown + remark-gfm,**不启用 rehype-raw**;原始 HTML 不渲染(纯文本回显),防 XSS。
  - api:`listKnowledge(f)`、`createKnowledge(input)`、`getKnowledge(id)`、`updateKnowledge(id,input)`、`deleteKnowledge(id)`、`listDue()`、`reviewKnowledge(id,grade)`、`listKnowledgeTags()`、`importKnowledge({from,sessionId})`

- [ ] **Step 1: 装依赖**
```bash
npm install react-markdown@9.0.1 remark-gfm@4.0.0 --workspace=apps/web
```
> 若安装受限,退回到 `9.x`/`4.x` 最新可解析版本;务必 pin 具体版本号。

- [ ] **Step 2: 写失败测试**

`apps/web/src/components/Markdown.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders markdown emphasis and lists', () => {
    const { container } = render(<Markdown>{'**粗体** 与\n\n- 一\n- 二'}</Markdown>)
    expect(container.querySelector('strong')?.textContent).toBe('粗体')
    expect(container.querySelectorAll('li').length).toBe(2)
  })
  it('does not render raw HTML (no script injection)', () => {
    const { container } = render(<Markdown>{'<script>alert(1)</script>安全'}</Markdown>)
    expect(container.querySelector('script')).toBeNull()
  })
})
```

- [ ] **Step 3: 运行确认失败** — `npm test -- Markdown` → FAIL

- [ ] **Step 4: 实现 Markdown.tsx**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 受控 Markdown:仅 remark-gfm,不启用 rehype-raw → 原始 HTML 不透传,防 XSS。
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`prose-sm max-w-none whitespace-pre-line break-words text-sm text-muted [&_a]:text-accent [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_ul]:list-disc [&_ul]:pl-4 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
```
> 若 `whitespace-pre-line` 与 gfm 换行冲突导致列表异常,去掉 `whitespace-pre-line`,让 markdown 自己处理换行(以测试通过为准)。

- [ ] **Step 5: 改 api.ts**(import 加 `KnowledgeItem, KnowledgeItemInput, ReviewGrade`;追加方法)

```ts
import type { /* 现有... */ KnowledgeItem, KnowledgeItemInput, ReviewGrade } from '@aios/shared'
  listKnowledge: (f: { source?:string; tag?:string; mastery?:number; q?:string } = {}) => {
    const p = new URLSearchParams()
    if (f.source) p.set('source', f.source); if (f.tag) p.set('tag', f.tag)
    if (typeof f.mastery === 'number') p.set('mastery', String(f.mastery)); if (f.q) p.set('q', f.q)
    const qs = p.toString()
    return j<KnowledgeItem[]>(`/api/knowledge${qs ? '?' + qs : ''}`)
  },
  createKnowledge: (input: KnowledgeItemInput) => j<KnowledgeItem>('/api/knowledge', json(input)),
  getKnowledge: (id: number) => j<KnowledgeItem>(`/api/knowledge/${id}`),
  updateKnowledge: (id: number, input: KnowledgeItemInput) => j<KnowledgeItem>(`/api/knowledge/${id}`, { ...json(input), method:'PUT' }),
  deleteKnowledge: (id: number) => j<{ok:true}>(`/api/knowledge/${id}`, { method:'DELETE' }),
  listDue: () => j<KnowledgeItem[]>('/api/knowledge/due'),
  reviewKnowledge: (id: number, grade: ReviewGrade) => j<KnowledgeItem>(`/api/knowledge/${id}/review`, json({ grade })),
  listKnowledgeTags: () => j<string[]>('/api/knowledge/tags'),
  importKnowledge: (input: { from:'interview'|'deepdive'; sessionId:number }) => j<{imported:number;skipped:number}>('/api/knowledge/import', json(input)),
```

- [ ] **Step 6: 运行确认通过 + tsc** — `npm test -- Markdown` → PASS;`npx tsc --noEmit -p apps/web/tsconfig.json`(0)

- [ ] **Step 7: 提交**
```bash
git add apps/web/package.json package.json package-lock.json apps/web/src/components/Markdown.tsx apps/web/src/components/Markdown.test.tsx apps/web/src/api.ts
git commit -m "feat(web): 受控 Markdown 组件 + knowledge api 客户端"
```

---
### Task 5: 知识库页(KnowledgeBase — 知识库 Tab + 今日复习 Tab)

**Files:**
- Create: `apps/web/src/pages/KnowledgeBase.tsx`
- Test: `apps/web/src/pages/KnowledgeBase.test.tsx`

**Interfaces:**
- Consumes: `api.listKnowledge/createKnowledge/updateKnowledge/deleteKnowledge/getKnowledge/listDue/reviewKnowledge/listKnowledgeTags`(Task 4), `<Markdown>`(Task 4), `Card`/`Button`/`Badge`(`components/ui`), lucide 图标
- Produces: `export function KnowledgeBase()`(无 props;自包含状态)
- 结构:顶部两个 Tab —「知识库」(`tab==='library'`) 与「今日复习」(`tab==='review'`)。

**知识库 Tab:**
- 工具条:关键词搜索(受控 `q`,输入即筛)+ 来源筛选(全部/interview/deepdive/manual)+ 标签筛选(下拉,来自 `listKnowledgeTags`)+ 掌握度筛选(全部/0..5)+「新增条目」按钮。
- 列表:每条 = question(截断)+ tags chips(`Badge`)+ 来源徽标 + 掌握度 0–5 点 + `reviewDue`;点开展开 answer/reference/note,后三者经 `<Markdown>` 渲染。行内「编辑」「删除」(删除二次确认)。
- 新增/编辑表单(内联或弹层皆可):question(必填)、answer、reference、tags(逗号分隔 → `split(',').map(trim).filter(Boolean)`)、note(textarea)。source 固定 manual;提交调 `createKnowledge`/`updateKnowledge` 后刷新列表 + tags。
- 空状态:无条目时提示「去『模拟面试』或『项目深挖』做几轮,答得不好的题会自动可导入这里,或点『新增条目』手写一条」。

**今日复习 Tab:**
- 进入时 `listDue()`;顶部显示到期数量。
- 单张翻卡:一次一张,先只显示 question +「显示答案」;点开展示 answer/reference/note(`<Markdown>`)+ 底部「记住了」「没记住」。
- 自评 → `reviewKnowledge(id, grade)` → 进入下一张;全部过完显示完成态「本次复习了 N 张 🎉」。
- 无到期:显示「今天没有需要复习的条目 🎉」。

- [ ] **Step 1: 写失败测试**

`apps/web/src/pages/KnowledgeBase.test.tsx`(首行 `// @vitest-environment jsdom`;`scrollIntoView` polyfill 如其他页):
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { KnowledgeBase } from './KnowledgeBase'
import { api } from '../api'

const item = { id:1, question:'RAG 召回?', answer:'我的答', reference:'更优', tags:['ai'],
  source:'manual', sourceRef:null, note:null, mastery:1, reviewDue:'2026-07-08',
  reviewInterval:2, reviewCount:1, createdAt:'2026-07-07', updatedAt:'2026-07-07' }

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'listKnowledge').mockResolvedValue([item] as any)
  vi.spyOn(api, 'listKnowledgeTags').mockResolvedValue(['ai'] as any)
  vi.spyOn(api, 'listDue').mockResolvedValue([item] as any)
  vi.spyOn(api, 'createKnowledge').mockResolvedValue({ ...item, id:2, question:'新题' } as any)
  vi.spyOn(api, 'reviewKnowledge').mockResolvedValue({ ...item, reviewCount:2 } as any)
})

describe('KnowledgeBase', () => {
  it('renders the library list', async () => {
    const { findByText } = render(<KnowledgeBase />)
    expect(await findByText(/RAG 召回/)).toBeTruthy()
  })
  it('creates a new item', async () => {
    const { getByText, findByText, getByLabelText } = render(<KnowledgeBase />)
    await findByText(/RAG 召回/)
    fireEvent.click(getByText(/新增条目/))
    fireEvent.change(getByLabelText(/问题/), { target:{ value:'新题' } })
    fireEvent.click(getByText(/保存/))
    await waitFor(() => expect(api.createKnowledge).toHaveBeenCalled())
  })
  it('review flow: reveal answer then self-grade advances the card', async () => {
    const { getByText, findByText } = render(<KnowledgeBase />)
    await findByText(/RAG 召回/)
    fireEvent.click(getByText(/今日复习/))
    await findByText(/RAG 召回/)                 // 题面
    fireEvent.click(getByText(/显示答案/))
    await findByText(/更优/)                      // reference 展示
    fireEvent.click(getByText(/记住了/))
    await waitFor(() => expect(api.reviewKnowledge).toHaveBeenCalledWith(1, 'remembered'))
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npm test -- KnowledgeBase` → FAIL(无法导入)

- [ ] **Step 3: 实现 KnowledgeBase.tsx**

要点(具体样式对齐 `MockInterview`/`ProjectDeepdive`,复用 `Card`/`Button`/`Badge`/`Markdown`):
- 顶层 state:`tab: 'library'|'review'`。
- library 分支:filters state(`q/source/tag/mastery`),`items` + `tags`;`useEffect` 依赖 filters 调 `listKnowledge`;搜索框防抖可省(本地小数据直连)。表单以 `editing: KnowledgeItem|null|'new'` 控制显隐;提交后 `refresh()`(重拉 list + tags)。删除走 `window.confirm`。
- review 分支:`due` + `idx` + `revealed`;进入(或从 library 切来)`listDue()` 填充;当前卡 `due[idx]`;「显示答案」置 `revealed=true`;自评调 `reviewKnowledge` 后 `idx+1`、`revealed=false`;`idx>=due.length` 显示完成态。
- 来源徽标文案:`interview→模拟面试`、`deepdive→项目深挖`、`manual→手动`。
- 掌握度:5 个点,`i < mastery` 实心。

`SOURCE_LABEL` 常量映射;`ReviewGrade` 从 `@aios/shared` 引入。表单 label 用 `你的问题`/`问题` 等(测试按 `/问题/` 匹配),保存按钮文案含「保存」。

- [ ] **Step 4: 运行确认通过 + tsc** — `npm test -- KnowledgeBase` → PASS;`npx tsc --noEmit -p apps/web/tsconfig.json`(0)

- [ ] **Step 5: 提交**
```bash
git add apps/web/src/pages/KnowledgeBase.tsx apps/web/src/pages/KnowledgeBase.test.tsx
git commit -m "feat(web): 知识库页(列表管理 + 今日复习翻卡自评)"
```

---
### Task 6: 导入入口接入模块四/五结束页

**Files:**
- Modify: `apps/web/src/pages/MockInterview.tsx`(报告页「暴露的短板」附近加「一键存入知识库」)
- Modify: `apps/web/src/pages/ProjectDeepdive.tsx`(`done` 页「本次薄弱问题」区块加同款按钮)
- Test: 追加断言到 `MockInterview.test.tsx` / `ProjectDeepdive.test.tsx`

**Interfaces:**
- Consumes: `api.importKnowledge({from, sessionId})`(Task 4)
- 行为:点击 → `importKnowledge` → 用轻量内联提示(state `importMsg`)展示「已存入 N 条(M 条已存在)」;失败展示错误。按钮 disabled 期间显示 loading。
- **约束**:sessionId 在两页均已有(`sessionId` state)。仅在 `finished/done` 报告态显示;不重构原有流程。MockInterview 仅在 `phase==='done'`(刚结束、非历史回看 `review`)显示按钮——回看页 sessionId 仍在,可选也放,但最小改动只在 done 态放。以 `sessionId!=null` 为条件即可。

- [ ] **Step 1: 写失败测试(追加)**

MockInterview.test.tsx 追加:
```tsx
it('imports weak turns to knowledge base from the report', async () => {
  vi.spyOn(api, 'importKnowledge').mockResolvedValue({ imported:2, skipped:1 } as any)
  const { getByText, getByLabelText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
  fireEvent.click(getByText(/开始面试/))
  await findByText(/请自我介绍/)
  fireEvent.change(getByLabelText(/你的回答/), { target:{ value:'我是...' } })
  fireEvent.click(getByText(/提交回答/))
  await findByText(/面试报告/)
  fireEvent.click(getByText(/存入知识库/))
  await findByText(/已存入 2 条/)
})
```
ProjectDeepdive.test.tsx 追加:
```tsx
it('imports weak turns to knowledge base from the map page', async () => {
  vi.spyOn(api, 'getDeepdive').mockResolvedValue({ session:{}, turns:[
    { id:5, question:'弱题?', answer:'不会', score:20, isWeak:true, feedback:{ betterAnswer:'应当…' } }] } as any)
  vi.spyOn(api, 'importKnowledge').mockResolvedValue({ imported:1, skipped:0 } as any)
  const { getByText, getByLabelText, findByText } = render(<ProjectDeepdive versionId={2} structured={structured} onBack={()=>{}} />)
  fireEvent.click(getByText(/体验生判/))
  await findByText(/Prompt 如何设计/)
  fireEvent.change(getByLabelText(/你的回答/), { target:{ value:'我的回答' } })
  fireEvent.click(getByText(/提交/))
  await findByText(/项目知识地图/)
  fireEvent.click(getByText(/存入知识库/))
  await findByText(/已存入 1 条/)
})
```
> ProjectDeepdive 现有测试的 `answerDeepdive` mock 无 weakTurns;此用例覆盖 `getDeepdive` 返回 isWeak,使「本次薄弱问题」区块渲染,按钮随之出现。

- [ ] **Step 2: 运行确认失败** — `npm test -- MockInterview ProjectDeepdive` → FAIL

- [ ] **Step 3: 实现**
- 两页各加 `importMsg` state + `doImport()`:`api.importKnowledge({ from:'interview'|'deepdive', sessionId })` → `setImportMsg('已存入 '+imported+' 条'+(skipped?`(${skipped} 条已存在)`:''))`。
- MockInterview:在 `phase==='done'` 报告区(`report.weaknesses` 卡片下方或报告卡内)加 `<Button variant="secondary" onClick={doImport}>存入知识库</Button>` + `{importMsg && <p ...>{importMsg}</p>}`。
- ProjectDeepdive:在 `done` 页「本次薄弱问题」`Card` 内(或其后)加同款按钮 + 提示。
- 用 `sessionId` state(两页均有);from 常量对应。

- [ ] **Step 4: 运行确认通过 + tsc** — `npm test`(全绿)+ web tsc(0)

- [ ] **Step 5: 提交**
```bash
git add apps/web/src/pages/MockInterview.tsx apps/web/src/pages/ProjectDeepdive.tsx apps/web/src/pages/MockInterview.test.tsx apps/web/src/pages/ProjectDeepdive.test.tsx
git commit -m "feat(web): 模拟面试/项目深挖结束页一键存入知识库"
```

---

### Task 7: 导航接入 + 全量回归 + 冒烟

**Files:**
- Modify: `apps/web/src/App.tsx`(导航加「知识库」+ 渲染 `KnowledgeBase`)

**Interfaces:**
- `view` 联合类型加 `'knowledge'`;`navItems` 加 `{ id:'knowledge', label:'知识库', icon: Library }`(lucide `Library` 或 `BookMarked`);main 分支 `view==='knowledge'` → `<KnowledgeBase />`。
- 知识库无前置门槛(不依赖 confirmed 简历),直接渲染。

- [ ] **Step 1: 接入 App.tsx**
- import `KnowledgeBase` + lucide `Library`。
- `useState` 的 `view` 类型追加 `| 'knowledge'`。
- `navItems` 追加知识库项(建议置于「项目深挖」之后或末尾)。
- main 渲染链加 `view === 'knowledge' ? <KnowledgeBase /> : ...` 分支。

- [ ] **Step 2: 全量回归** — `npm test`(116 + 新增全绿);`npx tsc --noEmit`(server + web,均 0);`npm run build --workspace=apps/web`(成功)。

- [ ] **Step 3: 真机冒烟**(用户参与)
- `npm run dev`;手动:新增一条 → 列表/搜索/标签筛选 → 「今日复习」翻卡自评(记住了/没记住,确认间隔推进)→ 到模拟面试/项目深挖跑一轮弱题 → 结束页「存入知识库」→ 回知识库确认已导入且去重。
- 深浅色各扫一眼(遗留待优化点不阻塞)。

- [ ] **Step 4: 提交 + 上库**(验证无误后)
```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): 导航接入知识库"
git push -u origin feat/knowledge-base
# 测试通过 + tsc 干净 + build 成功后,按项目约定合并 main
```

---

## 完成标准(Definition of Done)

- 全量 `npm test` 绿(现有 116 + 知识库新增:shared 4 / repo 6 / routes 2 / Markdown 2 / KnowledgeBase 3 / 导入 2)。
- `npx tsc --noEmit`(server + web)0 error;`apps/web` build 成功。
- 本模块**零 AI 调用**;SQLite 全参数化;Markdown 受控(无 rawHTML)。
- 真机冒烟:三条来源(导入/手动/复习)闭环跑通,去重生效。
- feat/knowledge-base push 并按约定合并 main。
<!-- APPEND-MARKER-6 -->


