import Database from 'better-sqlite3'

const SCHEMA_VERSION = 2

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
  rolled_at TEXT,
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

function applyMigrations(db) {
  // v1→v2: tasks.rolled_at 컬럼 추가. SCHEMA의 CREATE TABLE IF NOT EXISTS는 신규 DB에만 작동하므로,
  // 기존 v1 DB에는 ALTER TABLE로 직접 추가. PRAGMA로 컬럼 존재 여부 확인.
  const cols = db.prepare('PRAGMA table_info(tasks)').all().map((r) => r.name)
  if (!cols.includes('rolled_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN rolled_at TEXT')
  }
}

export function openDatabase(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  applyMigrations(db)
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
    'schema_version',
    String(SCHEMA_VERSION)
  )
  return db
}

export { SCHEMA_VERSION }
