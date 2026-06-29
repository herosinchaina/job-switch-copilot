import { useEffect, useState } from 'react'
import { api } from '../api'
import type { StructuredResume, Review } from '@aios/shared'

function Pane({ title, r }: { title: string; r: StructuredResume }) {
  return <div className="flex-1 rounded border border-slate-200 dark:border-slate-800 p-3">
    <h3 className="mb-2 font-medium">{title}</h3>
    <p className="text-sm font-semibold">{r.basics.name} · {r.basics.title}</p>
    <p className="text-sm text-slate-500">{r.basics.summary}</p>
  </div>
}
export function ResumeCompare({ baseVersionId, base, suggestions, onSaved }: {
  baseVersionId: number; base: StructuredResume; suggestions: Review['suggestions']; onSaved: (versionId: number) => void }) {
  const [opt, setOpt] = useState<StructuredResume | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.optimize(baseVersionId, suggestions)
    .then(r => { setOpt(r.structured); onSaved(r.versionId) })
    .catch(e => setError(e.message)) }, [baseVersionId])
  if (error) return <p className="text-sm text-red-500">{error}</p>
  return <div className="flex gap-4">
    <Pane title="原版" r={base} />
    {opt ? <Pane title="优化版(已保存)" r={opt} />
         : <div className="flex-1 animate-pulse rounded border border-slate-200 dark:border-slate-800 p-3 text-sm text-slate-400">优化版生成中…</div>}
  </div>
}
