import { useState } from 'react'
import { useTheme } from './theme'
import { CliBanner } from './components/CliBanner'
import { Sidebar, type NavId } from './components/Sidebar'
import { ResumeUpload } from './pages/ResumeUpload'
import { ResumeReview } from './pages/ResumeReview'
import { ResumeCompare } from './pages/ResumeCompare'
import { InterviewKit } from './pages/InterviewKit'
import { MockInterview } from './pages/MockInterview'
import { Leetcode } from './pages/Leetcode'
import { LcGuide } from './pages/LcGuide'
import { Dashboard } from './pages/Dashboard'
import { ProjectDeepdive } from './pages/ProjectDeepdive'
import { KnowledgeBase } from './pages/KnowledgeBase'
import { ErrorBook } from './pages/ErrorBook'
import { Download, Search, ChevronLeft } from 'lucide-react'
import type { Review, StructuredResume } from '@aios/shared'

const TITLES: Record<NavId, string> = {
  dashboard: '工作台', resume: '简历大师', interview: '模拟面试',
  deepdive: '项目深挖', knowledge: '知识库', errorbook: '错题本', leetcode: '算法学习',
}

export default function App() {
  const { dark, toggle } = useTheme()
  const [view, setView] = useState<NavId>('dashboard')
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

  function nav(id: NavId) { setGuideFor(null); setView(id) }

  return (
    <div className="grid h-dvh grid-cols-1 lg:grid-cols-[248px_1fr]">
      <div className="hidden lg:block">
        <Sidebar view={view} onNavigate={nav} dark={dark} onToggleTheme={toggle} />
      </div>

      <div className="flex min-w-0 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-bg/60 px-6 py-3.5 backdrop-blur-xl sm:px-8">
          <div className="text-[13px] text-faint">
            {view === 'dashboard'
              ? <b className="font-semibold text-text">工作台</b>
              : <>工作台 <span className="text-faint">/</span> <b className="font-semibold text-text">{TITLES[view]}</b></>}
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-pill border border-transparent bg-white/[0.06] px-3.5 py-2 text-muted transition-colors focus-within:border-accent/40 focus-within:bg-surface-2 max-sm:hidden">
            <Search size={15} className="shrink-0" />
            <input placeholder="搜索模块、知识点、题目…" className="w-52 bg-transparent text-[13px] text-text outline-none placeholder:text-faint" />
          </div>
          <a href="/api/export" title="导出数据"
            className="grid h-9 w-9 place-items-center rounded-pill bg-white/[0.06] text-muted transition-colors hover:bg-white/[0.1] hover:text-text">
            <Download size={17} />
          </a>
        </header>

        <CliBanner />

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8">
          <div className="mx-auto max-w-[1180px]">
            {view === 'dashboard' ? (
              <Dashboard onNavigate={(id) => nav(id as NavId)} />
            ) : view === 'knowledge' ? (
              <KnowledgeBase />
            ) : view === 'errorbook' ? (
              <ErrorBook />
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
            ) : view === 'deepdive' ? (
              confirmedVersion !== null && confirmedStructured !== null ? (
                <ProjectDeepdive versionId={confirmedVersion} structured={confirmedStructured} onBack={() => setView('resume')} />
              ) : (
                <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
                  请先到「简历大师」上传并确认一份简历,再进行项目深挖。
                </div>
              )
            ) : (
              renderResume()
            )}
          </div>
        </main>
      </div>
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
            <ChevronLeft size={15} className="shrink-0" /> 返回
          </button>
          <ResumeCompare
            baseVersionId={confirmedVersion}
            base={confirmedStructured}
            suggestions={optimizeSuggestions}
            onSaved={(versionId, structured) => { setConfirmedVersion(versionId); setConfirmedStructured(structured) }}
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
