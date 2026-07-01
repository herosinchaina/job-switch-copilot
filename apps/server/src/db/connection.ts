import type { DatabaseSync } from 'node:sqlite'

export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      source_format TEXT NOT NULL, raw_text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS resume_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, resume_id INTEGER NOT NULL REFERENCES resumes(id),
      kind TEXT NOT NULL, parent_version_id INTEGER, structured_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      perspective TEXT NOT NULL, overall_score INTEGER NOT NULL,
      dimension_scores_json TEXT NOT NULL, suggestions_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS capability_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_module TEXT NOT NULL,
      metrics_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, company TEXT,
      raw_text TEXT NOT NULL, structured_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_kits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      job_description_id INTEGER,
      kit_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
  `)
  // 幂等加列:列已存在时 ALTER 会抛错,用 try/catch 吞掉。
  for (const col of ['job_description_id INTEGER', 'gap_json TEXT']) {
    try { db.exec(`ALTER TABLE reviews ADD COLUMN ${col}`) } catch { /* 已存在 */ }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      job_description_id INTEGER,
      cli_session_id TEXT,
      role TEXT NOT NULL,
      round_type TEXT NOT NULL,
      max_rounds INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'active',
      report_json TEXT,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS interview_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES interview_sessions(id),
      turn_index INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      score INTEGER,
      feedback_json TEXT,
      is_weak INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lc_problems (
      leetcode_id INTEGER PRIMARY KEY, title TEXT NOT NULL, difficulty TEXT NOT NULL,
      topic TEXT NOT NULL, key_idea TEXT NOT NULL, url TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lc_progress (
      leetcode_id INTEGER PRIMARY KEY REFERENCES lc_problems(leetcode_id),
      status TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS lc_guide_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, leetcode_id INTEGER NOT NULL REFERENCES lc_problems(leetcode_id),
      cli_session_id TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS lc_guide_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES lc_guide_sessions(id),
      turn_index INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT, created_at TEXT DEFAULT (datetime('now')));
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_deepdive_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      project_name TEXT NOT NULL, cli_session_id TEXT,
      max_rounds INTEGER NOT NULL DEFAULT 8, status TEXT NOT NULL DEFAULT 'active',
      map_json TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS project_deepdive_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES project_deepdive_sessions(id),
      turn_index INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT,
      score INTEGER, feedback_json TEXT, is_weak INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
  `)
}
