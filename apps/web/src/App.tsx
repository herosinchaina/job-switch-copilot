import { useState } from 'react'
import { useTheme } from './theme'
import { CliBanner } from './components/CliBanner'
import { ResumeUpload } from './pages/ResumeUpload'
export default function App() {
  const { dark, toggle } = useTheme()
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <span className="font-semibold">AI 求职操作系统</span>
        <button onClick={toggle} className="text-sm">{dark ? '☀️' : '🌙'}</button>
      </header>
      <CliBanner />
      <main className="p-6">
        {confirmedVersion === null
          ? <ResumeUpload onConfirmed={setConfirmedVersion} />
          // TODO(Task 11): replace placeholder with <ResumeReview versionId={confirmedVersion} onBack={() => setConfirmedVersion(null)} /> (onOptimize wired in Task 12)
          : <div>诊断页(Task 11 实现)</div>}
      </main>
    </div>
  )
}
