import { useEffect, useState } from 'react'
import { api } from '../api'
import { Loader2, AlertCircle, Sparkles, Play, Plus, FileText, MessagesSquare, Layers, BookMarked, Target, Code2, TrendingUp, Clock, CircleAlert, Check, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Stats = Awaited<ReturnType<typeof api.dashboard>>
type NavId = 'resume' | 'leetcode' | 'knowledge' | 'interview' | 'deepdive' | 'errorbook'

// 数字滚动计数,返回 {n, p}(当前值 + 0-1 进度),尊重 reduced-motion
function useCountUp(target: number, ms = 1300) {
  const [state, setState] = useState({ n: 0, p: 0 })
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setState({ n: target, p: 1 }); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setState({ n: Math.round(target * eased), p: eased })
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return state
}

export function Dashboard({ onNavigate }: { onNavigate?: (id: NavId) => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try { setS(await api.dashboard()) }
    catch (e: any) { setError(e.message ?? '加载失败') }
  }
  useEffect(() => { load() }, [])

  if (error) return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <AlertCircle size={22} className="text-danger" />
      <p className="text-sm text-muted">加载失败:{error}</p>
      <button onClick={load} className="cursor-pointer rounded-pill border border-border px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-white/5">重试</button>
    </div>
  )
  if (!s) return (
    <div className="flex items-center justify-center gap-2 py-32 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> 加载中…</div>
  )

  const readiness = computeReadiness(s)
  return (
    <div className="space-y-4">
      <Hero value={readiness} s={s} onNavigate={onNavigate} />
      <Kpis s={s} />
      <SectionHead title="训练模块" hint="点击任意模块进入" />
      <Bento s={s} onNavigate={onNavigate} />
      <Cols s={s} value={readiness} />
    </div>
  )
}

