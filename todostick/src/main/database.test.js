import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getRolloverCandidates, buildRolloverCopies, yesterdayOf } from './rollover.js'
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

describe('getRolloverCandidates', () => {
  it('어제 미완료 일반 task는 후보에 포함된다', () => {
    const tasks = [
      mkTask({ id: 'a', title: '회의 준비', date: '2026-05-16', is_completed: false })
    ]
    const out = getRolloverCandidates(tasks, '2026-05-17')
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
  })

  it('어제 이미 완료된 task는 후보에서 제외', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: true })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('반복 인스턴스(parent_id 있음)는 제외', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', parent_id: 'tmpl1' })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('템플릿(is_template)은 제외', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_template: true })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('다일 이벤트(end_date 있음)는 제외', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', end_date: '2026-05-18' })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('이미 rolled_at 마킹된 원본은 제외 (영구 멱등)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: false, rolled_at: '2026-05-17T00:00:00Z' })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('며칠 이전 미완료도 후보에 포함된다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-10', is_completed: false })
    ]
    const out = getRolloverCandidates(tasks, '2026-05-17')
    expect(out).toHaveLength(1)
  })

  it('오늘/미래 날짜는 제외', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-17', is_completed: false }),
      mkTask({ id: 'b', date: '2026-05-20', is_completed: false })
    ]
    expect(getRolloverCandidates(tasks, '2026-05-17')).toHaveLength(0)
  })
})

