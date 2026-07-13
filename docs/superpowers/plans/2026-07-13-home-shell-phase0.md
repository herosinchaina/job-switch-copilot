# Phase 0 首页壳层与模块大厅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地暗色作战台设计系统、左侧侧栏壳、默认「模块大厅」首页（均等宫格 + 悬停放大），不重排各子页业务 IA。

**Architecture:** 在现有 `view` 状态机上把顶栏导航换成 `Sidebar` + 细顶栏；`Dashboard` 重写为模块大厅（复用 `api.dashboard` 与 `computeReadiness`）；CSS 变量切到 Champagne 作战台令牌。分支 `feat/dashboard-stats` 已有部分 WIP（`Sidebar.tsx`、`App.tsx` 侧栏骨架、`api.dashboard`、server dashboard 路由）——**对齐规格后完成，禁止另起一套品牌名（如 OfferPilot）或固定主推大块**。

**Tech Stack:** React 19 + Vite + Tailwind 3 + lucide-react；vitest + @testing-library/react；Express dashboard API（已有 WIP）。

## Global Constraints

- 规格源：`docs/superpowers/specs/2026-07-13-home-shell-redesign-design.md`
- 品牌文案：**AI 求职操作系统**（侧栏主标题）；副标题可用 `Offer Ops Console`
- 首页签名交互：默认均等；**悬停/焦点哪个放大哪个**；禁止固定「今日推荐」大块
- Phase 0 **不**重写简历/面试等子页 IA；只换壳与令牌
- 尊重 `prefers-reduced-motion`（取消 scale，仅改边框/背景）
- 默认 `view = 'dashboard'`（大厅）；侧栏该项 label = **模块大厅**
- 测试：`npm test --workspace=apps/web`；类型：`npm run build --workspace=apps/web`
- 每任务独立 commit；不 push / 不 merge 除非用户明确要求
- 勿提交 `.superpowers/`；勿把无关 WIP 打进与本任务无关的 commit

---

## File Structure

- `apps/web/src/index.css` — Void/Champagne 令牌、字体、氛围、hub-tile motion
- `apps/web/tailwind.config.js` — 已有 semantic colors；按需补 `cyan`/`violet` 或用 arbitrary values
- `apps/web/src/components/Sidebar.tsx` — 侧栏（对齐规格品牌与「模块大厅」）；底部主题 + 导出
- `apps/web/src/components/Sidebar.test.tsx` — 侧栏导航测试
- `apps/web/src/App.tsx` — 侧栏壳 + 细顶栏 + 默认 dashboard
- `apps/web/src/pages/Dashboard.tsx` — 重写为模块大厅（悬停放大）
- `apps/web/src/pages/Dashboard.test.tsx` — 重写为大厅行为测试
- `apps/web/src/api.ts` — 保留 `api.dashboard()`（WIP 已有）
- `apps/server/src/routes/dashboard.ts` + `repo`/`index` — 确保 `/api/dashboard` 可用（WIP 已有则对齐测试）

---

### Task 1: 作战台设计令牌与字体

**Files:**
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/index.html`（若需 Google Fonts link；否则仅 CSS `@import`）
- Modify: `apps/web/tailwind.config.js`（仅当要加 `fontFamily` 扩展时）

**Interfaces:**
- Consumes: 现有 `rgb(var(--*) / <alpha-value>)` Tailwind 映射
- Produces: dark 源令牌 — `--bg`≈`10 14 26`、`--accent`≈`217 184 119`、`--accent-hover`≈`232 207 154`、`--text`≈`238 241 247`；html 字体含 Space Grotesk + IBM Plex Mono 回落 PingFang SC；工具类 `.hub-tile` / `.hub-tile:hover` / `.ops-atmosphere`

- [ ] **Step 1: 写失败的视觉契约测试（CSS 令牌存在性）**

Create: `apps/web/src/index.css.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

