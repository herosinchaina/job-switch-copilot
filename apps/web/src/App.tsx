import { useState } from 'react'
import { useTheme } from './theme'
import { CliBanner } from './components/CliBanner'
import { ResumeUpload } from './pages/ResumeUpload'
import { ResumeReview } from './pages/ResumeReview'
import { ResumeCompare } from './pages/ResumeCompare'
import { InterviewKit } from './pages/InterviewKit'
import { MockInterview } from './pages/MockInterview'
import { Leetcode } from './pages/Leetcode'
import { LcGuide } from './pages/LcGuide'
import { Dashboard } from './pages/Dashboard'
import { LayoutDashboard, FileText, Download, Moon, Sun, Sparkles, ChevronLeft, MessagesSquare, Code2 } from 'lucide-react'
import type { Review, StructuredResume } from '@aios/shared'

export default function App() {
  const { dark, toggle } = useTheme()
  const [view, setView] = useState<'dashboard' | 'resume' | 'interview' | 'leetcode'>('resume')
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
  const [confirmedStructured, setConfirmedStructured] = useState<StructuredResume | null>(null)
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<Review['suggestions'] | null>(null)
  const [kitFor, setKitFor] = useState<{ versionId: number; jdId: number | null } | null>(null)
  const [guideFor, setGuideFor] = useState<number | null>(null)

  function resetFlow() {
    setConfirmedVersion(null)
    setConfirmedStructured(null)
    setOptimizeSuggestions(null)
    setKitFor(null)
  }

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'resume' as const, label: '简历大师', icon: FileText },
    { id: 'interview' as const, label: '模拟面试', icon: MessagesSquare },
    { id: 'leetcode' as const, label: '算法学习', icon: Code2 },
  ]

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
                <Sparkles size={16} />
              </div>
              <span className="text-sm font-semibold tracking-tight">AI 求职操作系统</span>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setGuideFor(null); setView(id) }}
                  aria-current={view === id ? 'page' : undefined}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="/api/export"
              className="flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Download size={15} /> 导出数据
            </a>
            <button
              onClick={toggle}
              aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-btn text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <CliBanner />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {view === 'dashboard' ? (
          <Dashboard />
        ) : view === 'leetcode' ? (
          guideFor !== null ? (
            <LcGuide leetcodeId={guideFor} onBack={() => setGuideFor(null)} />
          ) : (
            <Leetcode onOpen={setGuideFor} />
          )
        ) : view === 'interview' ? (
          confirmedVersion !== null ? (
            <MockInterview versionId={confirmedVersion} onBack={() => setView('resume')} />
          ) : (
            <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
              请先到「简历大师」上传并确认一份简历,再开始模拟面试。
            </div>
          )
        ) : (
          renderResume()
        )}
      </main>
    </div>
  )

  function renderResume() {
    if (confirmedVersion === null) {
      return <ResumeUpload onConfirmed={setConfirmedVersion} onDraft={setConfirmedStructured} />
    }
    if (optimizeSuggestions !== null && confirmedStructured !== null) {
      return (
        <div className="space-y-5">
          <button onClick={resetFlow} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
            <ChevronLeft size={15} /> 返回
          </button>
          <ResumeCompare
            baseVersionId={confirmedVersion}
            base={confirmedStructured}
            suggestions={optimizeSuggestions}
            onSaved={() => {}}
          />
        </div>
      )
    }
    if (kitFor) {
      return <InterviewKit versionId={kitFor.versionId} jobDescriptionId={kitFor.jdId} onBack={() => setKitFor(null)} />
    }
    return (
      <ResumeReview
        versionId={confirmedVersion}
        onBack={resetFlow}
        onOptimize={setOptimizeSuggestions}
        onGenerateKit={(jdId) => setKitFor({ versionId: confirmedVersion!, jdId })}
      />
    )
  }
}
