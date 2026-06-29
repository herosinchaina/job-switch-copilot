import { useEffect, useState } from 'react'
import { api } from '../api'
import { RadarChart } from '../components/RadarChart'
import { AsyncView } from '../components/Async'
import type { Review } from '@aios/shared'

export function ResumeReview({ versionId, onBack, onOptimize }: {
  versionId: number; onBack: () => void; onOptimize: (s: Review['suggestions']) => void }) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: { hr: Review; interviewer: Review } }>({ loading: true })
  const [tab, setTab] = useState<'hr'|'interviewer'>('hr')
  const [activeLoc, setActiveLoc] = useState<string>('')

  useEffect(() => { api.review(versionId)
    .then(data => setState({ data })).catch(e => setState({ error: e.message })) }, [versionId])

  return (
    <AsyncView state={state}>{(data) => {
      const r = data[tab]
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-sm text-slate-500">← 返回</button>
            {(['hr','interviewer'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded px-3 py-1 text-sm ${tab===t?'bg-blue-600 text-white':'bg-slate-200 dark:bg-slate-800'}`}>
                {t==='hr'?'HR 视角':'面试官视角'}</button>))}
          </div>
          <div className="text-2xl font-semibold">总分 {r.overallScore}</div>
          <RadarChart scores={r.dimensionScores} />
          <ul className="space-y-2">
            {r.suggestions.map((s, i) => (
              <li key={i} onClick={() => setActiveLoc(s.location)}
                className={`cursor-pointer rounded border p-3 text-sm ${activeLoc===s.location?'border-blue-500 bg-blue-50 dark:bg-blue-950/40':'border-slate-200 dark:border-slate-800'}`}>
                <span className="mr-2 text-xs text-slate-400" data-loc={s.location}>{s.location}</span>
                <strong>{s.issue}</strong> — {s.suggestion}</li>))}
          </ul>
          <button onClick={() => onOptimize(r.suggestions)}
            className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">根据建议生成优化版</button>
        </div>)
    }}</AsyncView>
  )
}
