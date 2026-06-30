# 模块一设计:LeetCode Hot100 学习(最小闭环)

- 日期:2026-06-30
- 状态:待评审
- 范围:新模块。完整 Hot100 题库(元数据,合法)+ AI 多轮引导式讲题(不直接给答案)+ 三态进度跟踪。

## 1. 定位

帮用户系统化学懂 LeetCode Hot100:按专题/难度浏览 100 题 → 选一题 → AI 像老师一样**一步步引导思考**(考点→暴力→为什么慢→如何优化→模板→复杂度→易错点),而非直接给题解 → 标记掌握度 → 看进度。

价值在「真正学懂算法思想」,不在复制题面。

## 2. 版权与数据边界(重要)

**只存合法的元数据 + 我们整理的核心思路,绝不存 LeetCode 官方题面正文。**
- 种子题库 `hot100.json`(已从用户提供的整理文档解析,100 题):`leetcodeId, title, difficulty, topic, keyIdea(核心思路关键词), url(官方链接)`。这些是事实信息 + 我方整理,不含官方题面文字。
- 题面正文:用户点 `url` 去 leetcode.cn 官网看。
- AI 引导内容是即时生成的教学引导,不复制官方题解。

## 3. 关键技术决策(已与用户确认)

- **引导式讲题 = 多轮对话(方案 A)**,复用模块四已有的 CLI 会话能力(`startSession`/`continueSession`/`completeJsonSession` + 失败降级到无状态拼 history)。
- **引导对话不评分**(学习非考试):只记录引导过程 Q&A,供回看。与模块四面试的「评分」区别明确。
- 连续学习天数、15 天计划、薄弱点识别、可视化图表 **不在本阶段**。

## 4. 顶层约束(沿用)

- AI 调用经 `AiProvider`;返回结构经校验,失败重试再降级报错。引导每轮输出可以是纯文本(引导语),不必强制 JSON。
- SQLite 全程参数化;后端只绑 127.0.0.1;AI 输出当不可信数据,前端纯文本渲染、不用 `dangerouslySetInnerHTML`。
- TypeScript 严格模式;不破坏现有 82 个测试;纯新增,现有流程不变。
- node:sqlite;`CREATE TABLE IF NOT EXISTS` 迁移 + 种子数据幂等导入(INSERT OR IGNORE)。

## 5. 数据模型(SQLite)

```
lc_problems   -- 种子题库;启动时从 hot100.json 幂等导入(INSERT OR IGNORE,按 leetcode_id)
  leetcode_id INTEGER PRIMARY KEY
  title TEXT NOT NULL
  difficulty TEXT NOT NULL          -- easy | medium | hard
  topic TEXT NOT NULL               -- 哈希/双指针/.../技巧(17 个专题)
  key_idea TEXT NOT NULL
  url TEXT NOT NULL

lc_progress   -- 每题掌握状态
  leetcode_id INTEGER PRIMARY KEY REFERENCES lc_problems(leetcode_id)
  status TEXT NOT NULL              -- new | learning | mastered
  updated_at TEXT

lc_guide_sessions   -- 引导讲题多轮会话
  id INTEGER PK
  leetcode_id INTEGER NOT NULL REFERENCES lc_problems(leetcode_id)
  cli_session_id TEXT               -- 降级时可空
  status TEXT NOT NULL DEFAULT 'active'   -- active | finished
  created_at TEXT

lc_guide_turns
  id INTEGER PK
  session_id INTEGER NOT NULL REFERENCES lc_guide_sessions(id)
  turn_index INTEGER NOT NULL
  question TEXT NOT NULL             -- AI 引导语
  answer TEXT                        -- 用户思考(出题时空,作答后回填)
  created_at TEXT
```
> 进度的「未学」是隐式默认:lc_progress 无记录即视为 new。只有用户标记过才写行。

## 6. 共享数据模型(packages/shared)

新增 `leetcode.ts`:
```ts
DIFFICULTIES = ['easy','medium','hard']      // Difficulty
PROGRESS_STATUSES = ['new','learning','mastered']  // ProgressStatus
LcProblemSchema = { leetcodeId:number, title:string, difficulty:Difficulty, topic:string, keyIdea:string, url:string }
// 引导每轮 AI 输出:引导语 + 是否结束
GuideStepSchema = { guidance:string, done:boolean }   // done=true 表示引导讲解完成
```
- 导出类型 + index.ts 导出 `./leetcode`

