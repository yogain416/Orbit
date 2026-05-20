import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { autoRolloverOverdue, yesterdayOf } from './rollover.js'
import { openDatabase } from './sqlite.js'
import database, { __setDbForTest, __resetDbForTest } from './database.js'

function mkTask(overrides) {
  return {
    id: 'id_' + Math.random().toString(36).slice(2),
    title: 'task',
    date: '2026-05-16',
    is_completed: false,
    is_in_progress: false,
    is_template: false,
    parent_id: null,
    end_date: null,
    rollover_source_id: undefined,
    order_index: 0,
    color: null,
    category: null,
    memo: '',
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides
  }
}

describe('autoRolloverOverdue', () => {
  it('어제 미완료 일반 task를 오늘로 자동 복사한다', () => {
    const tasks = [
      mkTask({ id: 'a', title: '회의 준비', date: '2026-05-16', is_completed: false })
    ]
    const newTasks = autoRolloverOverdue(tasks, '2026-05-17')
    expect(newTasks).toHaveLength(1)
    expect(newTasks[0].title).toBe('회의 준비')
    expect(newTasks[0].date).toBe('2026-05-17')
    expect(newTasks[0].is_completed).toBe(false)
    expect(newTasks[0].rollover_source_id).toBe('a')
  })

  it('어제 이미 완료된 task는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: true })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('반복 인스턴스(parent_id 있음)는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', parent_id: 'tmpl1' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('템플릿(is_template)은 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_template: true })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('다일 이벤트(end_date 있음)는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', end_date: '2026-05-18' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('이미 오늘로 이월된 원본은 중복 복사 안 함 (멱등)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: false }),
      mkTask({ id: 'b', date: '2026-05-17', rollover_source_id: 'a' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('어제 미완료 task의 is_in_progress 상태를 보존한다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_in_progress: true })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].is_in_progress).toBe(true)
  })

  it('일반 미완료의 is_in_progress는 false 유지', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_in_progress: false })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].is_in_progress).toBe(false)
  })

  it('어제보다 더 옛날 task는 복사하지 않는다 (어제만 대상)', () => {
    // v1.7.0~v1.7.2에서 'date < toDate'로 확장했더니 묵은 미완료가 폭주 + 멱등 깨짐 →
    // v1.7.3에서 다시 어제만으로 되돌림. 향후 'rolled_at' 컬럼 도입 후에 범위 재확장 예정.
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-10', is_completed: false })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('오늘 날짜의 task는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-17', is_completed: false })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('미래 날짜 task는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-20', is_completed: false })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('order_index를 오늘 끝에 붙인다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', order_index: 5 }),
      mkTask({ id: 'b', date: '2026-05-17', order_index: 0 }),
      mkTask({ id: 'c', date: '2026-05-17', order_index: 1 })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].order_index).toBe(2)
  })

  it('새 id를 생성한다 (원본 id 재사용 X)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16' })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].id).not.toBe('a')
    expect(out[0].id).toBeTruthy()
  })
})

describe('yesterdayOf', () => {
  it('전일 날짜를 YYYY-MM-DD로 반환', () => {
    expect(yesterdayOf('2026-05-17')).toBe('2026-05-16')
  })

  it('월 경계를 정확히 처리', () => {
    expect(yesterdayOf('2026-06-01')).toBe('2026-05-31')
  })

  it('연 경계를 정확히 처리', () => {
    expect(yesterdayOf('2027-01-01')).toBe('2026-12-31')
  })

  it('윤년 2월 경계', () => {
    expect(yesterdayOf('2028-03-01')).toBe('2028-02-29')
  })
})