// 英雄区:墨蓝渐变巨幕 + 金色渐变标题 + 双 CTA + 准备度环(数字与环同缓动)
function Hero({ value, s, onNavigate }: { value: number; s: Stats; onNavigate?: (id: NavId) => void }) {
  const R = 60, C = 2 * Math.PI * R
  const { n: shown, p } = useCountUp(value)
  const dash = C * (1 - (value * p) / 100)
  const done = [s.resume.hasData, s.algorithm.mastered > 0, s.knowledge.total > 0, s.interview.count > 0, s.deepdive.count > 0, s.errorbook.total > 0].filter(Boolean).length
  return (
    <section className="fade-up relative overflow-hidden rounded-hero border border-border-strong bg-gradient-to-br from-indigo-50 via-white to-amber-50/60 p-11 shadow-lift dark:from-[rgba(28,40,78,0.75)] dark:via-[rgba(14,19,36,0.7)] dark:to-[rgba(20,17,10,0.6)]">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent" aria-hidden />
      <span className="absolute -left-[60px] -top-[120px] h-[340px] w-[340px] rounded-full blur-[26px]" style={{ background: 'radial-gradient(circle, rgba(60,90,180,.22), transparent 65%)' }} aria-hidden />
      <span className="absolute -bottom-[140px] -right-[40px] h-[340px] w-[340px] rounded-full blur-[26px]" style={{ background: 'radial-gradient(circle, rgba(217,184,119,.2), transparent 65%)' }} aria-hidden />

      <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent-hover">
            <Sparkles size={14} className="shrink-0" /> Offer Readiness · 实时评估
          </span>
          <h1 className="mt-5 text-[42px] font-semibold leading-[1.08] tracking-[-.03em] text-text">
            综合准备度<br />
            <span className="bg-gradient-to-r from-accent-hover to-accent bg-clip-text text-transparent">离目标 Offer 更近一步</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
            已开启 {done} / 6 个训练维度,系统实时汇总简历、算法、面试、项目与错题的真实进度。持续训练,准备度稳步提升。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => onNavigate?.('interview')}
              className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-pill bg-gradient-to-r from-accent-hover to-accent px-6 py-3 text-sm font-medium text-[#1a1408] shadow-[0_6px_18px_-6px_rgba(217,184,119,0.4)] transition-transform hover:-translate-y-0.5">
              <Play size={16} className="shrink-0" /> 继续训练
            </button>
            <button onClick={() => onNavigate?.('resume')}
              className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface/70 px-6 py-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 dark:bg-white/[0.08] dark:hover:bg-white/[0.13]">
              <Plus size={16} className="shrink-0" /> 诊断简历
            </button>
          </div>
        </div>

        <div className="relative grid h-[200px] w-[200px] place-items-center justify-self-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e8cf9a" />
                <stop offset="100%" stopColor="#c2a05f" />
              </linearGradient>
            </defs>
            <circle cx="70" cy="70" r={R} fill="none" stroke="rgb(var(--border-strong))" strokeWidth="10" />
            <circle cx="70" cy="70" r={R} fill="none" stroke="url(#rg)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={dash} />
          </svg>
          <div className="absolute text-center">
            <div className="text-[56px] font-semibold leading-none tracking-[-.04em] tabular-nums text-text">{shown}<small className="text-[22px] font-medium text-faint">%</small></div>
            <div className="mt-2 text-[13px] text-muted">综合准备度</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// KPI 指标条
function Kpis({ s }: { s: Stats }) {
  const items = [
    { icon: TrendingUp, color: 'text-accent', label: '待复习知识', val: s.knowledge.due, unit: ' 条', trend: s.knowledge.due > 0 ? '记忆曲线到期' : '暂无到期', tone: 'text-faint' },
    { icon: Clock, color: 'text-[#7fd4d0]', label: '知识总量', val: s.knowledge.total, unit: ' 条', trend: `已牢固 ${s.knowledge.mastered}`, tone: 'text-success' },
    { icon: CircleAlert, color: 'text-warn', label: '待攻克错题', val: s.errorbook.pending, unit: ' 道', trend: s.errorbook.pending > 0 ? '建议今日清零' : '全部攻克', tone: s.errorbook.pending > 0 ? 'text-danger' : 'text-success' },
    { icon: Check, color: 'text-success', label: '已攻克错题', val: s.errorbook.conquered, unit: ` / ${s.errorbook.total}`, trend: '攻克进度', tone: 'text-faint' },
  ]
  return (
    <div className="fade-up grid grid-cols-2 gap-3.5 lg:grid-cols-4" style={{ animationDelay: '.06s' }}>
      {items.map(k => (
        <div key={k.label} className="rounded-card border border-border bg-surface/60 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong">
          <div className="flex items-center gap-2 text-[13px] text-muted"><k.icon size={15} className={`shrink-0 ${k.color}`} /> {k.label}</div>
          <div className="mt-2.5 text-[28px] font-semibold tracking-[-.03em] tabular-nums text-text">{k.val}<small className="text-[13px] font-normal text-faint">{k.unit}</small></div>
          <div className={`mt-1.5 text-xs font-medium ${k.tone}`}>{k.trend}</div>
        </div>
      ))}
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="fade-up flex items-baseline gap-3 pt-5" style={{ animationDelay: '.1s' }}>
      <h2 className="text-[22px] font-semibold tracking-[-.02em] text-text">{title}</h2>
      <span className="text-sm text-faint">{hint}</span>
    </div>
  )
}

type Mod = {
  id: NavId; icon: LucideIcon; title: string; desc: string; tone: string
  big: string; unit: string; pct: number; active: boolean; chip?: string
}

function Bento({ s, onNavigate }: { s: Stats; onNavigate?: (id: NavId) => void }) {
  const resumeAvg = s.resume.hasData ? Math.round(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2) : 0
  const mods: Mod[] = [
    { id: 'resume', icon: FileText, title: '简历大师', tone: 'indigo', desc: '双视角(HR / 面试官)诊断评分,一键优化并对比改稿。',
      big: s.resume.hasData ? String(resumeAvg) : '—', unit: ' / 100 分', pct: resumeAvg, active: s.resume.hasData },
    { id: 'interview', icon: MessagesSquare, title: '模拟面试', tone: 'cyan', desc: 'AI 面试官多轮追问,实时反馈评分,自动沉淀错题。',
      big: s.interview.count > 0 ? String(s.interview.avgScore) : '—', unit: s.interview.count > 0 ? ` 均分 · ${s.interview.count} 场` : ' 场', pct: s.interview.avgScore ?? 0, active: s.interview.count > 0 },
    { id: 'deepdive', icon: Layers, title: '项目深挖', tone: 'violet', desc: '针对简历项目深度追问,生成项目能力图谱与提升建议。',
      big: s.deepdive.count > 0 ? String(s.deepdive.avgScore) : '—', unit: s.deepdive.count > 0 ? ` / 50 · ${s.deepdive.count} 项目` : ' / 50', pct: (s.deepdive.avgScore ?? 0) / 50 * 100, active: s.deepdive.count > 0 },
    { id: 'knowledge', icon: BookMarked, title: '知识库', tone: 'emerald', desc: '面试与项目沉淀的知识点,基于记忆曲线智能安排复习。',
      big: String(s.knowledge.mastered), unit: ` / ${s.knowledge.total} 已掌握`, pct: s.knowledge.total > 0 ? s.knowledge.mastered / s.knowledge.total * 100 : 0, active: s.knowledge.total > 0, chip: s.knowledge.due > 0 ? `${s.knowledge.due} 待复习` : undefined },
    { id: 'errorbook', icon: Target, title: '错题本', tone: 'amber', desc: '汇集所有答错题目,反复重练直到彻底攻克并生成洞察。',
      big: String(s.errorbook.conquered), unit: ` / ${s.errorbook.total} 已攻克`, pct: s.errorbook.total > 0 ? s.errorbook.conquered / s.errorbook.total * 100 : 0, active: s.errorbook.total > 0, chip: s.errorbook.pending > 0 ? `${s.errorbook.pending} 待攻克` : undefined },
    { id: 'leetcode', icon: Code2, title: '算法学习', tone: 'rose', desc: 'Hot100 分主题闯关,AI 引导式讲解,追踪掌握进度。',
      big: String(s.algorithm.mastered), unit: ` / ${s.algorithm.total} 掌握`, pct: s.algorithm.total > 0 ? s.algorithm.mastered / s.algorithm.total * 100 : 0, active: s.algorithm.mastered > 0 },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mods.map((m, i) => <ModCard key={m.id} m={m} i={i} onClick={() => onNavigate?.(m.id)} />)}
    </div>
  )
}

// 每模块渐变图标底/进度条(低饱和柔光调,调和深色底)
const TONES: Record<string, { ico: string; bar: string; glow: string }> = {
  indigo:  { ico: 'from-[#8fb0ff] to-[#5f7fd6]', bar: 'from-[#8fb0ff] to-[#5f7fd6]', glow: '#7f9fe6' },
  cyan:    { ico: 'from-[#9fe0dc] to-[#5fb8b3]', bar: 'from-[#9fe0dc] to-[#5fb8b3]', glow: '#7fd4d0' },
  violet:  { ico: 'from-[#c3b6f0] to-[#9082d0]', bar: 'from-[#c3b6f0] to-[#9082d0]', glow: '#a99be0' },
  emerald: { ico: 'from-[#a0dcbb] to-[#5fb587]', bar: 'from-[#a0dcbb] to-[#5fb587]', glow: '#7ecfa0' },
  amber:   { ico: 'from-accent-hover to-accent', bar: 'from-accent-hover to-accent', glow: '#e3c169' },
  rose:    { ico: 'from-[#eeb0b8] to-[#d0808c]', bar: 'from-[#eeb0b8] to-[#d0808c]', glow: '#e29aa4' },
}

function ModCard({ m, i, onClick }: { m: Mod; i: number; onClick: () => void }) {
  const t = TONES[m.tone]
  return (
    <button onClick={onClick} style={{ animationDelay: `${0.12 + i * 0.04}s` }}
      className="fade-up group relative flex min-h-[178px] cursor-pointer flex-col overflow-hidden rounded-card-lg border border-border bg-surface/60 p-6 text-left shadow-card transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1.5 hover:border-border-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span className="pointer-events-none absolute -right-8 -top-8 h-[130px] w-[130px] rounded-full opacity-[0.14] blur-[30px] transition-opacity duration-300 group-hover:opacity-40" style={{ background: t.glow }} aria-hidden />
      <div className={`grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-gradient-to-br ${t.ico} text-[#1a1408]`}>
        <m.icon size={22} />
      </div>
      <h3 className="mt-4 flex items-center gap-2 text-base font-semibold tracking-[-.02em] text-text">
        {m.title}
        {m.chip && <span className="rounded-pill bg-warn/15 px-2 py-0.5 text-[10.5px] font-semibold text-warn">{m.chip}</span>}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{m.desc}</p>
      <div className="mt-3.5 h-1.5 overflow-hidden rounded-pill bg-white/[0.08]">
        <div className={`h-full rounded-pill bg-gradient-to-r ${t.bar} transition-[width] duration-700 ease-out`} style={{ width: `${m.active ? Math.min(100, m.pct) : 0}%` }} />
      </div>
      <div className="mt-auto flex items-center justify-between pt-3.5">
        <div className="text-[12.5px] text-faint"><b className={`text-base font-semibold ${m.active ? 'text-text' : 'text-faint'}`}>{m.big}</b>{m.unit}</div>
        <span className="grid h-[30px] w-[30px] place-items-center rounded-pill bg-white/[0.06] text-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-accent group-hover:text-[#1a1408]">
          <ArrowUpRight size={15} />
        </span>
      </div>
    </button>
  )
}

// 双栏:近期训练提示 + 能力雷达(6 维横向条)
function Cols({ s, value }: { s: Stats; value: number }) {
  const resumeAvg = s.resume.hasData ? Math.round(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2) : 0
  const dims = [
    { n: '简历', v: resumeAvg },
    { n: '算法', v: s.algorithm.total > 0 ? Math.round(s.algorithm.mastered / s.algorithm.total * 100) : 0 },
    { n: '面试', v: s.interview.avgScore ?? 0 },
    { n: '项目', v: Math.round((s.deepdive.avgScore ?? 0) / 50 * 100) },
    { n: '知识', v: s.knowledge.total > 0 ? Math.round(s.knowledge.mastered / s.knowledge.total * 100) : 0 },
    { n: '错题', v: s.errorbook.total > 0 ? Math.round(s.errorbook.conquered / s.errorbook.total * 100) : 0 },
  ]
  const weakest = dims.filter(d => d.v > 0 || true).reduce((a, b) => (b.v < a.v ? b : a), dims[0])
  return (
    <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-[1.4fr_1fr]">
      <div className="fade-up rounded-card-lg border border-border bg-surface/60 p-6 shadow-card" style={{ animationDelay: '.14s' }}>
        <h3 className="flex items-center gap-2.5 text-base font-semibold tracking-[-.02em] text-text">
          <Sparkles size={17} className="shrink-0 text-accent" /> 训练进度总览
        </h3>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          你已累计完成 <b className="text-text">{s.interview.count}</b> 场模拟面试、深挖 <b className="text-text">{s.deepdive.count}</b> 个项目,
          知识库沉淀 <b className="text-text">{s.knowledge.total}</b> 条、其中 <b className="text-success">{s.knowledge.mastered}</b> 条已牢固掌握。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          错题本累计 <b className="text-text">{s.errorbook.total}</b> 道,已攻克 <b className="text-success">{s.errorbook.conquered}</b> 道
          {s.errorbook.pending > 0 && <>,还有 <b className="text-warn">{s.errorbook.pending}</b> 道待攻克</>}。
          算法 Hot100 掌握 <b className="text-text">{s.algorithm.mastered}</b> / {s.algorithm.total}。
        </p>
        <div className="mt-5 flex items-center gap-3 rounded-card border border-accent/20 bg-accent/[0.06] px-4 py-3">
          <TrendingUp size={16} className="text-accent" />
          <span className="text-[13px] text-muted">综合准备度 <b className="text-accent-hover">{value}%</b>{weakest.v < 60 && <>,建议优先补强 <b className="text-text">{weakest.n}</b></>}。</span>
        </div>
      </div>

      <div className="fade-up rounded-card-lg border border-border bg-surface/60 p-6 shadow-card" style={{ animationDelay: '.18s' }}>
        <h3 className="flex items-center gap-2.5 text-base font-semibold tracking-[-.02em] text-text">
          <Target size={17} className="shrink-0 text-accent" /> 能力雷达
        </h3>
        <div className="mt-3">
          {dims.map(d => (
            <div key={d.n} className="flex items-center gap-3 py-2.5">
              <div className="w-12 text-[13px] text-muted">{d.n}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-pill bg-white/[0.08]">
                <div className="h-full rounded-pill bg-gradient-to-r from-accent to-accent-hover transition-[width] duration-700 ease-out" style={{ width: `${d.v}%` }} />
              </div>
              <div className="w-8 text-right text-[13px] font-semibold tabular-nums text-text">{d.v}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">六维能力归一化评估,持续训练拉满每一维。</p>
      </div>
    </div>
  )
}

// 综合准备度:各维度归一到 0-100,仅纳入已有数据的维度取平均(四舍五入)
function computeReadiness(s: Stats): number {
  const dims: number[] = []
  if (s.resume.hasData) dims.push(((s.resume.hrScore ?? 0) + (s.resume.interviewerScore ?? 0)) / 2)
  if (s.algorithm.total > 0 && s.algorithm.mastered > 0) dims.push((s.algorithm.mastered / s.algorithm.total) * 100)
  if (s.knowledge.total > 0) dims.push((s.knowledge.mastered / s.knowledge.total) * 100)
  if (s.interview.count > 0) dims.push(s.interview.avgScore ?? 0)
  if (s.deepdive.count > 0) dims.push(((s.deepdive.avgScore ?? 0) / 50) * 100)
  if (s.errorbook.total > 0) dims.push((s.errorbook.conquered / s.errorbook.total) * 100)
  if (dims.length === 0) return 0
  return Math.round(dims.reduce((a, b) => a + b, 0) / dims.length)
}