import { Card, Badge } from '../components/ui'
import { Target, Lock, CalendarCheck } from 'lucide-react'

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Offer Readiness</h1>
        <p className="mt-1 text-sm text-muted">衡量你距离目标岗位 Offer 的整体准备度。第一阶段已接入简历质量维度。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-accent">
            <Target size={18} />
            <h3 className="text-sm font-semibold text-text">简历质量</h3>
            <Badge tone="accent">已接入</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">上传并诊断简历后，这里会展示 HR / 面试官双视角评分与改进趋势。</p>
        </Card>

        {[
          { label: '算法能力', desc: 'LeetCode Hot100 学习模块' },
          { label: '知识掌握', desc: '知识记忆与面试训练' },
          { label: '模拟面试表现', desc: 'AI 模拟面试中心' },
          { label: '项目深度', desc: '项目深挖模块' },
        ].map((m) => (
          <Card key={m.label} className="p-5 opacity-70">
            <div className="flex items-center gap-2 text-faint">
              <Lock size={16} />
              <h3 className="text-sm font-semibold text-muted">{m.label}</h3>
              <Badge tone="muted">待解锁</Badge>
            </div>
            <p className="mt-3 text-sm text-faint">{m.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="flex items-center gap-3 p-5 text-sm text-muted">
        <CalendarCheck size={18} className="text-faint" />
        今日训练任务将在后续阶段（AI 学习教练）解锁。
      </Card>
    </div>
  )
}
