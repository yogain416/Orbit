import Database from 'better-sqlite3'

const SCHEMA_VERSION = 3

// v3 SCHEMA — 신규 DB는 이걸로 즉시 생성된다.
// 기존 v1/v2 DB는 CREATE TABLE IF NOT EXISTS가 막아주고, applyMigrations()가 ALTER/재구성을 처리한다.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT,
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
  user_id TEXT,
  label TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS see_memos (
  user_id TEXT,
  date TEXT NOT NULL,
  good TEXT DEFAULT '',
  bad TEXT DEFAULT '',
  next TEXT DEFAULT '',
  updated_at TEXT,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS monthly_goals (
  user_id TEXT,
  ym TEXT NOT NULL,
  text TEXT DEFAULT '',
  updated_at TEXT,
  PRIMARY KEY (user_id, ym)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  table_name TEXT NOT NULL,
  op TEXT NOT NULL,
  row_id TEXT,
  payload TEXT,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

function hasColumn(db, table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all()
  return rows.some((r) => r.name === col)
}

function pkColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((r) => r.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((r) => r.name)
}

function applyMigrations(db) {
  // v1→v2: tasks.rolled_at 컬럼 추가. PRAGMA로 컬럼 존재 여부 확인.
  if (!hasColumn(db, 'tasks', 'rolled_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN rolled_at TEXT')
  }

  // v2→v3: Plan 3 sync engine.
  //   - tasks/categories에 user_id 컬럼 추가
  //   - monthly_goals/see_memos는 PK를 (user_id, ym) / (user_id, date)로 재구성
  //   - sync_queue/sync_meta는 SCHEMA의 CREATE IF NOT EXISTS가 처리
  if (!hasColumn(db, 'tasks', 'user_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN user_id TEXT')
  }
  if (!hasColumn(db, 'categories', 'user_id')) {
    db.exec('ALTER TABLE categories ADD COLUMN user_id TEXT')
  }
  // tasks.user_id 인덱스는 컬럼 존재 보장 후에 멱등 생성 (신규 DB든 마이그레이션이든 둘 다 커버)
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)')

  // monthly_goals: 기존 PK가 (ym)이라면 (user_id, ym)으로 재구성
  const mgPk = pkColumns(db, 'monthly_goals')
  if (!(mgPk.length === 2 && mgPk[0] === 'user_id' && mgPk[1] === 'ym')) {
    db.exec(`
      CREATE TABLE monthly_goals_new (
        user_id TEXT,
        ym TEXT NOT NULL,
        text TEXT DEFAULT '',
        updated_at TEXT,
        PRIMARY KEY (user_id, ym)
      );
      INSERT INTO monthly_goals_new (user_id, ym, text, updated_at)
        SELECT NULL, ym, text, updated_at FROM monthly_goals;
      DROP TABLE monthly_goals;
      ALTER TABLE monthly_goals_new RENAME TO monthly_goals;
    `)
  }

  // see_memos: 기존 PK가 (date)라면 (user_id, date)로 재구성
  const smPk = pkColumns(db, 'see_memos')
  if (!(smPk.length === 2 && smPk[0] === 'user_id' && smPk[1] === 'date')) {
    db.exec(`
      CREATE TABLE see_memos_new (
        user_id TEXT,
        date TEXT NOT NULL,
        good TEXT DEFAULT '',
        bad TEXT DEFAULT '',
        next TEXT DEFAULT '',
        updated_at TEXT,
        PRIMARY KEY (user_id, date)
      );
      INSERT INTO see_memos_new (user_id, date, good, bad, next, updated_at)
        SELECT NULL, date, good, bad, next, updated_at FROM see_memos;
      DROP TABLE see_memos;
      ALTER TABLE see_memos_new RENAME TO see_memos;
    `)
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
