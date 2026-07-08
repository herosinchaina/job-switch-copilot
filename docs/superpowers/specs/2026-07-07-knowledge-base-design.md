# 模块三设计:知识库(差题沉淀 + 手动新增 + 艾宾浩斯复习)

- 日期:2026-07-07
- 状态:待评审
- 范围:新模块。长期知识积累中心。消费模块四/五沉淀的 `is_weak` 差题 + 手动新增条目 + 艾宾浩斯自评复习。冷启动已由模块四/五在打标差题解决。

## 1. 定位

知识库是**沉淀 + 复习**中心,不是出题引擎(出题归模块四/五,避免"怎么又是这些题")。三条来源汇入一张统一表:

1. **差题导入**:模块四模拟面试 / 模块五项目深挖结束后,把 `is_weak` 的问答(问题 + 用户原答 + 更优答法)一键存入知识库。
2. **手动新增**:用户手写「问题 + 答案 + 标签 + Markdown 笔记」。
3. **艾宾浩斯复习**:每条目带 `review_due`,「今日复习」列出到期项;复习流程 = 看题→回忆→看答案→**自评「记住了/没记住」**→答对拉长间隔、答错重置。

**明确不做**(本阶段):AI 主动出题、AI 评分复习、AI 自动聚类到知识点树。标签为手动先行。

## 2. 顶层约束(沿用全项目)

- AI **本模块零调用**——纯 CRUD + 本地间隔算法,无 `AiProvider` 依赖(轻量,也最稳)。
- SQLite 全程参数化;多步写(如导入去重 + 插入)用 `transaction`。
- 后端只绑 127.0.0.1;条目内容(来自 AI 生成的 betterAnswer / 用户输入)当不可信数据,前端经**受控 Markdown 渲染**(见 §7,必须 sanitize,禁 HTML 透传)。
- TypeScript 严格模式;纯新增,不破坏现有测试与流程。
- 时间统一存 ISO 文本(`datetime('now')` 或计算后的 UTC ISO),与现有表一致。

## 3. 数据模型(SQLite,新建单表)

```
knowledge_items
  id INTEGER PK AUTOINCREMENT
  question TEXT NOT NULL              -- 题目 / 知识点问题
  answer TEXT                         -- 用户原答(导入差题时来自 turn.answer;手动可空)
  reference TEXT                      -- 标准答案 / 更优答法(导入时来自 feedback.betterAnswer)
  tags TEXT NOT NULL DEFAULT '[]'     -- 知识点标签,JSON 字符串数组
  source TEXT NOT NULL                -- 'interview' | 'deepdive' | 'manual'
  source_ref TEXT                     -- 来源 turn 的 id(interview_turns / project_deepdive_turns),手动为空
  note TEXT                           -- 用户手动补充,Markdown
  mastery INTEGER NOT NULL DEFAULT 0  -- 掌握度 0(未掌握)~5(已掌握)
  review_due TEXT NOT NULL            -- 下次复习时间(ISO);新建即置为"今天"→立即可复习
  review_interval INTEGER NOT NULL DEFAULT 0  -- 当前间隔天数(0=未复习过)
  review_count INTEGER NOT NULL DEFAULT 0     -- 已复习次数
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
```

- **去重**:导入按 `(source, source_ref)` 唯一。用部分唯一索引实现(仅当 source_ref 非空时约束):
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS ux_ki_source_ref
    ON knowledge_items(source, source_ref) WHERE source_ref IS NOT NULL;
  ```
  重复导入同一 turn 时静默跳过(不覆盖用户后来的编辑)。
- migration 追加到 `db/connection.ts` `migrate()` 末尾,`CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`,向后兼容。

## 4. 复习间隔算法(自评驱动,无 AI)

固定阶梯,存于服务层常量:

```
INTERVALS = [1, 2, 4, 7, 15, 30]   // 天;下标 = review_count 阶段
```

自评两态:

- **记住了(`remembered`)**:`review_count += 1`;`review_interval = INTERVALS[min(review_count, len-1)]`;`review_due = 今天 + interval 天`;`mastery = min(5, mastery + 1)`。
- **没记住(`forgot`)**:`review_count = 0`;`review_interval = 1`;`review_due = 明天`(不设为今天,避免同日无限循环);`mastery = max(0, mastery - 1)`。

「到期」判定:`review_due <= 今天(本地日界)`。为规避时区/时刻边界,统一按**日期(YYYY-MM-DD)**比较:`date(review_due) <= date('now','localtime')`。

## 5. 共享数据模型(packages/shared)

新增 `knowledge.ts`,`index.ts` 追加 `export * from './knowledge'`:

```ts
export const KNOWLEDGE_SOURCES = ['interview', 'deepdive', 'manual'] as const
export type KnowledgeSource = typeof KNOWLEDGE_SOURCES[number]

