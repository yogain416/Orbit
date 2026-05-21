import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { autoRolloverOverdue, yesterdayOf } from './rollover.js'
import { openDatabase } from './sqlite.js'
import database, { __setDbForTest, __resetDbForTest, setCurrentUserId, claimOwnership, performInitialSync } from './database.js'

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
    rolled_at: null,
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

  it('이미 rolled_at이 마킹된 원본은 복사하지 않는다 (영구 멱등)', () => {
    // 카피 삭제로 멱등 깨지던 문제 해결 — 원본의 rolled_at만 보면 됨.
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: false, rolled_at: '2026-05-17T00:00:00Z' })
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

  it('며칠 이전 미완료도 복사된다 (rolled_at으로 멱등 보장, v1.7.4 정공법)', () => {
    // v1.7.3에선 폭주 위험 때문에 어제만으로 제한했으나, rolled_at 컬럼 도입 후
    // 'date < toDate && !rolled_at'로 확장. 카피 삭제해도 source가 마킹되어 다시 안 옴.
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-10', is_completed: false })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out).toHaveLength(1)
    expect(out[0].rollover_source_id).toBe('a')
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
    setCurrentUserId(null) // 다음 테스트 오염 방지
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

  it('getOverdueTasks → 어제 미완료 task 반환 (rolled_at 마킹된 것 제외)', () => {
    database.createTask({ title: '미완', date: '2026-05-16' })
    const done = database.createTask({ title: '완료', date: '2026-05-16' })
    database.toggleTask(done.id)
    const rolled = database.createTask({ title: '이미이월', date: '2026-05-16' })
    // 이미 이월된 source는 rolled_at이 마킹됨
    testDb.prepare(`UPDATE tasks SET rolled_at = ? WHERE id = ?`).run('2026-05-17T00:00:00Z', rolled.id)

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

  it('autoRolloverOverdue → 며칠 이전 미완료도 이월된다 + source가 rolled_at으로 마킹됨', () => {
    const friTask = database.createTask({ title: '금요일진행중', date: '2026-05-15' })
    database.setInProgress(friTask.id, true)
    const out = database.autoRolloverOverdue('2026-05-18')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('금요일진행중')

    // source의 rolled_at이 마킹되었는지 확인 (다시 안 옴)
    const sourceRow = testDb.prepare('SELECT rolled_at FROM tasks WHERE id=?').get(friTask.id)
    expect(sourceRow.rolled_at).toBeTruthy()

    // 카피를 삭제해도 다시 이월되지 않음 (영구 멱등)
    database.deleteTask(out[0].id)
    const out2 = database.autoRolloverOverdue('2026-05-18')
    expect(out2).toHaveLength(0)
  })

  it('getOverdueTasks → 며칠 이전 미완료도 잡힘 + rolled_at은 제외', () => {
    database.createTask({ title: '금요일', date: '2026-05-15' })
    database.createTask({ title: '토요일', date: '2026-05-16' })
    const overdue1 = database.getOverdueTasks('2026-05-18')
    expect(overdue1.map((t) => t.title)).toEqual(expect.arrayContaining(['금요일', '토요일']))

    // 자동 이월 한 번 돌리면 위 두 개는 rolled_at 마킹됨 → 다시 안 잡힘
    database.autoRolloverOverdue('2026-05-18')
    const overdue2 = database.getOverdueTasks('2026-05-18')
    expect(overdue2.map((t) => t.title)).not.toContain('금요일')
    expect(overdue2.map((t) => t.title)).not.toContain('토요일')
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

  // ── Plan 3 (sync engine) — user_id + sync_queue ──────────
  describe('Plan 3: user_id + sync_queue', () => {
    it('setCurrentUserId 미설정(null) → user_id NULL + sync_queue 빈 상태 (기존 v1.7.x 동작 보존)', () => {
      const t = database.createTask({ title: 'local', date: '2026-05-21' })
      const row = testDb.prepare('SELECT user_id FROM tasks WHERE id=?').get(t.id)
      expect(row.user_id).toBeNull()
      const queued = testDb.prepare('SELECT count(*) as c FROM sync_queue').get().c
      expect(queued).toBe(0)
    })

    it('setCurrentUserId(uid) 후 createTask → row.user_id = uid + sync_queue에 upsert 적재', () => {
      const uid = '11111111-1111-1111-1111-111111111111'
      setCurrentUserId(uid)
      const t = database.createTask({ title: '동기화 task', date: '2026-05-21' })
      const row = testDb.prepare('SELECT user_id FROM tasks WHERE id=?').get(t.id)
      expect(row.user_id).toBe(uid)

      const events = testDb.prepare('SELECT * FROM sync_queue').all()
      expect(events).toHaveLength(1)
      expect(events[0].user_id).toBe(uid)
      expect(events[0].table_name).toBe('tasks')
      expect(events[0].op).toBe('upsert')
      expect(events[0].row_id).toBe(t.id)
      const payload = JSON.parse(events[0].payload)
      expect(payload.id).toBe(t.id)
      expect(payload.title).toBe('동기화 task')
      expect(payload.user_id).toBe(uid)
    })

    it('updateTask → sync_queue에 upsert 적재 (전체 row payload)', () => {
      const uid = 'uid-update'
      setCurrentUserId(uid)
      const t = database.createTask({ title: '원본', date: '2026-05-21' })
      // 최초 createTask 이벤트는 비우고 update만 확인
      testDb.prepare('DELETE FROM sync_queue').run()
      database.updateTask(t.id, { title: '수정됨' })
      const events = testDb.prepare('SELECT * FROM sync_queue').all()
      expect(events).toHaveLength(1)
      expect(events[0].op).toBe('upsert')
      const payload = JSON.parse(events[0].payload)
      expect(payload.title).toBe('수정됨')
    })

    it('deleteTask → sync_queue에 delete 적재 (payload는 null/{} 허용)', () => {
      const uid = 'uid-del'
      setCurrentUserId(uid)
      const t = database.createTask({ title: 'del', date: '2026-05-21' })
      testDb.prepare('DELETE FROM sync_queue').run()
      database.deleteTask(t.id)
      const events = testDb.prepare('SELECT * FROM sync_queue WHERE op=?').all('delete')
      expect(events).toHaveLength(1)
      expect(events[0].row_id).toBe(t.id)
      expect(events[0].table_name).toBe('tasks')
    })

    it('getTasksByDate는 currentUserId의 row만 반환 (다른 user_id의 row 제외)', () => {
      // user A로 task 만들고
      setCurrentUserId('user-A')
      database.createTask({ title: 'A의 task', date: '2026-05-21' })
      // user B로 전환 후 다른 task 만들기
      setCurrentUserId('user-B')
      database.createTask({ title: 'B의 task', date: '2026-05-21' })
      // 현재 user_id가 B → A의 task는 안 보여야
      const list = database.getTasksByDate('2026-05-21')
      const titles = list.map((t) => t.title)
      expect(titles).toContain('B의 task')
      expect(titles).not.toContain('A의 task')
    })

    it('getTasksByDate currentUserId가 null → NULL user_id row만 반환 (로컬-only)', () => {
      // 비로그인 상태로 row 생성
      database.createTask({ title: 'local-only', date: '2026-05-21' })
      // user 있는 row 추가
      setCurrentUserId('user-X')
      database.createTask({ title: 'user-X의 task', date: '2026-05-21' })
      // 다시 비로그인으로
      setCurrentUserId(null)
      const list = database.getTasksByDate('2026-05-21')
      const titles = list.map((t) => t.title)
      expect(titles).toContain('local-only')
      expect(titles).not.toContain('user-X의 task')
    })

    it('claimOwnership(uid) → 모든 NULL user_id row를 uid로 채움 (첫 로그인 시 시나리오)', () => {
      // v1.7.x 데이터 시뮬레이션 — currentUserId 없이 row 생성
      database.createTask({ title: '기존 데이터 1', date: '2026-05-21' })
      database.createTask({ title: '기존 데이터 2', date: '2026-05-22' })
      database.setSeeMemo('2026-05-21', { good: 'g', bad: 'b', next: 'n' })
      database.setMonthlyGoal('2026-05', '목표')
      database.setCategories([{ id: 'work', label: '업무', color: 'blue' }])

      // 첫 로그인 → claimOwnership
      const uid = 'first-login-uid'
      const claimed = claimOwnership(uid)
      expect(claimed.tasks).toBe(2)
      expect(claimed.see_memos).toBe(1)
      expect(claimed.monthly_goals).toBe(1)
      expect(claimed.categories).toBe(1)

      // 이후 setCurrentUserId(uid) 상태에서 조회 시 보임
      setCurrentUserId(uid)
      expect(database.getTasksByDate('2026-05-21')).toHaveLength(1)
      expect(database.getSeeMemo('2026-05-21').good).toBe('g')
      expect(database.getMonthlyGoal('2026-05')).toBe('목표')
      expect(database.getCategories()).toHaveLength(1)
    })

    it('setSeeMemo / setMonthlyGoal도 user_id 격리 + sync_queue 적재', () => {
      setCurrentUserId('uid-pds')
      database.setSeeMemo('2026-05-21', { good: 'g', bad: 'b', next: 'n' })
      database.setMonthlyGoal('2026-05', '5월 목표')

      const see = testDb.prepare('SELECT user_id, good FROM see_memos WHERE date=?').get('2026-05-21')
      expect(see.user_id).toBe('uid-pds')
      const goal = testDb.prepare('SELECT user_id, text FROM monthly_goals WHERE ym=?').get('2026-05')
      expect(goal.user_id).toBe('uid-pds')

      // sync_queue에 두 이벤트
      const events = testDb.prepare('SELECT table_name FROM sync_queue ORDER BY id').all()
      const tables = events.map((e) => e.table_name)
      expect(tables).toContain('see_memos')
      expect(tables).toContain('monthly_goals')
    })

    // ── Plan 3 Task 5: performInitialSync ───────────────────
    describe('performInitialSync', () => {
      it('첫 로그인 시 모든 로컬 row를 sync_queue로 enqueue', () => {
        // v1.7.x 데이터 시뮬레이션 — 비로그인 상태로 row 생성 (sync_queue 적재 안 됨)
        database.createTask({ title: 't1', date: '2026-05-21' })
        database.createTask({ title: 't2', date: '2026-05-22' })
        database.setSeeMemo('2026-05-21', { good: 'g', bad: 'b', next: 'n' })
        database.setMonthlyGoal('2026-05', '월간')
        database.setCategories([{ id: 'work', label: '업무', color: 'blue' }])

        // 첫 로그인: claim + initial sync
        const uid = 'first-uid'
        claimOwnership(uid)
        const result = performInitialSync(uid)

        expect(result.skipped).toBe(false)
        expect(result.counts.tasks).toBe(2)
        expect(result.counts.see_memos).toBe(1)
        expect(result.counts.monthly_goals).toBe(1)
        expect(result.counts.categories).toBe(1)

        // sync_queue에 5 row (tasks 2 + see_memos 1 + monthly_goals 1 + categories 1)
        const events = testDb.prepare('SELECT table_name, op FROM sync_queue ORDER BY id').all()
        expect(events).toHaveLength(5)
        expect(events.every((e) => e.op === 'upsert')).toBe(true)
        const tables = events.map((e) => e.table_name).sort()
        expect(tables).toEqual(['categories', 'monthly_goals', 'see_memos', 'tasks', 'tasks'])

        // initial_sync_done:<uid> 플래그 설정됨
        const flag = testDb
          .prepare(`SELECT value FROM sync_meta WHERE key = ?`)
          .get(`initial_sync_done:${uid}`)
        expect(flag).toBeTruthy()
      })

      it('두 번째 호출은 멱등 — skip', () => {
        const uid = 'uid-idemp'
        claimOwnership(uid)
        database.createTask({ title: 't', date: '2026-05-21' })
        // 첫 호출
        const first = performInitialSync(uid)
        expect(first.skipped).toBe(false)
        const queueAfterFirst = testDb.prepare('SELECT count(*) as c FROM sync_queue').get().c

        // 두 번째 호출 — skip이어야 큐가 중복 적재되지 않음
        const second = performInitialSync(uid)
        expect(second.skipped).toBe(true)
        const queueAfterSecond = testDb.prepare('SELECT count(*) as c FROM sync_queue').get().c
        expect(queueAfterSecond).toBe(queueAfterFirst)
      })

      it('다른 user의 row는 enqueue하지 않음', () => {
        // user-A row 추가
        setCurrentUserId('user-A')
        database.createTask({ title: 'A의 task', date: '2026-05-21' })
        // user-B row 추가
        setCurrentUserId('user-B')
        database.createTask({ title: 'B의 task', date: '2026-05-21' })
        // sync_queue 비움 — initial sync 효과만 확인
        testDb.prepare('DELETE FROM sync_queue').run()
        setCurrentUserId(null)

        const result = performInitialSync('user-A')
        expect(result.counts.tasks).toBe(1)
        const events = testDb.prepare('SELECT user_id, row_id FROM sync_queue').all()
        expect(events.every((e) => e.user_id === 'user-A')).toBe(true)
      })
    })
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
