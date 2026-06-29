import { Radar, RadarChart as RC, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import type { DimensionKey } from '@aios/shared'

const LABEL: Record<DimensionKey, string> = {
  layout: '排版', professionalism: '专业度', star: 'STAR', quantification: '量化', techDepth: '技术深度',
  jobMatch: '岗位匹配', ats: 'ATS', keywordCoverage: '关键词覆盖',
}

export function RadarChart({ scores }: { scores: { dimension: DimensionKey; score: number }[] }) {
  const data = scores.map(s => ({ subject: LABEL[s.dimension], score: s.score }))
  // Theme-aware colors via CSS vars; recharts needs concrete color strings.
  const grid = 'rgb(148 163 184 / 0.25)'
  const accent = 'rgb(99 102 241)'
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <RC data={data} outerRadius="72%">
          <PolarGrid stroke={grid} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgb(148 163 184)', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="score" stroke={accent} fill={accent} fillOpacity={0.28} strokeWidth={2} />
        </RC>
      </ResponsiveContainer>
    </div>
  )
}