// 手动新增 / 编辑的输入
export const KnowledgeItemInputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().default(null),
})
export type KnowledgeItemInput = z.infer<typeof KnowledgeItemInputSchema>

// 完整条目(读出)
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

- 附单测:input/item schema 校验 + mastery/source 范围。

## 6. 后端

### 数据层 `db/repo.ts` 新增

- `createKnowledgeItem(db, input & { source, sourceRef }): number` — 新建;`review_due` 置为今天(立即可复习),`review_interval=0`、`review_count=0`、`mastery=0`;tags JSON 序列化。
- `importWeakItem(db, { source, sourceRef, question, answer, reference }): number | null` — 带去重的导入(INSERT OR IGNORE 语义);已存在返回 null / 已存在 id。
- `getKnowledgeItem(db, id)` / `updateKnowledgeItem(db, id, input)`(改 question/answer/reference/tags/note,不动复习字段,更新 updated_at) / `deleteKnowledgeItem(db, id)`。
- `listKnowledgeItems(db, filter)` — filter = `{ source?, tag?, mastery?, q? }`;`q` 用 SQLite `LIKE '%q%'`(参数化)命中 question/answer/reference/note;返回按 updated_at DESC。
- `listDueItems(db)` — `date(review_due) <= date('now','localtime')` 且 status 不限,按 review_due 升序。
- `reviewKnowledgeItem(db, id, grade)` — 按 §4 算法更新 review_* + mastery + updated_at,`transaction` 包裹读改写。
- `listAllTags(db)` — 聚合去重标签(供筛选下拉);从各行 tags JSON 解析合并。
- `knowledgeStats(db)` — `{ total, due, mastered }`(mastered = mastery>=5),供 Dashboard/入口角标。
- **差题来源读取**:复用现有 `listTurns` / `listDeepdiveTurns` 取 `isWeak` 项(question/answer/feedback.better|betterAnswer)。导入路由据此构造 `importWeakItem`。
- `exportAll` 追加 `knowledgeItems: SELECT * FROM knowledge_items`。

行 → 对象映射统一走一个 `rowToKnowledgeItem`(tags JSON.parse、is 字段转换),经 `KnowledgeItemSchema.parse` 兜底。

### 路由 `routes/knowledge.ts`(挂载 `/api/knowledge`,index.ts 注册 `knowledgeRouter`)

- `GET /api/knowledge` — query `source/tag/mastery/q` → `listKnowledgeItems`。
- `POST /api/knowledge` — body `KnowledgeItemInput`,zod 校验 → `createKnowledgeItem(source='manual', sourceRef=null)` → 返回新条目。
- `GET /api/knowledge/:id` → 单条(404)。
- `PUT /api/knowledge/:id` — 编辑(404 / zod 校验)→ 返回更新后条目。
- `DELETE /api/knowledge/:id` → `{ ok: true }`(404)。
- `GET /api/knowledge/due` — 今日到期列表(注意路由顺序:`/due` 须在 `/:id` 之前注册,避免被当成 id)。
- `POST /api/knowledge/:id/review` — body `{ grade: 'remembered'|'forgot' }`,zod 校验 → `reviewKnowledgeItem` → 返回更新后条目。
- `GET /api/knowledge/tags` → 全部标签(同样先于 `/:id`)。
- `POST /api/knowledge/import` — body `{ from: 'interview'|'deepdive', sessionId: number }`:读该 session 的 `is_weak` turns,逐条 `importWeakItem`,`transaction` 包裹 → 返回 `{ imported: number, skipped: number }`(skipped = 已存在被去重的)。
  - interview 来源:`source='interview'`,`sourceRef=String(turn.id)`,reference 取 `feedback.better`。
  - deepdive 来源:`source='deepdive'`,reference 取 `feedback.betterAnswer`。

路由内不碰 AI;所有写走 repo + transaction。

## 7. 前端

### `api.ts` 新增

`listKnowledge(filter)`、`createKnowledge(input)`、`getKnowledge(id)`、`updateKnowledge(id,input)`、`deleteKnowledge(id)`、`listDue()`、`reviewKnowledge(id,grade)`、`listKnowledgeTags()`、`importKnowledge({from,sessionId})`。类型引用 `@aios/shared` 的 `KnowledgeItem` / `KnowledgeItemInput` / `ReviewGrade`。

