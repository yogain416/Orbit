import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { openDatabase, SCHEMA_VERSION } from './sqlite.js'

let tmp
let db

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-sqlite-'))
  db = openDatabase(join(tmp, 'orbit.db'))
})

afterEach(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('빈 DB에서 스키마 적용', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
    expect(tables).toContain('tasks')
    expect(tables).toContain('categories')
    expect(tables).toContain('settings')
    expect(tables).toContain('see_memos')
    expect(tables).toContain('monthly_goals')
    expect(tables).toContain('meta')
  })

  it('tasks 테이블에 필수 컬럼 존재', () => {
    const cols = db.prepare('PRAGMA table_info(tasks)').all().map(r => r.name)
    const required = ['id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress',
      'is_starred', 'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category',
      'is_habit', 'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates',
      'rollover_source_id', 'completion_note', 'completed_at', 'created_at', 'updated_at']
    for (const col of required) {
      expect(cols).toContain(col)
    }
  })

  it('schema_version meta 키가 설정됨', () => {
    const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()
    expect(row).toBeTruthy()
    expect(Number(row.value)).toBeGreaterThan(0)
  })

  it('재오픈 시 데이터 보존', () => {
    db.prepare('INSERT INTO tasks (id, title, date) VALUES (?, ?, ?)').run('id1', '회의', '2026-05-17')
    db.close()
    db = openDatabase(join(tmp, 'orbit.db'))
    const row = db.prepare('SELECT title FROM tasks WHERE id=?').get('id1')
    expect(row.title).toBe('회의')
  })
})

// ── Plan 3 (Sync engine) — schema v3 ──────────────────────────
describe('schema v3 (sync engine)', () => {
  it('SCHEMA_VERSION === 3', () => {
    expect(SCHEMA_VERSION).toBe(3)
  })

  it('tasks 테이블에 user_id 컬럼 존재', () => {
    const cols = db.prepare('PRAGMA table_info(tasks)').all().map((r) => r.name)
    expect(cols).toContain('user_id')
  })

  it('categories 테이블에 user_id 컬럼 존재', () => {
    const cols = db.prepare('PRAGMA table_info(categories)').all().map((r) => r.name)
    expect(cols).toContain('user_id')
  })

  it('monthly_goals: (user_id, ym) 복합 PK', () => {
    const pk = db.prepare('PRAGMA table_info(monthly_goals)').all()
      .filter((r) => r.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((r) => r.name)
    expect(pk).toEqual(['user_id', 'ym'])
  })

  it('see_memos: (user_id, date) 복합 PK', () => {
    const pk = db.prepare('PRAGMA table_info(see_memos)').all()
      .filter((r) => r.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((r) => r.name)
    expect(pk).toEqual(['user_id', 'date'])
  })

  it('sync_queue 테이블 + 필수 컬럼 존재', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
    expect(tables).toContain('sync_queue')
    const cols = db.prepare('PRAGMA table_info(sync_queue)').all().map((r) => r.name)
    for (const c of ['id', 'user_id', 'table_name', 'op', 'row_id', 'payload', 'attempts', 'last_attempt_at', 'last_error', 'created_at']) {
      expect(cols).toContain(c)
    }
  })

  it('sync_meta 테이블 존재 (key/value)', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
    expect(tables).toContain('sync_meta')
    const cols = db.prepare('PRAGMA table_info(sync_meta)').all().map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['key', 'value']))
  })

  it('v2 → v3 마이그레이션: 기존 데이터 보존 + user_id NULL + 신규 테이블 생성', () => {
    // beforeEach의 v3 DB와 충돌 피하기 — 별도 tmp 경로 사용
    const migTmp = mkdtempSync(join(tmpdir(), 'orbit-mig-'))
    const migPath = join(migTmp, 'orbit.db')
    // raw v2 스키마(user_id 없음, monthly_goals/see_memos는 단일 PK)로 DB 생성
    const raw = new Database(migPath)
    raw.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT, memo TEXT, date TEXT, end_date TEXT,
        is_completed INTEGER DEFAULT 0, is_in_progress INTEGER DEFAULT 0, is_starred INTEGER DEFAULT 0,
        repeat_type TEXT, repeat_days TEXT, order_index INTEGER, remind_at TEXT, color TEXT, category TEXT,
        is_habit INTEGER DEFAULT 0, start_time TEXT, end_time TEXT, is_template INTEGER DEFAULT 0,
        parent_id TEXT, skipped_dates TEXT, rollover_source_id TEXT, rolled_at TEXT,
        completion_note TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE see_memos (date TEXT PRIMARY KEY, good TEXT DEFAULT '', bad TEXT DEFAULT '', next TEXT DEFAULT '', updated_at TEXT);
      CREATE TABLE monthly_goals (ym TEXT PRIMARY KEY, text TEXT DEFAULT '', updated_at TEXT);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '2');
      INSERT INTO tasks (id, title, date) VALUES ('t1', '구버전 task', '2026-05-17');
      INSERT INTO categories (id, label, color) VALUES ('work', '업무', 'blue');
      INSERT INTO monthly_goals (ym, text) VALUES ('2026-05', '5월 목표');
      INSERT INTO see_memos (date, good, bad, next) VALUES ('2026-05-17', 'g', 'b', 'n');
    `)
    raw.close()

    // v3 openDatabase로 다시 열기 → 자동 마이그레이션 수행
    const migDb = openDatabase(migPath)

    try {
      // 1) 기존 데이터 보존
      expect(migDb.prepare('SELECT title FROM tasks WHERE id=?').get('t1').title).toBe('구버전 task')
      expect(migDb.prepare('SELECT label FROM categories WHERE id=?').get('work').label).toBe('업무')
      expect(migDb.prepare('SELECT text FROM monthly_goals WHERE ym=?').get('2026-05').text).toBe('5월 목표')
      expect(migDb.prepare('SELECT good FROM see_memos WHERE date=?').get('2026-05-17').good).toBe('g')

      // 2) user_id 컬럼 추가됨 (NULL)
      expect(migDb.prepare('SELECT user_id FROM tasks WHERE id=?').get('t1').user_id).toBeNull()
      expect(migDb.prepare('SELECT user_id FROM monthly_goals WHERE ym=?').get('2026-05').user_id).toBeNull()
      expect(migDb.prepare('SELECT user_id FROM see_memos WHERE date=?').get('2026-05-17').user_id).toBeNull()

      // 3) monthly_goals/see_memos 복합 PK 적용됨
      const mgPk = migDb.prepare('PRAGMA table_info(monthly_goals)').all().filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk).map((r) => r.name)
      expect(mgPk).toEqual(['user_id', 'ym'])

      // 4) 신규 테이블 생성
      const tables = migDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
      expect(tables).toContain('sync_queue')
      expect(tables).toContain('sync_meta')

      // 5) schema_version 갱신
      const ver = migDb.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value
      expect(Number(ver)).toBe(3)
    } finally {
      migDb.close()
      rmSync(migTmp, { recursive: true, force: true })
    }
  })
})
