import { Radar, RadarChart as RC, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import type { DimensionKey } from '@aios/shared'
const LABEL: Record<DimensionKey,string> = { layout:'排版', professionalism:'专业度', star:'STAR', quantification:'量化', techDepth:'技术深度' }
export function RadarChart({ scores }: { scores: { dimension: DimensionKey; score: number }[] }) {
  const data = scores.map(s => ({ subject: LABEL[s.dimension], score: s.score }))
  return <div style={{ width:'100%', height:260 }}><ResponsiveContainer>
    <RC data={data}><PolarGrid /><PolarAngleAxis dataKey="subject" />
    <Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.4} /></RC>
  </ResponsiveContainer></div>
}
