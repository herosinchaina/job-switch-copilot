import { useState } from 'react'
import { useTheme } from './theme'
import { CliBanner } from './components/CliBanner'
import { ResumeUpload } from './pages/ResumeUpload'
import { ResumeReview } from './pages/ResumeReview'
import type { Review } from '@aios/shared'
export default function App() {
  const { dark, toggle } = useTheme()
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<Review['suggestions'] | null>(null)
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <span className="font-semibold">AI 求职操作系统</span>
        <button onClick={toggle} className="text-sm">{dark ? '☀️' : '🌙'}</button>
      </header>
      <CliBanner />
      <main className="p-6">
        {renderMain()}
      </main>
    </div>
  )

  function renderMain() {
    if (confirmedVersion === null) {
      return <ResumeUpload onConfirmed={setConfirmedVersion} />
    }
    if (optimizeSuggestions !== null) {
      // TODO(Task 12): replace placeholder with <ResumeCompare versionId={confirmedVersion} suggestions={optimizeSuggestions} ... />
      return <div>优化对比页(Task 12 实现)</div>
    }
    return (
      <ResumeReview
        versionId={confirmedVersion}
        onBack={() => setConfirmedVersion(null)}
        onOptimize={setOptimizeSuggestions}
      />
    )
  }
}
