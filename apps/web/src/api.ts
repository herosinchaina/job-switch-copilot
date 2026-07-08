import type { StructuredResume, Review, JobDescription, InterviewKit, RoundType, TurnFeedback, InterviewReport, ProgressStatus, LcProblem, DeepdiveFeedback, ProjectMap, KnowledgeItem, KnowledgeItemInput, ReviewGrade } from '@aios/shared'
async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json()
}
const json = (body: unknown): RequestInit => ({ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
export const api = {
  health: () => j<{cli:{ok:boolean;detail:string}}>('/api/health'),
  listResumes: () => j<{id:number;title:string;createdAt:string}[]>('/api/resumes'),
  uploadResume: (file: File) => { const fd = new FormData(); fd.append('file', file)
    return j<{resumeId:number;versionId:number;structured:StructuredResume}>('/api/resumes', { method:'POST', body: fd }) },
  updateVersion: (id: number, structured: StructuredResume) =>
    j<{ok:true}>(`/api/resumes/versions/${id}`, { ...json({ structured }), method:'PUT' }),
  confirmVersion: (id: number) => j<{ok:true}>(`/api/resumes/versions/${id}/confirm`, { method:'POST' }),
  listJds: () => j<{id:number;title:string;company:string;createdAt:string}[]>('/api/jds'),
  createJd: (input: { title:string; company?:string; rawText:string }) =>
    j<{id:number; structured:JobDescription}>('/api/jds', json(input)),
  review: (versionId: number, jobDescriptionId?: number) =>
    j<{hr:Review;interviewer:Review;gap?:import('@aios/shared').GapAnalysis}>(
      '/api/reviews', json(jobDescriptionId == null ? { versionId } : { versionId, jobDescriptionId })),
  optimize: (versionId: number, suggestions: Review['suggestions']) =>
    j<{versionId:number;structured:StructuredResume}>('/api/optimize', json({ versionId, suggestions })),
  generateKit: (versionId: number, jobDescriptionId?: number) =>
    j<{id:number; kit:InterviewKit}>('/api/kits',
      json(jobDescriptionId == null ? { versionId } : { versionId, jobDescriptionId })),
  startInterview: (input: { versionId:number; jobDescriptionId?:number; roundType:RoundType; maxRounds?:number }) =>
    j<{sessionId:number; turnIndex:number; question:string}>('/api/interviews', json(input)),
  answerInterview: (sessionId: number, answer: string) =>
    j<{feedback:TurnFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; report?:InterviewReport}>(
      `/api/interviews/${sessionId}/answer`, json({ answer })),
  getInterview: (sessionId: number) =>
    j<{session:any; turns:any[]}>(`/api/interviews/${sessionId}`),
  listInterviews: () =>
    j<{id:number; role:string; roundType:RoundType; status:'active'|'finished'; overallScore:number|null; createdAt:string}[]>('/api/interviews'),
  lcProblems: () => j<(LcProblem & { status: ProgressStatus })[]>('/api/lc/problems'),
  lcSummary: () => j<{total:number;mastered:number;learning:number;byTopic:{topic:string;total:number;mastered:number}[]}>('/api/lc/summary'),
  setLcProgress: (leetcodeId:number, status:ProgressStatus) =>
    j<{ok:true}>(`/api/lc/problems/${leetcodeId}/progress`, { ...json({ status }), method:'PUT' }),
  startGuide: (leetcodeId:number) => j<{sessionId:number; guidance:string}>('/api/lc/guides', json({ leetcodeId })),
  stepGuide: (sessionId:number, answer:string) => j<{guidance:string; done:boolean}>(`/api/lc/guides/${sessionId}/step`, json({ answer })),
  getGuide: (sessionId:number) => j<{session:any; turns:any[]}>(`/api/lc/guides/${sessionId}`),
  startDeepdive: (input: { versionId:number; projectName:string; maxRounds?:number }) =>
    j<{sessionId:number; turnIndex:number; question:string}>('/api/deepdives', json(input)),
  answerDeepdive: (sessionId:number, answer:string) =>
    j<{feedback:DeepdiveFeedback|null; nextQuestion:string|null; turnIndex:number; finished:boolean; map?:ProjectMap}>(
      `/api/deepdives/${sessionId}/answer`, json({ answer })),
  getDeepdive: (sessionId:number) => j<{session:any; turns:any[]}>(`/api/deepdives/${sessionId}`),
  listDeepdives: () => j<{id:number; projectName:string; status:'active'|'finished'; avgScore:number|null; createdAt:string}[]>('/api/deepdives'),
  listKnowledge: (f: { source?:string; tag?:string; mastery?:number; q?:string } = {}) => {
    const p = new URLSearchParams()
    if (f.source) p.set('source', f.source)
    if (f.tag) p.set('tag', f.tag)
    if (typeof f.mastery === 'number') p.set('mastery', String(f.mastery))
    if (f.q) p.set('q', f.q)
    const qs = p.toString()
    return j<KnowledgeItem[]>(`/api/knowledge${qs ? '?' + qs : ''}`)
  },
  createKnowledge: (input: KnowledgeItemInput) => j<KnowledgeItem>('/api/knowledge', json(input)),
  getKnowledge: (id: number) => j<KnowledgeItem>(`/api/knowledge/${id}`),
  updateKnowledge: (id: number, input: KnowledgeItemInput) => j<KnowledgeItem>(`/api/knowledge/${id}`, { ...json(input), method:'PUT' }),
  deleteKnowledge: (id: number) => j<{ok:true}>(`/api/knowledge/${id}`, { method:'DELETE' }),
  listDue: () => j<KnowledgeItem[]>('/api/knowledge/due'),
  reviewKnowledge: (id: number, grade: ReviewGrade) => j<KnowledgeItem>(`/api/knowledge/${id}/review`, json({ grade })),
  listKnowledgeTags: () => j<string[]>('/api/knowledge/tags'),
  importKnowledge: (input: { from:'interview'|'deepdive'; sessionId:number }) => j<{imported:number;skipped:number}>('/api/knowledge/import', json(input)),
}
