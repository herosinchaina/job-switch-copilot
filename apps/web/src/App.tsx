import { useState } from 'react'
import { useTheme } from './theme'
import { CliBanner } from './components/CliBanner'
import { ResumeUpload } from './pages/ResumeUpload'
import { ResumeReview } from './pages/ResumeReview'
import { ResumeCompare } from './pages/ResumeCompare'
import { Dashboard } from './pages/Dashboard'
import type { Review, StructuredResume } from '@aios/shared'

export default function App() {
  const { dark, toggle } = useTheme()
  const [view, setView] = useState<'dashboard' | 'resume'>('resume')
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
  const [confirmedStructured, setConfirmedStructured] = useState<StructuredResume | null>(null)
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<Review['suggestions'] | null>(null)

  function resetFlow() {
    setConfirmedVersion(null)
    setConfirmedStructured(null)
    setOptimizeSuggestions(null)
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">AI 求职操作系统</span>
          <nav className="flex items-center gap-1">
            {(['dashboard', 'resume'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded px-3 py-1 text-sm ${view===v?'bg-blue-600 text-white':'bg-slate-200 dark:bg-slate-800'}`}>
                {v==='dashboard'?'Dashboard':'简历大师'}</button>))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <a href="/api/export" className="text-sm text-slate-500 hover:underline">导出数据</a>
          <button onClick={toggle} className="text-sm">{dark ? '☀️' : '🌙'}</button>
        </div>
      </header>
      <CliBanner />
      <main className="p-6">
        {view === 'dashboard' ? <Dashboard /> : renderResume()}
      </main>
    </div>
  )

  function renderResume() {
    if (confirmedVersion === null) {
      return <ResumeUpload
        onConfirmed={setConfirmedVersion}
        onDraft={setConfirmedStructured}
      />
    }
    if (optimizeSuggestions !== null && confirmedStructured !== null) {
      return (
        <div className="space-y-4">
          <button onClick={resetFlow} className="text-sm text-slate-500">← 返回</button>
          <ResumeCompare
            baseVersionId={confirmedVersion}
            base={confirmedStructured}
            suggestions={optimizeSuggestions}
            onSaved={() => {}}
          />
        </div>
      )
    }
    return (
      <ResumeReview
        versionId={confirmedVersion}
        onBack={resetFlow}
        onOptimize={setOptimizeSuggestions}
      />
    )
  }
}
