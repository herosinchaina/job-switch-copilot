import { useEffect, useState } from 'react'
import { api } from '../api'
import { RadarChart } from '../components/RadarChart'
import { AsyncView } from '../components/Async'
import { Card, Button, Badge } from '../components/ui'
import { ChevronLeft, Sparkles } from 'lucide-react'
import type { Review } from '@aios/shared'

const SEV_TONE = { high: 'danger', medium: 'warn', low: 'muted' } as const
const SEV_LABEL = { high: '高', medium: '中', low: '低' } as const

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 80 ? 'text-success' : score >= 60 ? 'text-warn' : 'text-danger'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-4xl font-semibold tracking-tight ${tone}`}>{score}</span>
      <span className="text-sm text-muted">/ 100</span>
    </div>
  )
}

export function ResumeReview({ versionId, onBack, onOptimize }: {
  versionId: number; onBack: () => void; onOptimize: (s: Review['suggestions']) => void
}) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: { hr: Review; interviewer: Review } }>({ loading: true })
  const [tab, setTab] = useState<'hr' | 'interviewer'>('hr')
  const [activeLoc, setActiveLoc] = useState<string>('')

  useEffect(() => {
    setState({ loading: true })
    api.review(versionId).then(data => setState({ data })).catch(e => setState({ error: e.message }))
  }, [versionId])

  return (
    <AsyncView
      state={state}
      loadingNode={
        <div className="space-y-4">
          <div className="skeleton h-7 w-40 rounded-btn" />
          <Card className="p-6"><div className="skeleton h-64 w-full rounded-card" /></Card>
          <p className="text-center text-sm text-muted">加载中… AI 正在从 HR 与面试官双视角评审简历，约需 1–2 分钟。</p>
        </div>
      }
    >
      {(data) => {
        const r = data[tab]
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
                <ChevronLeft size={15} /> 返回
              </button>
              <div className="inline-flex rounded-btn border border-border bg-surface-2 p-0.5">
                {(['hr', 'interviewer'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`cursor-pointer rounded-[0.5rem] px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      tab === t ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text'
                    }`}>
                    {t === 'hr' ? 'HR 视角' : '面试官视角'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <Card className="flex flex-col items-center justify-center gap-2 p-6">
                <span className="text-xs font-medium text-muted">{tab === 'hr' ? 'HR 综合评分' : '面试官综合评分'}</span>
                <ScoreRing score={r.overallScore} />
              </Card>
              <Card className="p-4">
                <RadarChart scores={r.dimensionScores} />
              </Card>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-text">改进建议 <span className="text-xs font-normal text-faint">（{r.suggestions.length} 条，点击高亮对应位置）</span></h3>
              <ul className="space-y-2">
                {r.suggestions.map((s, i) => (
                  <li key={i} onClick={() => setActiveLoc(s.location)}
                    className={`cursor-pointer rounded-card border p-3.5 transition-colors ${
                      activeLoc === s.location ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2'
                    }`}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge tone={SEV_TONE[s.severity]}>{SEV_LABEL[s.severity]}优先级</Badge>
                      <code data-loc={s.location} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{s.location}</code>
                    </div>
                    <p className="text-sm font-medium text-text">{s.issue}</p>
                    <p className="mt-1 text-sm text-muted">{s.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="success" onClick={() => onOptimize(r.suggestions)}>
                <Sparkles size={15} /> 根据建议生成优化版
              </Button>
            </div>
          </div>
        )
      }}
    </AsyncView>
  )
}