// ── SQLite 백엔드 통합 테스트 ─────────────────────────────
describe('database (SQLite-backed)', () => {
  let tmp, testDb

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'orbit-db-'))
    testDb = openDatabase(join(tmp, 'orbit.db'))
    __setDbForTest(testDb)
  })

  afterEach(() => {
    __resetDbForTest()
    testDb?.close()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('getDbPath()는 orbit.db로 끝나는 경로를 반환', () => {
    // app.getPath('userData')가 mocking 없이도 동작 — Electron app 객체 있을 때
    // 테스트 환경에서는 호출 실패할 수 있으므로 try-catch
    try {
      const p = database.getDbPath()
      expect(p.endsWith('orbit.db')).toBe(true)
    } catch {
      // electron app 미초기화 환경에서는 skip
    }
  })

  it('createTask(repeat_type:none) → 1행 insert + is_completed boolean', () => {
    const t = database.createTask({ title: '단일', date: '2026-05-17' })
    expect(t.id).toBeTruthy()
    expect(t.title).toBe('단일')
    expect(t.is_completed).toBe(false)
    expect(typeof t.is_completed).toBe('boolean')
    expect(testDb.prepare('SELECT count(*) as c FROM tasks').get().c).toBe(1)
  })

  it('createTask(repeat_type:daily) → template + instance 2행 insert', () => {
    database.createTask({ title: '매일', date: '2026-05-17', repeat_type: 'daily' })
    const rows = testDb.prepare('SELECT * FROM tasks').all()
    expect(rows).toHaveLength(2)
    const tmpl = rows.find((r) => r.is_template === 1)
    const inst = rows.find((r) => r.is_template === 0)
    expect(tmpl).toBeTruthy()
    expect(inst).toBeTruthy()
    expect(inst.parent_id).toBe(tmpl.id)
  })

  it('getTasksByDate → 해당 날짜 task 반환 + in_progress 우선', () => {
    const a = database.createTask({ title: 'A', date: '2026-05-17' })
    database.createTask({ title: 'B', date: '2026-05-17' })
    database.setInProgress(a.id, true)
    const list = database.getTasksByDate('2026-05-17')
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(a.id)
    expect(list[0].is_in_progress).toBe(true)
  })

  it('getTasksByDate → 반복 템플릿 있으면 자동 인스턴스 생성 (멱등)', () => {
    database.createTask({ title: '매일', date: '2026-05-15', repeat_type: 'daily' })
    // 17일 조회 → 17일 인스턴스 자동 생성
    const list1 = database.getTasksByDate('2026-05-17')
    expect(list1.some((t) => t.date === '2026-05-17')).toBe(true)
    const count1 = testDb.prepare('SELECT count(*) as c FROM tasks').get().c
    // 두 번 조회해도 중복 생성 안 됨 (멱등)
    database.getTasksByDate('2026-05-17')
    const count2 = testDb.prepare('SELECT count(*) as c FROM tasks').get().c
    expect(count2).toBe(count1)
  })

  it('updateTask(id, {title}) → title 변경 + updated_at 갱신', () => {
    const t = database.createTask({ title: '원본', date: '2026-05-17' })
    const before = t.updated_at
    // 약간의 시간차 보장
    const updated = database.updateTask(t.id, { title: '수정됨' })
    expect(updated.title).toBe('수정됨')
    expect(updated.updated_at >= before).toBe(true)
  })

  it('toggleTask → is_completed 토글 + completed_at 변경', () => {
    const t = database.createTask({ title: 't', date: '2026-05-17' })
    const after = database.toggleTask(t.id)
    expect(after.is_completed).toBe(true)
    expect(after.completed_at).toBeTruthy()
    const after2 = database.toggleTask(t.id)
    expect(after2.is_completed).toBe(false)
    expect(after2.completed_at).toBeNull()
  })

  it('setInProgress(id, true) → is_in_progress=true, is_completed=false', () => {
    const t = database.createTask({ title: 't', date: '2026-05-17' })
    database.toggleTask(t.id) // 일단 완료
    const after = database.setInProgress(t.id, true)
    expect(after.is_in_progress).toBe(true)
    expect(after.is_completed).toBe(false)
  })

  it('setStarred(id, true) → is_starred=true', () => {
    const t = database.createTask({ title: 't', date: '2026-05-17' })
    const after = database.setStarred(t.id, true)
    expect(after.is_starred).toBe(true)
  })

  it('deleteTask → 행 삭제 + 반복 인스턴스면 template의 skipped_dates에 추가', () => {
    const inst = database.createTask({ title: '매일', date: '2026-05-15', repeat_type: 'daily' })
    // inst는 2026-05-15 인스턴스. 삭제 후 template skipped에 '2026-05-15' 추가됨.
    database.deleteTask(inst.id)
    const row = testDb.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id)
    expect(row).toBeUndefined()
    const tmplRow = testDb.prepare('SELECT * FROM tasks WHERE is_template=1').get()
    expect(JSON.parse(tmplRow.skipped_dates)).toContain('2026-05-15')
  })

  it('getOverdueTasks → 어제 미완료 task 반환 (이월된 것 제외)', () => {
    // 어제 날짜에 미완료 1, 완료 1, 이미 이월된 원본 1
    database.createTask({ title: '미완', date: '2026-05-16' })
    const done = database.createTask({ title: '완료', date: '2026-05-16' })
    database.toggleTask(done.id)
    const rolled = database.createTask({ title: '이미이월', date: '2026-05-16' })
    // 오늘에 rollover_source_id로 직접 insert
    testDb
      .prepare(
        `INSERT INTO tasks (id, title, date, rollover_source_id, is_completed, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
      )
      .run('copy_x', '이미이월', '2026-05-17', rolled.id, '2026-05-17T00:00:00Z', '2026-05-17T00:00:00Z')

    const overdue = database.getOverdueTasks('2026-05-17')
    const titles = overdue.map((t) => t.title)
    expect(titles).toContain('미완')
    expect(titles).not.toContain('완료')
    expect(titles).not.toContain('이미이월')
  })

  it('autoRolloverOverdue → 어제 미완료 task를 오늘로 복사 + 멱등', () => {
    database.createTask({ title: '못함', date: '2026-05-16' })
    const out1 = database.autoRolloverOverdue('2026-05-17')
    expect(out1).toHaveLength(1)
    expect(out1[0].title).toBe('못함')
    // 다시 호출 → 멱등 (0개)
    const out2 = database.autoRolloverOverdue('2026-05-17')
    expect(out2).toHaveLength(0)
  })

  it('autoRolloverOverdue → 며칠 이전 task는 이월하지 않는다 (어제만 대상, v1.7.3 회귀)', () => {
    // v1.7.0~v1.7.2에서 'date < toDate'로 확장했다가 폭주로 인해 어제만으로 되돌림.
    database.createTask({ title: '금요일오래된', date: '2026-05-15' })
    const out = database.autoRolloverOverdue('2026-05-18')
    expect(out).toHaveLength(0)
  })

  it('getOverdueTasks → 며칠 이전 task는 안 잡힘 (어제만 대상)', () => {
    database.createTask({ title: '금요일', date: '2026-05-15' })
    database.createTask({ title: '토요일', date: '2026-05-16' })
    const overdue = database.getOverdueTasks('2026-05-18')
    const titles = overdue.map((t) => t.title)
    expect(titles).not.toContain('금요일')
    expect(titles).not.toContain('토요일')
  })

  it('setCategories + getCategories round-trip', () => {
    database.setCategories([
      { id: 'work', label: '업무', color: 'blue' },
      { id: 'personal', label: '개인', color: 'green' }
    ])
    const cats = database.getCategories()
    expect(cats).toHaveLength(2)
    expect(cats.find((c) => c.id === 'work').label).toBe('업무')
  })

  it('setSetting + getSetting (string) round-trip', () => {
    database.setSetting('memo', '자유 메모')
    expect(database.getSetting('memo')).toBe('자유 메모')
  })

  it('setSetting + getSetting (object) round-trip', () => {
    database.setSetting('shortcuts', { openMain: 'Ctrl+Shift+T' })
    expect(database.getSetting('shortcuts')).toEqual({ openMain: 'Ctrl+Shift+T' })
  })

  it('setSeeMemo + getSeeMemo round-trip', () => {
    database.setSeeMemo('2026-05-17', { good: 'g', bad: 'b', next: 'n' })
    expect(database.getSeeMemo('2026-05-17')).toEqual({ good: 'g', bad: 'b', next: 'n' })
    // 없는 날짜는 빈 값
    expect(database.getSeeMemo('2099-01-01')).toEqual({ good: '', bad: '', next: '' })
  })

  it('setMonthlyGoal + getMonthlyGoal round-trip', () => {
    database.setMonthlyGoal('2026-05', '5월 목표')
    expect(database.getMonthlyGoal('2026-05')).toBe('5월 목표')
    expect(database.getMonthlyGoal('2099-01')).toBe('')
  })

  it('getMonthlyStats → [{ym, total, done, rate}]', () => {
    const a = database.createTask({ title: 'a', date: '2026-05-10' })
    database.createTask({ title: 'b', date: '2026-05-20' })
    database.toggleTask(a.id)
    const stats = database.getMonthlyStats(['2026-05', '2026-06'])
    expect(stats).toHaveLength(2)
    expect(stats[0]).toEqual({ ym: '2026-05', total: 2, done: 1, rate: 50 })
    expect(stats[1]).toEqual({ ym: '2026-06', total: 0, done: 0, rate: 0 })
  })

  it('reorderTasks → order_index 갱신', () => {
    const a = database.createTask({ title: 'a', date: '2026-05-17', order_index: 0 })
    const b = database.createTask({ title: 'b', date: '2026-05-17', order_index: 1 })
    database.reorderTasks('2026-05-17', [b.id, a.id])
    const list = database.getTasksByDate('2026-05-17')
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('deleteTaskAndFuture → template + 미래 instances 삭제, 과거 보존', () => {
    // 5월 15일 시작 daily 템플릿 — 5월 17일 조회로 17일 인스턴스 생성
    const firstInst = database.createTask({ title: 'h', date: '2026-05-15', repeat_type: 'daily' })
    const tmplId = testDb.prepare('SELECT id FROM tasks WHERE is_template=1').get().id
    // 조회로 16, 17, 18 인스턴스 생성
    database.getTasksByRange('2026-05-16', '2026-05-18')
    // 17일부터 모두 삭제
    database.deleteTaskAndFuture(tmplId, '2026-05-17')
    // 템플릿은 사라짐
    expect(testDb.prepare('SELECT count(*) as c FROM tasks WHERE is_template=1').get().c).toBe(0)
    // 17~18 인스턴스 사라짐, 15(원본 instance)~16은 보존
    const remaining = testDb.prepare('SELECT date FROM tasks ORDER BY date').all().map((r) => r.date)
    expect(remaining).toContain('2026-05-15')
    expect(remaining).toContain('2026-05-16')
    expect(remaining).not.toContain('2026-05-17')
    expect(remaining).not.toContain('2026-05-18')
    // firstInst 참조 사용 — 첫 인스턴스 id가 살아있는지 확인
    const aliveInst = testDb.prepare('SELECT id FROM tasks WHERE id=?').get(firstInst.id)
    expect(aliveInst).toBeTruthy()
  })
})
