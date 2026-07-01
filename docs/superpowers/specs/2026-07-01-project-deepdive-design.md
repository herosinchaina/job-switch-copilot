# 模块五设计:项目深挖(单项目技术深挖 + 评分 + 知识地图)

- 日期:2026-07-01
- 状态:待评审
- 范围:新模块。锁定简历中的一个项目,像资深技术面试官那样连续追问技术细节,逐轮 5 维评分,结束产出「项目知识地图」+ 差题打标。

## 1. 定位

AI 扮演资深技术面试官,**锁定简历里用户选定的某一个项目**,围绕技术方案/架构/算法/数据/评估/工程落地/性能/异常排查/复盘等方向连续追问,每次只问一个、基于上一答深挖、不放过空泛回答。逐轮按 5 维评分,结束生成结构化「项目知识地图」,答得差的轮次打标沉淀(供后续模块六/三消费)。

复用模块四模拟面试的引擎:CLI 会话(`--session-id`/`--resume`)+ 失败降级 + 轮次硬停 + is_weak 打标。区别在于:**锁定单项目**、**项目专属追问 prompt**、**项目专属 5 维评分**、**产出知识地图**。

## 2. 顶层约束(沿用)

- AI 调用经 `AiProvider`;返回 JSON 一律 zod 校验,失败重试一次再降级报错(`completeJson`/`completeJsonSession`)。
- 多轮上下文优先 CLI 会话,失败降级为无状态拼 history(复用模块四模式)。
- SQLite 全程参数化;多步写用 `transaction`。
- 简历 version 必须 `confirmed`;项目必须存在于该版本 `structured.projects` 中(否则 400/404)。
- 后端只绑 127.0.0.1;AI 输出当不可信数据,前端纯文本渲染。
- 轮次上限默认 8(深挖需要更多轮),夹紧 1–15;每次 AI 调用超时;路由层硬停(达上限即结束出地图,无论 AI 是否还想问)。
- TypeScript 严格模式;不破坏现有 100 个测试;纯新增。
- 追问 prompt 严格围绕简历该项目,不跑题到别的项目、不问脱离项目的纯八股。

## 3. 数据模型(SQLite,与模块四平行新建)

```
project_deepdive_sessions
  id INTEGER PK
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id)
  project_name TEXT NOT NULL          -- 锁定的项目名(取自 structured.projects[].name)
  cli_session_id TEXT                 -- 降级时可空
  max_rounds INTEGER NOT NULL DEFAULT 8
  status TEXT NOT NULL DEFAULT 'active'  -- active | finished
  map_json TEXT                       -- 结束写入 ProjectMap
  created_at TEXT DEFAULT (datetime('now'))

project_deepdive_turns
  id INTEGER PK
  session_id INTEGER NOT NULL REFERENCES project_deepdive_sessions(id)
  turn_index INTEGER NOT NULL
  question TEXT NOT NULL               -- AI 的技术追问
  answer TEXT                          -- 用户回答(出题时空)
  score INTEGER                        -- 本轮总分(5 维之和,0-50),作答后回填
  feedback_json TEXT                   -- 5 维分 + 点评(见 §4 DeepdiveFeedback)
  is_weak INTEGER DEFAULT 0            -- score < 30(满分50的60%)→1
  created_at TEXT
```
> 纯新增两表,向后兼容。

## 4. 共享数据模型(packages/shared)

新增 `deepdive.ts`:
```ts
// 单轮 5 维评分(按用户提供的项目深挖 prompt)
DeepdiveFeedbackSchema = {
  scores: {
    techDepth: number          // 技术理解深度 0-10
    implementationClarity: number  // 实现细节清晰度 0-10
    architectureAwareness: number  // 架构与工程意识 0-10
    metricsAwareness: number   // 指标与评估意识 0-10
    expression: number         // 面试表达质量 0-10
  }
  total: number                // 0-50
  strengths: string[]          // 讲得好的技术点
  vague: string[]              // 过于空泛处
  missingDetails: string[]     // 缺失的关键实现细节
  followUps: string[]          // 面试官可能继续追问什么
  betterAnswer: string         // 更好的技术回答应如何组织
}

// AI 每轮响应:对上一答的评分(首轮 null)+ 下一个技术追问(或结束)
DeepdiveStepSchema = {
  feedback: DeepdiveFeedback | null
  nextQuestion: string | null  // null = 深挖结束
}

// 项目知识地图(结束产出)
ProjectMapSchema = {
  projectName: string
  background: string           // 项目背景
  businessGoal: string         // 业务目标
  techApproach: string         // 技术方案
  personalContribution: string // 个人贡献
  coreChallenges: string[]     // 核心难点
  alternatives: string[]       // 替代方案(为何不用别的)
  evaluation: string           // 效果评估/如何证明
  risks: string[]              // 风险问题/线上排查
  optimizations: string[]      // 可优化方向
  hotQuestions: string[]       // 面试高频追问
  blindSpots: string[]         // 本次暴露的知识盲区
}
```
- 导出类型 + index.ts 导出 `./deepdive`

