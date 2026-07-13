import { useEffect, useState } from 'react'
import { api } from '../api'
import { FileText, MessagesSquare, Layers, BookMarked, Target, Code2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Stats = Awaited<ReturnType<typeof api.dashboard>>
type NavId = 'resume' | 'leetcode' | 'knowledge' | 'interview' | 'deepdive' | 'errorbook'

type Tile = {
  id: NavId
  label: string
  icon: LucideIcon
  tone: string
  hint: (s: Stats | null) => string
}

const TILES: Tile[] = [
  {
    id: 'resume', label: '简历大师', icon: FileText, tone: '#d9b877',
    hint: (s) => s?.resume.hasData
      ? `质量评分 · HR ${s.resume.hrScore ?? '—'} / 面试官 ${s.resume.interviewerScore ?? '—'}`
      : '上传简历，开始优化',
  },
  {
    id: 'interview', label: '模拟面试', icon: MessagesSquare, tone: '#7fd4d0',
    hint: (s) => s ? `已练 ${s.interview.count} 场` : '开始模拟面试',
  },
  {
    id: 'deepdive', label: '项目深挖', icon: Layers, tone: '#a99be0',
    hint: (s) => s ? `${s.deepdive.count} 个项目可继续追问` : '深挖你的项目经历',
  },
  {
    id: 'knowledge', label: '知识库', icon: BookMarked, tone: '#7ecfa0',
    hint: (s) => s?.knowledge.total
      ? `掌握 ${s.knowledge.mastered}/${s.knowledge.total} · 到期 ${s.knowledge.due}`
      : '沉淀薄弱知识点',
  },
  {
    id: 'errorbook', label: '错题本', icon: Target, tone: '#e29aa4',
    hint: (s) => s ? `${s.errorbook.pending} 道待复盘` : '攻克差题',
  },
  {
    id: 'leetcode', label: '算法学习', icon: Code2, tone: '#e3c169',
    hint: (s) => s?.algorithm.total
      ? `掌握 ${s.algorithm.mastered}/${s.algorithm.total}`
      : 'Hot100 训练',
  },
]

function tileProgress(s: Stats | null, id: NavId): number {
  if (!s) return 0
  switch (id) {
    case 'resume': return s.resume.hasData ? Math.round(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2) : 0
    case 'interview': return Math.min(100, s.interview.count * 25)
    case 'deepdive': return Math.min(100, s.deepdive.count * 25)
    case 'knowledge': return s.knowledge.total ? Math.round((s.knowledge.mastered / s.knowledge.total) * 100) : 0
    case 'errorbook': return s.errorbook.total ? Math.round((s.errorbook.conquered / s.errorbook.total) * 100) : 0
    case 'leetcode': return s.algorithm.total ? Math.round((s.algorithm.mastered / s.algorithm.total) * 100) : 0
  }
}

function computeReadiness(s: Stats): number {
  const dims: number[] = []
  if (s.resume.hasData) dims.push(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2)
  if (s.algorithm.total > 0 && s.algorithm.mastered > 0) dims.push((s.algorithm.mastered / s.algorithm.total) * 100)
  if (s.knowledge.total > 0) dims.push((s.knowledge.mastered / s.knowledge.total) * 100)
  if (s.interview.count > 0) dims.push(s.interview.avgScore ?? 0)
  if (s.deepdive.count > 0) dims.push(((s.deepdive.avgScore ?? 0) / 50) * 100)
  if (s.errorbook.total > 0) dims.push((s.errorbook.conquered / s.errorbook.total) * 100)
  if (dims.length === 0) return 0
  return Math.round(dims.reduce((a, b) => a + b, 0) / dims.length)
}

export function Dashboard({ onNavigate }: { onNavigate?: (id: NavId) => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setError('')
      setLoading(true)
      try {
        const stats = await api.dashboard()
        if (!cancelled) setS(stats)
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message ?? '加载失败')
          setS(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const readinessLabel = error || (!loading && !s) ? '—' : s ? `${computeReadiness(s)}%` : '…'

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-text">模块大厅</h1>
        <p className="font-mono-data text-sm text-muted">
          <span className="text-accent-hover">{`准备度 ${readinessLabel}`}</span>
        </p>
      </div>

      <div className="hub-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map(({ id, label, icon: Icon, tone, hint }) => {
          const progress = tileProgress(s, id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate?.(id)}
              className="hub-tile group relative min-h-[118px] overflow-hidden rounded-[14px] border border-border bg-white/[0.035] p-4 text-left transition-colors hover:border-accent/40"
              style={{ ['--tone' as string]: tone }}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={18} className="shrink-0 opacity-80" style={{ color: tone }} />
                <div className="text-[14px] font-semibold tracking-tight text-text">{label}</div>
              </div>
              <div className="mt-2 max-h-0 overflow-hidden text-[12px] leading-snug text-muted opacity-0 transition-all duration-200 group-hover:max-h-12 group-hover:opacity-100 group-focus-visible:max-h-12 group-focus-visible:opacity-100">
                {hint(s)}
              </div>
              <div className="absolute inset-x-4 bottom-4 h-[3px] overflow-hidden rounded-pill bg-white/[0.08]">
                <i
                  className="block h-full rounded-pill"
                  style={{ width: `${progress}%`, background: tone }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
