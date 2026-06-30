import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Badge } from '../components/ui'
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
