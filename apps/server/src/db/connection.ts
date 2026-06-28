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
}
