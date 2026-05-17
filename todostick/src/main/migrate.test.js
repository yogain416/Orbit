import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase } from './sqlite.js'
import { migrateJsonToSqlite } from './migrate.js'

let tmp, db, jsonPath

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-migrate-'))
  db = openDatabase(join(tmp, 'orbit.db'))
  jsonPath = join(tmp, 'todostick.json')
})

afterEach(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('migrateJsonToSqlite', () => {
  it('빈 JSON은 0 task로 마이그레이션', () => {
    writeFileSync(jsonPath, JSON.stringify({ tasks: [], settings: {} }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.tasks).toBe(0)
  })

  it('tasks 배열의 항목들을 SQLite tasks 테이블에 insert', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [
        { id: 'a', title: '회의', date: '2026-05-17', is_completed: false, created_at: '2026-05-17T00:00:00Z', updated_at: '2026-05-17T00:00:00Z' },
        { id: 'b', title: '코드 리뷰', date: '2026-05-17', is_completed: true, created_at: '2026-05-17T00:00:00Z', updated_at: '2026-05-17T00:00:00Z' }
      ],
      settings: {}
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.tasks).toBe(2)
    const rows = db.prepare('SELECT id, title, is_completed FROM tasks ORDER BY id').all()
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBe('회의')
    expect(rows[1].is_completed).toBe(1)
  })

  it('settings.categories를 categories 테이블로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { categories: [{ id: 'work', label: '업무', color: 'blue' }] }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.categories).toBe(1)
    const cat = db.prepare('SELECT * FROM categories WHERE id=?').get('work')
    expect(cat.label).toBe('업무')
  })

  it('settings의 see:YYYY-MM-DD 키를 see_memos 테이블로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { 'see:2026-05-17': { good: 'g', bad: 'b', next: 'n' } }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.seeMemos).toBe(1)
    const memo = db.prepare('SELECT * FROM see_memos WHERE date=?').get('2026-05-17')
    expect(memo.good).toBe('g')
  })

  it('settings의 goal:YYYY-MM 키를 monthly_goals로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { 'goal:2026-05': '월간 목표' }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.goals).toBe(1)
    const goal = db.prepare('SELECT * FROM monthly_goals WHERE ym=?').get('2026-05')
    expect(goal.text).toBe('월간 목표')
  })

  it('나머지 settings는 settings 테이블에 그대로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { memo: 'free memo', shortcuts: { openMain: 'Ctrl+Shift+T' } }
    }))
    migrateJsonToSqlite(jsonPath, db)
    expect(db.prepare("SELECT value FROM settings WHERE key='memo'").get().value).toBe('free memo')
    expect(JSON.parse(db.prepare("SELECT value FROM settings WHERE key='shortcuts'").get().value).openMain).toBe('Ctrl+Shift+T')
  })

  it('repeat_days, skipped_dates 같은 배열은 JSON 문자열로 저장', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [{ id: 'a', title: 't', date: '2026-05-17', repeat_days: [1, 2, 3], skipped_dates: ['2026-05-10'], created_at: 'x', updated_at: 'x' }],
      settings: {}
    }))
    migrateJsonToSqlite(jsonPath, db)
    const row = db.prepare('SELECT repeat_days, skipped_dates FROM tasks WHERE id=?').get('a')
    expect(JSON.parse(row.repeat_days)).toEqual([1, 2, 3])
    expect(JSON.parse(row.skipped_dates)).toEqual(['2026-05-10'])
  })

  it('JSON 파일이 없으면 0 보고', () => {
    const result = migrateJsonToSqlite('/non/existent.json', db)
    expect(result.tasks).toBe(0)
    expect(result.skipped).toBe(true)
  })

  it('이미 SQLite에 데이터가 있으면 skip', () => {
    db.prepare("INSERT INTO meta (key, value) VALUES ('json_migrated', '1')").run()
    writeFileSync(jsonPath, JSON.stringify({ tasks: [{ id: 'a', title: 't', date: '2026-05-17', created_at: 'x', updated_at: 'x' }], settings: {} }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.skipped).toBe(true)
    expect(db.prepare('SELECT count(*) as c FROM tasks').get().c).toBe(0)
  })
})
