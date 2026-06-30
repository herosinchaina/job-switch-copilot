import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { LcProblemSchema, type LcProblem } from '@aios/shared'
import { z } from 'zod'

export function seedProblems(db: DatabaseSync): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../data/hot100.json')
  const problems = z.array(LcProblemSchema).parse(JSON.parse(readFileSync(file, 'utf8')))
  const stmt = db.prepare('INSERT OR IGNORE INTO lc_problems (leetcode_id,title,difficulty,topic,key_idea,url) VALUES (?,?,?,?,?,?)')
  for (const p of problems as LcProblem[]) stmt.run(p.leetcodeId, p.title, p.difficulty, p.topic, p.keyIdea, p.url)
}
