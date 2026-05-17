import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase } from './sqlite.js'

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