describe('ops-console tokens', () => {
  it('loads Space Grotesk and IBM Plex Mono', () => {
    expect(css).toMatch(/Space\+Grotesk|Space Grotesk/)
    expect(css).toMatch(/IBM\+Plex\+Mono|IBM Plex Mono/)
    expect(css).not.toMatch(/family=Inter/)
  })
  it('uses champagne accent in dark theme', () => {
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--accent:\s*217\s+184\s+119/)
  })
  it('defines hub-tile hover lift with reduced-motion escape', () => {
    expect(css).toMatch(/\.hub-tile:hover/)
    expect(css).toMatch(/prefers-reduced-motion/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- src/index.css.test.ts`
Expected: FAIL（仍引用 Inter / indigo accent / 无 hub-tile）

- [ ] **Step 3: 实现令牌**

替换 `apps/web/src/index.css` 顶部为（保留 skeleton / fade-up，更新令牌与字体）：

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: 250 250 252;
  --bg-2: 244 246 251;
  --surface: 255 255 255;
  --surface-2: 248 250 252;
  --border: 226 232 240;
  --border-strong: 203 213 225;
  --text: 15 23 42;
  --text-muted: 100 116 139;
  --text-faint: 148 163 184;
  --accent: 194 160 95;
  --accent-hover: 217 184 119;
  --accent-soft: 245 236 214;
  --success: 16 185 129;
  --danger: 220 38 38;
  --warn: 217 119 6;
  --ring: 217 184 119;
}
.dark {
  --bg: 10 14 26;
  --bg-2: 7 10 18;
  --surface: 18 24 38;
  --surface-2: 24 31 48;
  --border: 38 45 60;
  --border-strong: 55 65 85;
  --text: 238 241 247;
  --text-muted: 152 160 179;
  --text-faint: 95 104 128;
  --accent: 217 184 119;
  --accent-hover: 232 207 154;
  --accent-soft: 42 36 24;
  --success: 126 207 160;
  --danger: 226 154 164;
  --warn: 227 193 105;
  --ring: 217 184 119;
}

html {
  font-family: 'Space Grotesk', 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif;
}
body { background: rgb(var(--bg)); color: rgb(var(--text)); }
.font-mono-data {
  font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}

.ops-atmosphere {
  background:
    radial-gradient(1000px 560px at 12% -10%, rgba(40, 58, 110, 0.45), transparent 60%),
    radial-gradient(820px 560px at 100% 0%, rgba(217, 184, 119, 0.08), transparent 55%),
    rgb(var(--bg));
}
.ops-atmosphere::before {
  content: '';
  pointer-events: none;
  position: fixed;
  inset: 0;
  opacity: 0.4;
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0);
  background-size: 28px 28px;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), transparent 70%);
  z-index: 0;
}

.hub-tile {
  transform-origin: center;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.22s ease, box-shadow 0.28s ease, background 0.22s ease, opacity 0.22s ease;
}
.hub-tile:hover,
.hub-tile:focus-visible {
  transform: scale(1.08);
  z-index: 3;
}
.hub-grid:has(.hub-tile:hover) .hub-tile:not(:hover),
.hub-grid:has(.hub-tile:focus-visible) .hub-tile:not(:focus-visible) {
  opacity: 0.55;
}
@media (prefers-reduced-motion: reduce) {
  .hub-tile { transition: border-color 0.15s ease, background 0.15s ease; }
  .hub-tile:hover,
  .hub-tile:focus-visible { transform: none; }
}

/* 保留既有 skeleton / fade-up / theme transition */
```

把既有 skeleton、fade-up、theme transition 块接在后面（不要删掉）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- src/index.css.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/src/index.css.test.ts apps/web/tailwind.config.js apps/web/index.html
git commit -m "$(cat <<'EOF'
feat(web): 切换暗色作战台令牌与 hub-tile 悬停动效

EOF
)"
```

---

### Task 2: Sidebar 对齐规格（品牌 + 模块大厅 + 底栏操作）

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`（WIP 已存在则改，勿另建）
- Create: `apps/web/src/components/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `NavId`；`useTheme` 的 `dark`/`toggle`（在 Sidebar 内调用或由 props 传入——推荐 props 便于测）
- Produces:
  - `export type NavId = 'dashboard' | 'resume' | 'interview' | 'deepdive' | 'knowledge' | 'errorbook' | 'leetcode'`
  - `export function Sidebar(props: { view: NavId; onNavigate: (id: NavId) => void; dark: boolean; onToggleTheme: () => void; badges?: Partial<Record<NavId, number>> }): JSX.Element`
  - 品牌主文案 `AI 求职操作系统`；dashboard 项 label `模块大厅`
  - 底部：导出 `/api/export` + 主题切换按钮

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows product brand and module hub label', () => {
    const { getByText } = render(
      <Sidebar view="dashboard" onNavigate={vi.fn()} dark onToggleTheme={vi.fn()} />,
    )
    expect(getByText('AI 求职操作系统')).toBeTruthy()
    expect(getByText('模块大厅')).toBeTruthy()
  })
  it('navigates when a module is clicked', () => {
    const onNavigate = vi.fn()
    const { getByText } = render(
      <Sidebar view="dashboard" onNavigate={onNavigate} dark onToggleTheme={vi.fn()} />,
    )
    fireEvent.click(getByText('简历大师'))
    expect(onNavigate).toHaveBeenCalledWith('resume')
  })
  it('marks current view with aria-current', () => {
    const { getByText } = render(
      <Sidebar view="interview" onNavigate={vi.fn()} dark onToggleTheme={vi.fn()} />,
    )
    expect(getByText('模拟面试').closest('button')?.getAttribute('aria-current')).toBe('page')
  })
  it('toggles theme from footer control', () => {
    const onToggleTheme = vi.fn()
    const { getByLabelText } = render(
      <Sidebar view="dashboard" onNavigate={vi.fn()} dark onToggleTheme={onToggleTheme} />,
    )
    fireEvent.click(getByLabelText('切换到浅色模式'))
    expect(onToggleTheme).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- src/components/Sidebar.test.tsx`
Expected: FAIL（品牌为 OfferPilot 或缺主题 props）

- [ ] **Step 3: 实现 Sidebar**

关键点（完整实现时保留现有激活态香槟样式）：

```tsx
export type NavId = 'dashboard' | 'resume' | 'interview' | 'deepdive' | 'knowledge' | 'errorbook' | 'leetcode'

const OVERVIEW = [{ id: 'dashboard' as const, label: '模块大厅', icon: LayoutDashboard }]
const MODULES = [
  { id: 'resume' as const, label: '简历大师', icon: FileText },
  { id: 'interview' as const, label: '模拟面试', icon: MessagesSquare },
  { id: 'deepdive' as const, label: '项目深挖', icon: Layers },
  { id: 'knowledge' as const, label: '知识库', icon: BookMarked },
  { id: 'errorbook' as const, label: '错题本', icon: Target },
  { id: 'leetcode' as const, label: '算法学习', icon: Code2 },
]

export function Sidebar({ view, onNavigate, dark, onToggleTheme, badges }: {
  view: NavId
  onNavigate: (id: NavId) => void
  dark: boolean
  onToggleTheme: () => void
  badges?: Partial<Record<NavId, number>>
}) {
  // brand: AI 求职操作系统 / Offer Ops Console
  // footer: <a href="/api/export">导出数据</a> + theme button
  // aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
}
```

删除硬编码用户名片「Vakas / OfferPilot」（规格未要求）；底部只放导出 + 主题。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- src/components/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/components/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 侧栏对齐规格品牌与模块大厅入口

EOF
)"
```

---

### Task 3: App 壳层接入侧栏（默认进大厅）

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.shell.test.tsx`（轻量壳测试；若过重可只测默认 view 通过导出的小 helper——推荐直接测渲染）

**Interfaces:**
- Consumes: `Sidebar`, `useTheme`, 现有各 page
- Produces: 默认 `useState<NavId>('dashboard')`；布局 `lg:grid-cols-[248px_1fr]`；细顶栏显示当前模块名；主区渲染不变

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import App from './App'
import { api } from './api'

beforeEach(() => {
  vi.spyOn(api, 'dashboard').mockResolvedValue({
    resume: { hasData: false, hrScore: null, interviewerScore: null },
    algorithm: { total: 0, mastered: 0, learning: 0 },
    knowledge: { total: 0, due: 0, mastered: 0 },
    interview: { count: 0, avgScore: null },
    deepdive: { count: 0, avgScore: null },
    errorbook: { total: 0, pending: 0, conquered: 0 },
  } as any)
  vi.spyOn(api, 'health').mockResolvedValue({ cli: { ok: true, detail: '' } } as any)
})

describe('App shell', () => {
  it('defaults to module hub and shows sidebar brand', async () => {
    const { findByText, getAllByText } = render(<App />)
    expect(await findByText('AI 求职操作系统')).toBeTruthy()
    expect(getAllByText('模块大厅').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- src/App.shell.test.tsx`
Expected: FAIL 或仍默认 resume / 无侧栏品牌

- [ ] **Step 3: 接线 App**

要点：

```tsx
import { useTheme } from './theme'
import { Sidebar, type NavId } from './components/Sidebar'

const TITLES: Record<NavId, string> = {
  dashboard: '模块大厅', resume: '简历大师', interview: '模拟面试',
  deepdive: '项目深挖', knowledge: '知识库', errorbook: '错题本', leetcode: '算法学习',
}

export default function App() {
  const { dark, toggle } = useTheme()
  const [view, setView] = useState<NavId>('dashboard')
  function nav(id: NavId) { setGuideFor(null); setView(id) }
  return (
    <div className="ops-atmosphere relative grid h-dvh grid-cols-1 lg:grid-cols-[248px_1fr]">
      <div className="relative z-10 hidden h-dvh lg:block">
        <Sidebar view={view} onNavigate={nav} dark={dark} onToggleTheme={toggle} />
      </div>
      <div className="relative z-10 flex min-w-0 flex-col overflow-hidden">
        <header className="..."> {/* 面包屑/标题 TITLES[view]；小屏可放简易 nav 或菜单按钮 */} </header>
        <CliBanner />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          {view === 'dashboard' ? <Dashboard onNavigate={nav} /> : /* 现有分支 */ null}
        </main>
      </div>
    </div>
  )
}
```

移动端：`lg:hidden` 顶栏增加模块选择（`<select>` 或横向 scroll chips）以保证可用——最小实现用 `<select value={view} onChange=...>`。

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/web -- src/App.shell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.shell.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): App 接入侧栏壳并默认进入模块大厅

EOF
)"
```

---

### Task 4: 模块大厅（悬停放大）重写 Dashboard

**Files:**
- Modify: `apps/web/src/pages/Dashboard.tsx`
- Modify: `apps/web/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `api.dashboard()`；`onNavigate?: (id: NavId) => void`（含或不含 `dashboard` 均可，但点击模块不要传 `dashboard`）
- Produces:
  - 顶行：`模块大厅` + `准备度 NN%`（`font-mono-data`）；失败时 `准备度 —` 且宫格仍可点
  - 6 tile：resume / interview / deepdive / knowledge / errorbook / leetcode
  - class：`hub-grid` + 每格 `hub-tile`
  - 导出/保留 `computeReadiness(s: Stats): number`（供顶栏百分比）

进度条映射（示例，可微调但测试要锁行为）：

```ts
function tileProgress(s: Stats, id: Exclude<NavId, 'dashboard'>): number {
  switch (id) {
    case 'resume': return s.resume.hasData ? Math.round(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2) : 0
    case 'interview': return Math.min(100, s.interview.count * 25)
    case 'deepdive': return Math.min(100, s.deepdive.count * 25)
    case 'knowledge': return s.knowledge.total ? Math.round((s.knowledge.mastered / s.knowledge.total) * 100) : 0
    case 'errorbook': return s.errorbook.total ? Math.round((s.errorbook.conquered / s.errorbook.total) * 100) : 0
    case 'leetcode': return s.algorithm.total ? Math.round((s.algorithm.mastered / s.algorithm.total) * 100) : 0
  }
}
```

- [ ] **Step 1: 重写失败测试（替换旧 Hero/雷达断言）**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { api } from '../api'

const stats = {
  resume: { hasData: true, hrScore: 85, interviewerScore: 65 },
  algorithm: { total: 100, mastered: 12, learning: 5 },
  knowledge: { total: 8, due: 3, mastered: 2 },
  interview: { count: 2, avgScore: 70 },
  deepdive: { count: 1, avgScore: 31 },
  errorbook: { total: 4, pending: 1, conquered: 3 },
}

beforeEach(() => { vi.spyOn(api, 'dashboard').mockResolvedValue(stats as any) })

describe('Module hub (Dashboard)', () => {
  it('shows readiness percent and six equal module tiles', async () => {
    const { findByText, getByText } = render(<Dashboard />)
    expect(await findByText(/模块大厅/)).toBeTruthy()
    expect(getByText(/准备度/)).toBeTruthy()
    for (const name of ['简历大师', '模拟面试', '项目深挖', '知识库', '错题本', '算法学习']) {
      expect(getByText(name)).toBeTruthy()
    }
  })
  it('navigates when a tile is clicked', async () => {
    const onNavigate = vi.fn()
    const { findByText } = render(<Dashboard onNavigate={onNavigate} />)
    fireEvent.click(await findByText('简历大师'))
    expect(onNavigate).toHaveBeenCalledWith('resume')
  })
  it('keeps tiles clickable when stats fail', async () => {
    vi.spyOn(api, 'dashboard').mockRejectedValue(new Error('boom'))
    const onNavigate = vi.fn()
    const { findByText, getByText } = render(<Dashboard onNavigate={onNavigate} />)
    expect(await findByText(/准备度\s*—/)).toBeTruthy()
    fireEvent.click(getByText('模拟面试'))
    expect(onNavigate).toHaveBeenCalledWith('interview')
  })
  it('applies hub-tile class for hover lift CSS', async () => {
    const { findByText } = render(<Dashboard />)
    const tile = (await findByText('简历大师')).closest('.hub-tile')
    expect(tile).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- src/pages/Dashboard.test.tsx`
Expected: FAIL（仍是综合准备度 Hero）

- [ ] **Step 3: 重写 Dashboard UI**

结构草图：

```tsx
export function Dashboard({ onNavigate }: { onNavigate?: (id: NavId) => void }) {
  // load api.dashboard；error 时 readinessLabel = '—'，s = null 仍渲染 tiles
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">模块大厅</h1>
        <p className="font-mono-data text-sm text-muted">准备度 <span className="text-accent-hover">{label}</span></p>
      </div>
      <div className="hub-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map(t => (
          <button key={t.id} type="button" className={`hub-tile ...`} onClick={() => onNavigate?.(t.id)}>
            <div className="label">{t.label}</div>
            <div className="hint opacity-0 ... group-hover:opacity-100">{t.hint(s)}</div>
            <div className="bar"><i style={{ width: `${tileProgress(s, t.id)}%` }} /></div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

删除大 Hero 环、能力雷达、「继续训练」主 CTA（规格：大厅非指挥台 Hero）。`computeReadiness` 逻辑可从现文件保留。

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/web -- src/pages/Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Dashboard.tsx apps/web/src/pages/Dashboard.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 模块大厅均等宫格与悬停放大

EOF
)"
```

---

### Task 5: 打通 / 校验 dashboard API（若 WIP 未绿）

**Files:**
- Modify/Verify: `apps/server/src/routes/dashboard.ts`
- Modify/Verify: `apps/server/src/db/repo.ts`（`dashboardStats` 或等价）
- Modify/Verify: `apps/server/src/index.ts` 注册路由
- Test: `apps/server/src/db/repo.test.ts` 或新建 `apps/server/src/routes/dashboard.test.ts`

**Interfaces:**
- Produces: `GET /api/dashboard` → 与 `api.dashboard` 类型一致的 JSON

- [ ] **Step 1: 若尚无测试，写 repo/路由测试断言返回六块字段**

```ts
it('dashboardStats returns six module blocks', () => {
  const s = dashboardStats(db)
  expect(s).toHaveProperty('resume')
  expect(s).toHaveProperty('algorithm')
  expect(s).toHaveProperty('knowledge')
  expect(s).toHaveProperty('interview')
  expect(s).toHaveProperty('deepdive')
  expect(s).toHaveProperty('errorbook')
})
```

- [ ] **Step 2: Run server tests；失败则补齐实现**

Run: `npm test --workspace=apps/server -- dashboard`
Expected: PASS

- [ ] **Step 3: Commit（仅当有改动）**

```bash
git add apps/server/src/routes/dashboard.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts apps/server/src/index.ts apps/web/src/api.ts
git commit -m "$(cat <<'EOF'
feat(server): 提供 /api/dashboard 摘要供模块大厅消费

EOF
)"
```

若 WIP 已通过测试且类型已对齐，本任务可勾选并注明「无代码变更」。

---

### Task 6: 全量回归 + 手工验收清单

**Files:** 无强制代码；必要时修测试脆性

- [ ] **Step 1: 跑前端测试**

Run: `npm test --workspace=apps/web`
Expected: PASS

- [ ] **Step 2: 跑构建**

Run: `npm run build --workspace=apps/web`
Expected: `tsc` + vite build 成功

- [ ] **Step 3: 手工核对（开发者自检）**

1. 打开应用默认是模块大厅  
2. 悬停各 tile 放大，移开恢复均等  
3. 侧栏可进所有模块且功能仍可用  
4. 主题切换 + 导出仍可用  
5. `prefers-reduced-motion` 下无 scale  

- [ ] **Step 4: Commit 仅修复项（若有）**

```bash
git commit -m "$(cat <<'EOF'
test(web): 修复 Phase 0 壳层回归问题

EOF
)"
```

---

## Spec coverage self-check

| Spec 项 | Task |
|---|---|
| 作战台色板/字体 | Task 1 |
| 悬停放大 CSS + reduced-motion | Task 1 + 4 |
| 左侧侧栏 + 品牌 | Task 2 |
| 默认落地大厅 | Task 3 |
| 准备度顶栏点缀 | Task 4 |
| 均等宫格无固定主推 | Task 4 |
| 复用 dashboard 数据 | Task 4–5 |
| 子页 IA 不动 | 全局约束 / 无对应改写任务 |
| 主题 + 导出 | Task 2–3 |

## Placeholder scan

无 TBD/TODO；测试与命令均为可执行内容。

## Type consistency

- `NavId` 唯一定义于 `Sidebar.tsx` 并导出；App/Dashboard 自此处或本地 `Exclude` 引用
- `api.dashboard` 返回形状与 Task 4 mock / server 一致