### Markdown 渲染(受控 + sanitize)

web 现无 Markdown 依赖。新增 `react-markdown` + `remark-gfm`,**不启用** `rehype-raw`(即默认不透传原始 HTML,天然防 XSS)。封装一个 `components/Markdown.tsx`:固定 `react-markdown` + `remark-gfm`,限制可渲染元素,禁用 HTML。answer/reference/note 三处统一走它。依赖以固定版本 pin。

### 新页 `pages/KnowledgeBase.tsx`

顶部两个 Tab:**「知识库」**(列表管理) 与 **「今日复习」**(艾宾浩斯)。

**知识库 Tab:**
- 顶部工具条:关键词搜索框 + 来源筛选(全部/模拟面试/项目深挖/手动) + 标签筛选(来自 `listKnowledgeTags`) + 掌握度筛选 + 「新增条目」按钮。
- 列表:卡片/行展示 question(截断)+ 标签 chips + 来源徽标 + 掌握度进度(0-5 点)+ `review_due`。点开看 answer/reference/note(纯文本 / 受控 Markdown)。
- 「新增/编辑」表单:question(必填)、answer、reference、tags(逗号分隔或 chip 输入)、note(Markdown textarea)。source 固定 manual。
- 删除有二次确认。
- **空状态**:无条目时提示「去『模拟面试』或『项目深挖』做几轮,答得不好的题会自动可导入这里,或点『新增条目』手写一条」。

**今日复习 Tab:**
- 顶部显示到期数量;无到期时显示「今天没有需要复习的条目 🎉」。
- **单张翻卡逐条过**:一次只显示一张卡。先只显示 question + 「显示答案」按钮;点开后展示 answer(用户原答)+ reference(更优答法)+ note(经受控 Markdown 渲染);底部两键 **「记住了」/「没记住」**。
- 提交自评 → 调 `reviewKnowledge` → 自动进入下一张到期卡;全部复习完显示完成态(本次复习了 N 张)。

### 导入入口(改动模块四/五结束页)

- 模块四模拟面试报告页、模块五项目深挖知识地图页的「本次薄弱问题」区块,新增按钮 **「一键存入知识库」** → 调 `importKnowledge({from, sessionId})` → toast 显示「已存入 N 条(M 条已存在)」。轻改动,不重构原页。

### 导航

顶部导航新增 **「知识库」**(icon 如 `BookMarked` / `Library`,lucide),`view='knowledge'`,渲染 `KnowledgeBase`。知识库不依赖 confirmed 简历(手动新增/复习独立可用),故无前置门槛。

## 8. 测试

- **shared**:`KnowledgeItemInputSchema` / `KnowledgeItemSchema` 校验(必填 question、mastery/source 范围、tags 默认空数组)。
- **数据层**:create→get round-trip;update 不动复习字段;`listKnowledgeItems` 各 filter(source/tag/mastery/q LIKE);`listDueItems` 日界比较(due=今天 命中、due=明天 不命中);`reviewKnowledgeItem` 记住了(间隔 1→2→4… + mastery+1 + due 推后)/ 没记住(间隔重置 1 + due=明天 + mastery-1);`importWeakItem` 去重(重复 source_ref 只进一条);`listAllTags` 去重;`exportAll` 含新表。
- **路由**:CRUD(POST/GET/PUT/DELETE + 404);`/due` 与 `/tags` 不被 `/:id` 吞;`/:id/review` 更新;`/import` 从含 is_weak turns 的假 session 导入(imported/skipped 计数,二次导入全 skipped)。
- **前端(jsdom)**:列表渲染 + 搜索/筛选;新增表单提交;今日复习翻卡(显示答案→自评→下一张);空状态;导入按钮触发 `importKnowledge`。

## 9. 向后兼容

纯新增:一张表 + 一组 repo 函数 + 一个路由 + 一个页面 + 导航项 + 两处结束页加一个按钮。现有表/服务/流程/测试不变;本模块不引入任何 AI 调用。

## 10. 不在本阶段

- AI 自动把标签聚类成知识点树 / 生成知识图谱 → 后置。
- AI 评分式复习、AI 主动出题 → 明确不做(与模块四/五重叠)。
- 错题本视图(可视作知识库的一个筛选视图)→ 模块六。
- 跨条目能力画像 → 模块七 AI Coach。