## 5. 后端

### 服务 `services/deepdive.ts`
- `startDeepdive(ai, { resume, projectName }): { cliSessionId, firstQuestion }` — 开会话,注入项目深挖人设 + 该项目的结构化内容(从 resume.projects 里挑出 projectName 对应项)+ 全简历上下文,产出第一个**直接进技术细节**的追问。
- `answerDeepdive(ai, ctx): DeepdiveStep` — ctx = { cliSessionId, resume, projectName, history, question, answer, turnIndex, maxRounds }。优先会话续接,失败降级拼 history。评本轮 5 维 + 决定下一追问(基于本轮回答连续追问;达上限 nextQuestion=null)。
- `generateMap(ai, { projectName, turns }): ProjectMap` — 基于全部问答生成知识地图(非流式)。

### Prompt 文件(apps/server/src/prompts/)
- `deepdive-system.txt` — 资深技术面试官人设 + 10 个技术追问方向 + 追问范式(只问一个/基于上一答连续追问/不放过空泛回答/直接进技术细节)+ 严格围绕该项目不跑题。**采用用户提供的项目深挖 prompt 内容**(适配为"针对已锁定的单个项目",项目由路由传入而非 AI 自选)。
- `deepdive-step.txt` — 每轮:输出 JSON,含 5 维评分 + 5 项点评 + nextQuestion;done 由 nextQuestion=null 表达。
- `deepdive-map.txt` — 结束产出 ProjectMap 的 JSON 约束。

### 数据层 `db/repo.ts` 新增
- `createDeepdiveSession/getDeepdiveSession/finishDeepdiveSession(map)/createDeepdiveTurn/answerDeepdiveTurn(score,feedback→is_weak)/listDeepdiveTurns/listDeepdiveSessions`(平行模块四)
- `exportAll` 加两表

### 路由 `routes/deepdive.ts`
- `POST /api/deepdives`(body `{versionId, projectName}`):version 不存在 404 / 未 confirmed 409;projectName 必须在 structured.projects 中,否则 400;startDeepdive → 建 session+turn0 → `{sessionId, turnIndex:0, question}`。
- `POST /api/deepdives/:id/answer`(body `{answer}`):非 active 409 / 无待答 turn 409;answerDeepdive → 写 score/feedback/is_weak;硬停(turnIndex+1>=maxRounds 强制结束)→ 若继续建下一 turn,若结束 generateMap + finishSession → `{feedback, nextQuestion, turnIndex, finished, map?}`。
- `GET /api/deepdives/:id` → `{session, turns}`(回看)。
- `GET /api/deepdives` → 历史列表(id/projectName/status/总分或平均分/createdAt)。
- 挂载 deepdiveRouter。

## 6. 前端

api.ts:`listProjects`(从已确认简历取 projects——已有 confirmedStructured,前端直接用,无需新接口)、`startDeepdive({versionId, projectName})`、`answerDeepdive(sessionId, answer)`、`getDeepdive(sessionId)`、`listDeepdives()`。

新页 `pages/ProjectDeepdive.tsx`:
- **选项目**:列出当前 confirmed 简历的 projects(name + role + stack 预览),用户点一个 → 开深挖。也展示历史深挖列表(可回看)。
- **对话区**:聊天式(复用模块四气泡 + Enter 提交 + 自动滚动)。AI 技术追问 / 用户作答;作答后展示本轮 5 维评分卡(雷达或条形)+ 点评(讲得好/空泛/缺失/会追问/更优答法,可折叠)。
- **结束**:展示「项目知识地图」——分区卡片(背景/业务目标/技术方案/个人贡献/难点/替代方案/评估/风险/优化/高频追问/盲区)。
- 入口:顶部导航新增「项目深挖」;需要有 confirmed 简历,否则提示先去简历大师。纯文本渲染。

## 7. 测试

- shared:DeepdiveFeedback/DeepdiveStep/ProjectMap schema 校验(含分数范围)。
- 数据层:session/turns round-trip;is_weak 阈值(score<30);map 写读;exportAll 含新表。
- 服务:startDeepdive 出首问(fake 会话 AI);answerDeepdive 会话正常 + 会话失败降级;generateMap 产出合法地图;maxRounds 到顶。
- 路由:开深挖 409(未 confirmed)/ 400(项目不在简历中);answer 流转(评分→下一问→结束出地图);硬停(AI 仍返回 nextQuestion 时到上限强制结束);GET 列表/回看。
- 前端:选项目→开始→答一轮→看到 5 维评分;结束→知识地图渲染(jsdom)。

## 8. 向后兼容
纯新增表/服务/路由/页面;现有 100 测试与所有流程不变。会话引擎复用模块四,不改动其代码。

## 9. 不在本阶段
跨项目盲区聚合、整体项目表达画像 → 模块七 AI Coach。错题本管理/复习(消费 is_weak)→ 模块六/三。
