import Database from 'better-sqlite3'

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  date TEXT NOT NULL,
  end_date TEXT,
  is_completed INTEGER DEFAULT 0,
  is_in_progress INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  repeat_type TEXT DEFAULT 'none',
  repeat_days TEXT,
  order_index INTEGER DEFAULT 0,
  remind_at TEXT,
  color TEXT,
  category TEXT,
  is_habit INTEGER DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  is_template INTEGER DEFAULT 0,
  parent_id TEXT,
  skipped_dates TEXT,
  rollover_source_id TEXT,
  completion_note TEXT,
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS see_memos (
  date TEXT PRIMARY KEY,
  good TEXT DEFAULT '',
  bad TEXT DEFAULT '',
  next TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_goals (
  ym TEXT PRIMARY KEY,
  text TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

export function openDatabase(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  const stmt = db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
  stmt.run('schema_version', String(SCHEMA_VERSION))
  return db
}

export { SCHEMA_VERSION }