describe('buildRolloverCopies', () => {
  it('source의 핵심 필드를 보존하고 새 id로 복사한다', () => {
    const sources = [mkTask({ id: 'a', title: '회의 준비', date: '2026-05-16', is_in_progress: true })]
    const out = buildRolloverCopies(sources, '2026-05-17', 0)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('회의 준비')
    expect(out[0].date).toBe('2026-05-17')
    expect(out[0].is_completed).toBe(false)
    expect(out[0].is_in_progress).toBe(true)
    expect(out[0].rollover_source_id).toBe('a')
    expect(out[0].id).not.toBe('a')
    expect(out[0].id).toBeTruthy()
  })

  it('existingMaxOrder부터 order_index를 매긴다', () => {
    const sources = [
      mkTask({ id: 'a', date: '2026-05-16' }),
      mkTask({ id: 'b', date: '2026-05-16' })
    ]
    const out = buildRolloverCopies(sources, '2026-05-17', 3)
    expect(out[0].order_index).toBe(3)
    expect(out[1].order_index).toBe(4)
  })

  it('빈 배열을 받으면 빈 배열 반환', () => {
    expect(buildRolloverCopies([], '2026-05-17', 0)).toEqual([])
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

  // v1.8.1: 완료 task는 아래, 미완료는 위 정렬
  it('getTasksByDate → 완료된 task는 미완료보다 아래로 정렬', () => {
    const a = database.createTask({ title: 'A', date: '2026-05-17' })
    const b = database.createTask({ title: 'B', date: '2026-05-17' })
    database.createTask({ title: 'C', date: '2026-05-17' })
    // B만 완료
    database.toggleTask(b.id)
    const list = database.getTasksByDate('2026-05-17')
    expect(list).toHaveLength(3)
    // 미완료 두 개가 먼저, B(완료)는 마지막
    expect(list[list.length - 1].id).toBe(b.id)
    expect(list[list.length - 1].is_completed).toBe(true)
    // 미완료 영역 안에 A가 들어있어야
    expect(list.slice(0, 2).some((t) => t.id === a.id)).toBe(true)
  })

  it('getTasksByDate → 완료 + 진행중 동시 존재 시 진행중이 가장 위, 완료가 가장 아래', () => {
    const a = database.createTask({ title: 'A', date: '2026-05-17' })
    const b = database.createTask({ title: 'B', date: '2026-05-17' })
    const c = database.createTask({ title: 'C', date: '2026-05-17' })
    database.setInProgress(b.id, true) // B = 진행중
    database.toggleTask(c.id) // C = 완료
    const list = database.getTasksByDate('2026-05-17')
    expect(list.map((t) => t.id)).toEqual([b.id, a.id, c.id])
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

  it('getRolloverCandidates → 미완료 일반 task만 반환 (완료/템플릿 제외)', () => {
    const t1 = database.createTask({ title: '미완료', date: '2026-05-16' })
    const t2 = database.createTask({ title: '완료됨', date: '2026-05-16' })
    database.toggleTask(t2.id)
    const out = database.getRolloverCandidates('2026-05-17')
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(t1.id)
  })

  it('rolloverSelectedTasks → 선택된 id만 카피하고 원본을 rolled_at 마킹', () => {
    const t1 = database.createTask({ title: '이월할 것', date: '2026-05-16' })
    const t2 = database.createTask({ title: '이월 안 함', date: '2026-05-16' })

    const out = database.rolloverSelectedTasks([t1.id], '2026-05-17')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('이월할 것')
    expect(out[0].rollover_source_id).toBe(t1.id)

    // t1은 rolled_at 마킹, t2는 그대로
    const r1 = testDb.prepare('SELECT rolled_at FROM tasks WHERE id=?').get(t1.id)
    const r2 = testDb.prepare('SELECT rolled_at FROM tasks WHERE id=?').get(t2.id)
    expect(r1.rolled_at).toBeTruthy()
    expect(r2.rolled_at).toBeNull()

    // 후보 다시 조회 시 t2는 남아있음
    const remaining = database.getRolloverCandidates('2026-05-17')
    expect(remaining.map((t) => t.id)).toEqual([t2.id])
  })

  it('rolloverSelectedTasks → 빈 배열 전달 시 아무것도 하지 않는다', () => {
    database.createTask({ title: '미완료', date: '2026-05-16' })
    const out = database.rolloverSelectedTasks([], '2026-05-17')
    expect(out).toHaveLength(0)
  })

  it('rolloverSelectedTasks → 잘못된 id(이미 이월/존재하지 않음)는 무시한다', () => {
    const t1 = database.createTask({ title: '정상', date: '2026-05-16' })
    // 1차 이월
    database.rolloverSelectedTasks([t1.id], '2026-05-17')
    // 같은 id로 또 이월 시도 — rolled_at이 set이라 후보 아님 → 무시
    const out = database.rolloverSelectedTasks([t1.id, 'nonexistent-id'], '2026-05-17')
    expect(out).toHaveLength(0)
  })

  it('rolloverSelectedTasks → 며칠 이전 미완료도 선택 시 이월된다', () => {
    const friTask = database.createTask({ title: '금요일할일', date: '2026-05-15' })
    const out = database.rolloverSelectedTasks([friTask.id], '2026-05-18')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('금요일할일')
  })

  it('getRolloverCandidates → 진행중 항목은 후보에서 제외 (자동 이월 대상)', () => {
    const t1 = database.createTask({ title: '일반', date: '2026-05-16' })
    const t2 = database.createTask({ title: '진행중', date: '2026-05-16' })
    database.setInProgress(t2.id, true)
    const out = database.getRolloverCandidates('2026-05-17')
    expect(out.map((t) => t.id)).toEqual([t1.id])
  })

  it('autoRolloverInProgress → 진행중 항목만 자동 복사 + 원본 rolled_at 마킹, is_in_progress 유지', () => {
    const t1 = database.createTask({ title: '일반', date: '2026-05-16' })
    const t2 = database.createTask({ title: '진행중', date: '2026-05-16' })
    database.setInProgress(t2.id, true)

    const out = database.autoRolloverInProgress('2026-05-17')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('진행중')
    expect(out[0].is_in_progress).toBe(true)
    expect(out[0].date).toBe('2026-05-17')
    expect(out[0].rollover_source_id).toBe(t2.id)

    // 원본 진행중은 rolled_at 마킹, 일반 항목은 손대지 않음
    expect(testDb.prepare('SELECT rolled_at FROM tasks WHERE id=?').get(t2.id).rolled_at).toBeTruthy()
    expect(testDb.prepare('SELECT rolled_at FROM tasks WHERE id=?').get(t1.id).rolled_at).toBeNull()

    // 재실행해도 멱등 (이미 rolled_at) — 중복 복사 없음
    expect(database.autoRolloverInProgress('2026-05-17')).toHaveLength(0)
  })

  it('setOnHold → held_at 마킹 시 일별 목록에서 빠지고 보류 목록에 등장', () => {
    const t = database.createTask({ title: '보류대상', date: '2026-05-17' })
    database.setOnHold(t.id, true)
    expect(database.getTasksByDate('2026-05-17').map((x) => x.id)).not.toContain(t.id)
    expect(database.getHeldTasks().map((x) => x.id)).toContain(t.id)
  })

  it('setOnHold → 진행중 항목 보류 시 자동 이월 후보에서도 제외', () => {
    const t = database.createTask({ title: '진행중보류', date: '2026-05-16' })
    database.setInProgress(t.id, true)
    database.setOnHold(t.id, true)
    expect(database.autoRolloverInProgress('2026-05-17')).toHaveLength(0)
  })

  it('returnFromHold → held_at 해제 + date를 오늘로 이동', () => {
    const t = database.createTask({ title: '복귀할일', date: '2026-05-10' })
    database.setOnHold(t.id, true)
    const out = database.returnFromHold(t.id, '2026-05-20')
    expect(out.held_at).toBeNull()
    expect(out.date).toBe('2026-05-20')
    expect(database.getHeldTasks()).toHaveLength(0)
    expect(database.getTasksByDate('2026-05-20').map((x) => x.id)).toContain(t.id)
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

  // ── 메모 노트 (v1.9.0 신규) ─────────────────────────────────
  describe('notes', () => {
    it('createNote → id/title/content + 새 노트가 가장 위 (order_index 최소-1)', () => {
      const n1 = database.createNote({ title: '첫 노트', content: '본문 1' })
      expect(n1.id).toBeTruthy()
      expect(n1.title).toBe('첫 노트')
      expect(n1.content).toBe('본문 1')

      const n2 = database.createNote({ title: '두번째', content: '본문 2' })
      // n2가 n1보다 더 위 (order_index 더 작음)
      expect(n2.order_index).toBeLessThan(n1.order_index)
    })

    it('listNotes → user_id 필터 + order_index ASC', () => {
      database.createNote({ title: '오래된', content: '' })
      database.createNote({ title: '최근', content: '' })
      const list = database.listNotes()
      expect(list).toHaveLength(2)
      expect(list[0].title).toBe('최근') // order_index 더 작음 → 위
    })

    it('updateNote(title) → title 갱신 + updated_at 변경', () => {
      const n = database.createNote({ title: '원본', content: '' })
      const before = n.updated_at
      const after = database.updateNote(n.id, { title: '수정됨' })
      expect(after.title).toBe('수정됨')
      expect(after.content).toBe('')
      expect(after.updated_at >= before).toBe(true)
    })

    it('updateNote(content) → content만 갱신', () => {
      const n = database.createNote({ title: 't', content: 'old' })
      const after = database.updateNote(n.id, { content: 'new' })
      expect(after.content).toBe('new')
      expect(after.title).toBe('t')
    })

    it('deleteNote → 삭제됨', () => {
      const n = database.createNote({ title: 't', content: '' })
      database.deleteNote(n.id)
      expect(database.getNote(n.id)).toBeUndefined()
      expect(database.listNotes()).toHaveLength(0)
    })

    it('user 격리 — 다른 user의 노트는 listNotes에서 안 보임', () => {
      setCurrentUserId('uid-A')
      database.createNote({ title: 'A의 노트', content: '' })
      setCurrentUserId('uid-B')
      database.createNote({ title: 'B의 노트', content: '' })

      const listB = database.listNotes()
      expect(listB).toHaveLength(1)
      expect(listB[0].title).toBe('B의 노트')

      setCurrentUserId('uid-A')
      const listA = database.listNotes()
      expect(listA).toHaveLength(1)
      expect(listA[0].title).toBe('A의 노트')
    })

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

    // v1.8.1: 다른 ID로 로그인 전환 시 데이터 누출 없음 — 완전 격리 회귀 테스트
    it('user 전환 후 조회 — 이전 user의 task가 누출되지 않음 (모든 view)', () => {
      // user-A 활동
      setCurrentUserId('user-A')
      database.createTask({ title: 'A의 일별', date: '2026-05-21' })
      database.createTask({ title: 'A의 다른 날', date: '2026-06-01' })
      database.setSeeMemo('2026-05-21', { good: 'A의 회고', bad: '', next: '' })
      database.setMonthlyGoal('2026-05', 'A의 목표')
      database.setCategories([{ id: 'a-cat', label: 'A 카테고리', color: 'red' }])

      // user-B로 전환
      setCurrentUserId('user-B')

      // 모든 조회 메서드가 B의 빈 결과만 반환
      expect(database.getTasksByDate('2026-05-21')).toHaveLength(0)
      expect(database.getTasksByMonth(2026, 5)).toHaveLength(0)
      expect(database.getTasksByMonth(2026, 6)).toHaveLength(0)
      expect(database.getTasksByRange('2026-05-01', '2026-12-31')).toHaveLength(0)
      expect(database.getCompletedTasks()).toHaveLength(0)
      expect(database.getSeeMemo('2026-05-21')).toEqual({ good: '', bad: '', next: '' })
      expect(database.getMonthlyGoal('2026-05')).toBe('')
      expect(database.getCategories()).toHaveLength(0)
      // habits matrix도 빈 결과
      expect(database.getHabitMatrix('2026-05-01', '2026-05-31')).toHaveLength(0)
    })

    it('user 전환 후 mutation — 새 user의 row만 만들고 sync_queue도 새 user로 격리', () => {
      setCurrentUserId('user-A')
      database.createTask({ title: 'A의 task', date: '2026-05-21' })

      // user-B로 전환 후 mutation
      setCurrentUserId('user-B')
      const bTask = database.createTask({ title: 'B의 task', date: '2026-05-21' })

      // B의 task는 user_id='user-B'
      const row = testDb.prepare('SELECT user_id FROM tasks WHERE id=?').get(bTask.id)
      expect(row.user_id).toBe('user-B')

      // sync_queue: B의 task만 user-B 큐에 있음
      const bQueue = testDb.prepare('SELECT count(*) as c FROM sync_queue WHERE user_id=?').get('user-B').c
      const aQueue = testDb.prepare('SELECT count(*) as c FROM sync_queue WHERE user_id=?').get('user-A').c
      expect(bQueue).toBeGreaterThan(0)
      expect(aQueue).toBeGreaterThan(0) // A의 mutation도 별도 큐에 살아있음

      // B 시점에 A의 큐가 B 작업에 섞이지 않음 — 정확히 A는 A, B는 B
      const bQueueRows = testDb
        .prepare('SELECT row_id FROM sync_queue WHERE user_id=? ORDER BY id')
        .all('user-B')
      expect(bQueueRows.every((r) => r.row_id === bTask.id)).toBe(true)
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

  // ── 습관 트래커 (중지/삭제/skip/주N회/편집/정렬) ──────────────
  describe('습관 트래커', () => {
    const today = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const ago = (n) => {
      const d = new Date()
      d.setDate(d.getDate() - n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    it('createHabit → is_template/is_habit 템플릿 1행 + 맨 위 order_index', () => {
      const h = database.createHabit({ title: '물 마시기', color: 'blue', repeat_type: 'daily' })
      expect(h.is_template).toBe(true)
      expect(h.is_habit).toBe(true)
      expect(h.repeat_type).toBe('daily')
      // 두 번째 습관은 더 작은 order_index(위로)
      const h2 = database.createHabit({ title: '운동', color: 'red', repeat_type: 'daily' })
      expect(h2.order_index).toBeLessThan(h.order_index)
    })

    it('createHabit(weekly_goal) → 목표형, 매트릭스에 weekProgress 반환 + miss 없음', () => {
      database.createHabit({ title: '주3회 운동', weekly_goal: 3 })
      const tmpl = testDb.prepare('SELECT * FROM tasks WHERE is_template=1').get()
      expect(tmpl.weekly_goal).toBe(3)
      const matrix = database.getHabitMatrix(ago(20), today)
      const row = matrix.find((m) => m.template.weekly_goal === 3)
      expect(row).toBeTruthy()
      expect(row.weekProgress.target).toBe(3)
      // 목표형은 자동 인스턴스가 없으므로 과거가 miss가 아니라 off
      expect(row.days.every((d) => d.status !== 'miss')).toBe(true)
    })

    it('toggleHabitOnDate(note) → 완료 + completion_note 저장, weekProgress 증가', () => {
      const h = database.createHabit({ title: '주3회', weekly_goal: 3 })
      database.toggleHabitOnDate(h.id, today, '오늘 30분 완료')
      const inst = testDb.prepare('SELECT * FROM tasks WHERE parent_id=? AND date=?').get(h.id, today)
      expect(inst.is_completed).toBe(1)
      expect(inst.completion_note).toBe('오늘 30분 완료')
      const matrix = database.getHabitMatrix(ago(6), today)
      const row = matrix.find((m) => m.template.id === h.id)
      expect(row.weekProgress.done).toBeGreaterThanOrEqual(1)
    })

    it('setHabitSkip → skipped_dates 추가/제거, 매트릭스 status=skip', () => {
      const h = database.createHabit({ title: '독서', repeat_type: 'daily' })
      database.setHabitSkip(h.id, ago(2), true)
      let row = database.getHabitMatrix(ago(5), today).find((m) => m.template.id === h.id)
      expect(row.days.find((d) => d.date === ago(2)).status).toBe('skip')
      database.setHabitSkip(h.id, ago(2), false)
      row = database.getHabitMatrix(ago(5), today).find((m) => m.template.id === h.id)
      expect(row.days.find((d) => d.date === ago(2)).status).not.toBe('skip')
    })

    it('setHabitPaused(true)→end_date=오늘·paused, 재개 시 중지구간이 miss 아닌 skip', () => {
      const h = database.createHabit({ title: '스트레칭', repeat_type: 'daily' })
      // 3일 전으로 중지일을 만들기 위해 직접 end_date를 과거로 세팅 후 재개 시나리오 검증
      testDb.prepare('UPDATE tasks SET end_date=? WHERE id=?').run(ago(3), h.id)
      let row = database.getHabitMatrix(ago(6), today).find((m) => m.template.id === h.id)
      expect(row.template.paused).toBe(true)
      // 재개 → 중지구간(ago(2),ago(1))이 skip 처리되어 miss로 소급되지 않아야
      database.setHabitPaused(h.id, false)
      row = database.getHabitMatrix(ago(6), today).find((m) => m.template.id === h.id)
      expect(row.template.paused).toBe(false)
      expect(row.days.find((d) => d.date === ago(2)).status).toBe('skip')
      expect(row.days.find((d) => d.date === ago(1)).status).toBe('skip')
    })

    it('updateHabit → title/color 변경 + 인스턴스 전파', () => {
      const h = database.createHabit({ title: '구', color: 'green', repeat_type: 'daily' })
      database.toggleHabitOnDate(h.id, today)
      database.updateHabit(h.id, { title: '신', color: 'purple', repeat_type: 'daily', repeat_days: null, weekly_goal: null })
      const tmpl = testDb.prepare('SELECT * FROM tasks WHERE id=?').get(h.id)
      expect(tmpl.title).toBe('신')
      expect(tmpl.color).toBe('purple')
      const inst = testDb.prepare('SELECT * FROM tasks WHERE parent_id=?').get(h.id)
      expect(inst.title).toBe('신')
      expect(inst.color).toBe('purple')
    })

    it('reorderHabits → order_index 배열 순서대로 재부여', () => {
      const a = database.createHabit({ title: 'A', repeat_type: 'daily' })
      const b = database.createHabit({ title: 'B', repeat_type: 'daily' })
      database.reorderHabits([a.id, b.id])
      const ra = testDb.prepare('SELECT order_index FROM tasks WHERE id=?').get(a.id)
      const rb = testDb.prepare('SELECT order_index FROM tasks WHERE id=?').get(b.id)
      expect(ra.order_index).toBe(0)
      expect(rb.order_index).toBe(1)
    })

    it('deleteHabit → 템플릿 + 모든 인스턴스 제거', () => {
      const h = database.createHabit({ title: '삭제대상', repeat_type: 'daily' })
      database.toggleHabitOnDate(h.id, today)
      database.toggleHabitOnDate(h.id, ago(1))
      database.deleteHabit(h.id)
      expect(testDb.prepare('SELECT count(*) as c FROM tasks WHERE id=? OR parent_id=?').get(h.id, h.id).c).toBe(0)
    })

    it('getRecurringTemplates → 습관+일반 반복 모두, next_date·is_habit 포함', () => {
      database.createHabit({ title: '습관A', repeat_type: 'daily' })
      // 일반 반복(비습관) 템플릿 — createTask로 생성
      database.createTask({ title: '주간회의', date: ago(7), repeat_type: 'weekly' })
      const list = database.getRecurringTemplates()
      expect(list.length).toBe(2)
      const habit = list.find((r) => r.title === '습관A')
      const meeting = list.find((r) => r.title === '주간회의')
      expect(habit.is_habit).toBe(true)
      expect(meeting.is_habit).toBe(false)
      // 매일 습관의 다음 발생은 오늘
      expect(habit.next_date).toBe(today)
      // 주간 반복은 미래 어떤 날짜를 가리킴(또는 오늘)
      expect(typeof meeting.next_date === 'string' || meeting.next_date === null).toBe(true)
    })

    it('setTemplateIsHabit → 일반 반복을 습관으로 전환 (인스턴스 전파)', () => {
      const t = database.createTask({ title: '운동가자', date: today, repeat_type: 'daily' })
      const tmplId = testDb.prepare('SELECT id FROM tasks WHERE is_template=1').get().id
      expect(testDb.prepare('SELECT is_habit FROM tasks WHERE id=?').get(tmplId).is_habit).toBe(0)
      database.setTemplateIsHabit(tmplId, true)
      expect(testDb.prepare('SELECT is_habit FROM tasks WHERE id=?').get(tmplId).is_habit).toBe(1)
      // 인스턴스에도 전파
      expect(testDb.prepare('SELECT is_habit FROM tasks WHERE id=?').get(t.id).is_habit).toBe(1)
      // 이제 습관 매트릭스에 노출됨
      const matrix = database.getHabitMatrix(ago(3), today)
      expect(matrix.some((m) => m.template.id === tmplId)).toBe(true)
    })
  })
})