## 7. 后端

### 种子导入 `db/seed.ts`
- `seedProblems(db)`:读 `src/data/hot100.json`,`INSERT OR IGNORE` 进 lc_problems(幂等,重启不重复)。`openDb` 后调用。

### 数据层 `db/repo.ts`
- `listProblems(db): Array<LcProblem & { status:ProgressStatus }>`(LEFT JOIN lc_progress,无记录给 'new')
- `getProblem(db, leetcodeId): (LcProblem & {status}) | undefined`
- `setProgress(db, leetcodeId, status): void`(UPSERT lc_progress)
- `progressSummary(db): { total, mastered, learning, byTopic: Array<{topic, total, mastered}> }`
- 引导会话:`createGuideSession/getGuideSession/finishGuideSession/createGuideTurn/answerGuideTurn/listGuideTurns`(类比模块四 repo)
- `exportAll` 增加 lc_progress + 引导表

### 服务 `services/guide.ts`
- `startGuide(ai, problem: LcProblem): { cliSessionId, firstGuidance }` — 开会话,prompt 注入题目(title/difficulty/topic/keyIdea/url)+ 引导人设,产出第一句引导(提问考点/思路,不给答案)。
- `continueGuide(ai, ctx): GuideStep` — 用户输入思考 → AI 推进引导(评点思路 + 下一步引导 or done)。优先 CLI 会话,失败降级拼 history。
- prompt `guide-system.txt` + `guide-step.txt`:循序渐进引导(考点→暴力→为什么慢→如何优化→模板→复杂度→易错点),**绝不直接给完整答案代码**;done 表示已走完引导。

### 路由 `routes/leetcode.ts`
- `GET /api/lc/problems` → 题库列表(含 status)
- `GET /api/lc/summary` → 进度统计
- `PUT /api/lc/problems/:id/progress`(body `{status}`)→ 设置掌握度
- `POST /api/lc/guides`(body `{leetcodeId}`)→ 题不存在 404;startGuide → 建 session + turn0 → `{sessionId, guidance}`
- `POST /api/lc/guides/:id/step`(body `{answer}`)→ session 非 active 409;continueGuide → 回填+建下一 turn(或 finish)→ `{guidance, done}`
- `GET /api/lc/guides/:id` → session + turns(回看)
- 挂载 leetcodeRouter

## 8. 前端

api.ts:`lcProblems()`, `lcSummary()`, `setLcProgress(id,status)`, `startGuide(leetcodeId)`, `stepGuide(sessionId,answer)`, `getGuide(sessionId)`

新页:
- `pages/Leetcode.tsx` — 题库浏览:顶部进度条(完成率)+ 难度筛选;按专题分组(可折叠)列出题目卡片(题号/标题/难度 badge/掌握度);点题进入引导页。
- `pages/LcGuide.tsx` — 引导讲题:聊天式(复用模块四气泡 + Enter 提交 + 自动滚动);顶部题目信息 + "去 LeetCode 做题"外链 + 掌握度切换(new/learning/mastered);AI 引导语 / 用户输入思考往复;done 后提示"本题引导完成"。
- App.tsx 导航加「算法学习」;视图流转 Leetcode ↔ LcGuide。

进度展示:完成率 = mastered/total;各专题 mastered/total 进度条。纯文本渲染。

## 9. 测试

- shared:LcProblem/GuideStep schema 校验;DIFFICULTIES/PROGRESS_STATUSES。
- 种子:seedProblems 幂等(跑两次仍 100 行)。
- 数据层:listProblems 含 status(无记录=new);setProgress UPSERT;progressSummary 计数 + byTopic;引导会话 round-trip。
- 服务:startGuide 出首引导(fake 会话 AI);continueGuide 正常走会话 + 会话失败降级;done=true 路径。
- 路由:GET problems/summary;PUT progress;POST guides(404 未知题)、step(409 非 active);完整一段引导。
- 前端:题库渲染+筛选+进度条(jsdom);引导页首引导→输入→下一步;掌握度切换调 setLcProgress。

## 10. 向后兼容
纯新增表/服务/路由/页面 + 种子导入;现有 82 测试与所有流程不变。AiProvider 会话能力已存在(模块四),本模块直接复用。

## 11. 不在本阶段
15 天学习计划、连续学习天数、薄弱点识别、可视化图表、题目可视化动画(双指针/DFS 等)—— 后续阶段。
