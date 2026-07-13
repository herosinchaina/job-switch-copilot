import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card } from '../components/ui'
import { ChevronLeft, Copy } from 'lucide-react'
import type { InterviewKit as Kit } from '@aios/shared'

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}
      className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-text"
    >
      <Copy size={13} className="shrink-0" /> {done ? '已复制' : '复制'}
    </button>
  )
}

export function InterviewKit({ versionId, jobDescriptionId, onBack }: {
  versionId: number; jobDescriptionId: number | null; onBack: () => void
}) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; kit?: Kit }>({ loading: true })
  useEffect(() => {
    api.generateKit(versionId, jobDescriptionId ?? undefined)
      .then(r => setState({ kit: r.kit })).catch(e => setState({ error: e.message }))
  }, [versionId, jobDescriptionId])

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft size={15} className="shrink-0" /> 返回
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">面试材料</h1>
        <p className="mt-1 text-sm text-muted">基于你的简历{jobDescriptionId != null ? '与目标岗位' : ''}生成的自我介绍与项目讲解模板。</p>
      </div>

      {state.loading && (
        <div className="space-y-3">
          <div className="skeleton h-24 w-full rounded-card" />
          <div className="skeleton h-40 w-full rounded-card" />
          <p className="text-center text-sm text-muted">生成中,约需 1 分钟…</p>
        </div>
      )}
      {state.error && (
        <div className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">生成失败：{state.error}</div>
      )}

      {state.kit && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text">自我介绍</h2>
            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">30 秒版</span>
                <CopyBtn text={state.kit.selfIntro.short} />
              </div>
              <p className="whitespace-pre-line text-sm text-text">{state.kit.selfIntro.short}</p>
            </Card>
            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">1-2 分钟版</span>
                <CopyBtn text={state.kit.selfIntro.standard} />
              </div>
              <p className="whitespace-pre-line text-sm text-text">{state.kit.selfIntro.standard}</p>
            </Card>
          </section>

          {state.kit.projectPitches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text">项目讲解（STAR）</h2>
              {state.kit.projectPitches.map((p, i) => (
                <Card key={i} className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-text">{p.projectName}</h3>
                    <CopyBtn text={`${p.projectName}\n情境：${p.situation}\n任务：${p.task}\n行动：${p.action}\n结果：${p.result}`} />
                  </div>
                  {([['情境', p.situation], ['任务', p.task], ['行动', p.action], ['结果', p.result]] as const).map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{val}</p>
                    </div>
                  ))}
                </Card>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
