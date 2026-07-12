import { LayoutDashboard, FileText, MessagesSquare, Layers, BookMarked, Target, Code2, Sparkles, Download, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavId = 'dashboard' | 'resume' | 'interview' | 'deepdive' | 'knowledge' | 'errorbook' | 'leetcode'

type Item = { id: NavId; label: string; icon: LucideIcon }

const OVERVIEW: Item[] = [
  { id: 'dashboard', label: '模块大厅', icon: LayoutDashboard },
]
const MODULES: Item[] = [
  { id: 'resume', label: '简历大师', icon: FileText },
  { id: 'interview', label: '模拟面试', icon: MessagesSquare },
  { id: 'deepdive', label: '项目深挖', icon: Layers },
  { id: 'knowledge', label: '知识库', icon: BookMarked },
  { id: 'errorbook', label: '错题本', icon: Target },
  { id: 'leetcode', label: '算法学习', icon: Code2 },
]

export function Sidebar({ view, onNavigate, dark, onToggleTheme, badges }: {
  view: NavId
  onNavigate: (id: NavId) => void
  dark: boolean
  onToggleTheme: () => void
  badges?: Partial<Record<NavId, number>>
}) {
  const renderItem = ({ id, label, icon: Icon }: Item) => {
    const active = view === id
    const badge = badges?.[id]
    return (
      <button
        key={id}
        type="button"
        onClick={() => onNavigate(id)}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex cursor-pointer items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left text-[13.5px] font-medium transition-all duration-150 ${
          active
            ? 'border-accent/25 bg-gradient-to-r from-accent/[0.18] to-accent/[0.06] text-accent-hover'
            : 'border-transparent text-muted hover:bg-white/[0.05] hover:text-text'
        }`}
      >
        <Icon size={18} className={`shrink-0 ${active ? 'opacity-100' : 'opacity-75'}`} />
        <span className="flex-1">{label}</span>
        {badge ? (
          <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${active ? 'bg-accent/25 text-accent-hover' : 'bg-warn/15 text-warn'}`}>{badge}</span>
        ) : null}
      </button>
    )
  }

  return (
    <aside className="flex h-full flex-col gap-1 border-r border-border bg-bg/60 px-3.5 py-5 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2 pb-5 pt-1.5">
        <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-accent-hover to-accent shadow-[0_4px_12px_-3px_rgba(217,184,119,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]">
          <Sparkles size={18} className="shrink-0 text-[#1a1408]" />
        </div>
        <div className="leading-tight">
          <b className="block text-[14.5px] font-semibold tracking-tight text-text">AI 求职操作系统</b>
          <span className="text-[11px] font-normal text-faint">Offer Ops Console</span>
        </div>
      </div>

      <div className="px-2.5 pb-1.5 pt-4 text-[11px] font-medium tracking-wide text-faint">总览</div>
      {OVERVIEW.map(renderItem)}
      <div className="px-2.5 pb-1.5 pt-4 text-[11px] font-medium tracking-wide text-faint">训练模块</div>
      {MODULES.map(renderItem)}

      <div className="mt-auto space-y-2 pt-3.5">
        <a
          href="/api/export"
          className="flex items-center gap-3 rounded-[9px] border border-transparent px-3 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          <Download size={18} className="shrink-0 opacity-75" />
          导出数据
        </a>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
          className="flex w-full cursor-pointer items-center gap-3 rounded-[9px] border border-transparent px-3 py-2.5 text-left text-[13.5px] font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          {dark ? <Sun size={18} className="shrink-0 opacity-75" /> : <Moon size={18} className="shrink-0 opacity-75" />}
          {dark ? '浅色模式' : '深色模式'}
        </button>
      </div>
    </aside>
  )
}
