import { join } from 'path'
import { app } from 'electron'
import { openDatabase } from './sqlite.js'
import { migrateJsonToSqlite } from './migrate.js'
import { getRolloverCandidates as computeRolloverCandidates, getInProgressRolloverCandidates as computeInProgressRolloverCandidates, buildRolloverCopies, yesterdayOf } from './rollover.js'
import { buildRepeatInstancesForDate, shouldRepeatOnDate } from './repeat.js'

// ── 모듈 전역 상태 ──────────────────────────────────────────
let _db = null
// Plan 3 (sync engine): 현재 로그인 user의 id. 비로그인 시 null = 로컬-only.
// main/index.js의 인증 hook에서 setCurrentUserId() 호출.
let _currentUserId = null

export function setCurrentUserId(uid) {
  _currentUserId = uid || null
}

export function getCurrentUserId() {
  return _currentUserId
}

function dbPath() {
  return join(app.getPath('userData'), 'orbit.db')
}

function jsonPath() {
  return join(app.getPath('userData'), 'todostick.json')
}

// v1.7.0~v1.7.2의 rollover 폭주 버그로 오늘에 박힌 묵은 카피를 일회성으로 정리.
// 'rollover_source_id가 있고 source의 date가 어제보다 이전인' 카피만 삭제 — 어제 카피는 정상.
// meta 플래그로 한 번만 실행. v1.7.3에서 도입.
function cleanupRolloverFloodOnce(db) {
  try {
    const already = db
      .prepare("SELECT value FROM meta WHERE key='rollover_flood_cleanup_v1'")
      .get()
    if (already) return 0

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = yesterdayOf(today)

    const deleted = db
      .prepare(
        `DELETE FROM tasks
         WHERE id IN (
           SELECT copy.id FROM tasks copy
           JOIN tasks src ON copy.rollover_source_id = src.id
           WHERE copy.date = ? AND src.date < ?
         )`
      )
      .run(today, yesterday).changes

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('rollover_flood_cleanup_v1', '1')"
    ).run()

    if (deleted > 0) {
      console.log(`[cleanup] rollover flood: ${deleted} 카피 삭제됨`)
    }
    return deleted
  } catch (e) {
    console.error('[cleanup] rollover_flood_cleanup failed:', e)
    return 0
  }
}

// v3→v4 마이그레이션: 기존 settings.memo (단일 메모) → notes 테이블의 첫 노트로 시드.
// 멱등성: meta 'notes_seeded_from_memo_v1' 플래그로 한 번만 실행. settings.memo 값은 보존(원본 안전).
function seedNotesFromLegacyMemoOnce(db) {
  try {
    const already = db
      .prepare("SELECT value FROM meta WHERE key='notes_seeded_from_memo_v1'")
      .get()
    if (already) return 0

    const memoRow = db.prepare("SELECT value FROM settings WHERE key='memo'").get()
    const legacyMemo = memoRow && memoRow.value ? String(memoRow.value).trim() : ''

    let inserted = 0
    if (legacyMemo) {
      const now = new Date().toISOString()
      const id = 'note_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      db.prepare(
        `INSERT INTO notes (id, user_id, title, content, order_index, created_at, updated_at)
         VALUES (?, NULL, ?, ?, 0, ?, ?)`
      ).run(id, '기본 메모', legacyMemo, now, now)
      inserted = 1
    }

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('notes_seeded_from_memo_v1', '1')"
    ).run()

    if (inserted > 0) {
      console.log('[seed] legacy memo → notes 1건 시드 완료')
    }
    return inserted
  } catch (e) {
    console.error('[seed] notes_from_memo failed:', e)
    return 0
  }
}

// rolled_at 컬럼이 새로 추가되었으므로 (v1.7.4 schema_version=2), 기존 DB의 '이미 이월된 적 있는'
// 원본들을 모두 마킹해서 다시 자동 이월 candidate가 되지 않게 한다.
// 한 번이라도 카피된 원본 = rollover_source_id로 참조된 원본.
function backfillRolledAtOnce(db) {
  try {
    const already = db
      .prepare("SELECT value FROM meta WHERE key='rolled_at_backfill_v1'")
      .get()
    if (already) return 0

    const now = new Date().toISOString()
    const updated = db
      .prepare(
        `UPDATE tasks
         SET rolled_at = ?
         WHERE rolled_at IS NULL
           AND id IN (
             SELECT DISTINCT rollover_source_id FROM tasks WHERE rollover_source_id IS NOT NULL
           )`
      )
      .run(now).changes

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('rolled_at_backfill_v1', '1')"
    ).run()

    if (updated > 0) {
      console.log(`[backfill] rolled_at: ${updated} 원본 마킹됨`)
    }
    return updated
  } catch (e) {
    console.error('[backfill] rolled_at backfill failed:', e)
    return 0
  }
}

function getDb() {
  if (_db) return _db
  _db = openDatabase(dbPath())
  try {
    migrateJsonToSqlite(jsonPath(), _db)
  } catch (e) {
    console.error('[migrate] failed:', e)
  }
  cleanupRolloverFloodOnce(_db)
  backfillRolledAtOnce(_db)
  seedNotesFromLegacyMemoOnce(_db)
  return _db
}

// Plan 3: sync.js가 better-sqlite3 raw handle을 필요로 한다 (sync_queue/sync_meta 직접 조작).
// database.js 외부에서 호출되는 공용 핸들 게터.
export function getRawDb() {
  return getDb()
}

// 테스트 전용 hook — production에선 호출되지 않음.
// getDb()는 _db가 set이면 그대로 사용 → app.getPath 의존을 우회 가능.
export function __setDbForTest(db) {
  _db = db
}

export function __resetDbForTest() {
  _db = null
}

// ── 헬퍼 ───────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function nowIso() {
  return new Date().toISOString()
}

// 로컬(사용자 시계) 기준 'YYYY-MM-DD'. 렌더러의 getTodayStr와 동일 기준 —
// UTC(toISOString) todayStr와 섞이면 KST 오전 0~9시에 하루가 어긋나므로 습관 로직은 이걸 쓴다.
function todayStrLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 주어진 로컬 날짜의 '어제'. (중지 재개 시 갭 계산용)
function prevDateStr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ISO 주(월요일 시작)의 시작/끝 'YYYY-MM-DD'. 주 N회 목표 진척 계산용.
function isoWeekRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=일
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: fmt(monday), end: fmt(sunday) }
}

// 원본 task에 rolled_at 마킹 — 한 번 이월된 원본은 다시 이월되지 않게.
function markRolledAt(db, ids, now) {
  if (!ids || ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE tasks SET rolled_at = ? WHERE id IN (${placeholders}) AND rolled_at IS NULL`
  ).run(now, ...ids)
}

const TASK_COLS = [
  'id', 'user_id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress', 'is_starred',
  'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category', 'is_habit',
  'weekly_goal',
  'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates', 'rollover_source_id',
  'rolled_at', 'held_at',
  'completion_note', 'completed_at', 'created_at', 'updated_at'
]
const BOOL_COLS = new Set(['is_completed', 'is_in_progress', 'is_starred', 'is_habit', 'is_template'])
const ARRAY_COLS = new Set(['repeat_days', 'skipped_dates'])

// SQLite row → JS task object (boolean/array 디시리얼라이즈)
function rowToTask(row) {
  if (!row) return null
  const t = { ...row }
  for (const c of BOOL_COLS) t[c] = !!t[c]
  for (const c of ARRAY_COLS) {
    if (t[c]) {
      try {
        t[c] = JSON.parse(t[c])
      } catch {
        t[c] = c === 'skipped_dates' ? [] : null
      }
    } else {
      t[c] = c === 'skipped_dates' ? [] : null
    }
  }
  return t
}

// JS value → SQLite-storable value (boolean → 0/1, array → JSON string)
function valForCol(col, value) {
  if (value === undefined) return null
  if (value === null) return null
  if (BOOL_COLS.has(col)) return value ? 1 : 0
  if (ARRAY_COLS.has(col)) return value ? JSON.stringify(value) : null
  return value
}

// ── Plan 3: sync_queue enqueue ──────────────────────────────
// currentUserId가 null이면 enqueue하지 않음 (오프라인/비로그인 = 로컬-only 모드).
// payload는 JSON 문자열로 직렬화된 row 전체 (upsert) 또는 null (delete).
function enqueueSync(db, tableName, op, rowId, payload) {
  const uid = getCurrentUserId()
  if (!uid) return
  db.prepare(
    `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid, tableName, op, rowId, payload ? JSON.stringify(payload) : null, nowIso())
}

// 로컬 row 전체를 sync payload로 직렬화 (boolean/array 정규화).
function taskRowToPayload(row) {
  const t = rowToTask(row)
  return t
}

// ── Plan 3: 첫 로그인 시 v1.7.x 로컬 데이터의 NULL user_id를 채움 ─────
export function claimOwnership(uid) {
  if (!uid) throw new Error('claimOwnership requires a user id')
  const db = getDb()
  const result = { tasks: 0, categories: 0, monthly_goals: 0, see_memos: 0 }
  db.transaction(() => {
    result.tasks = db.prepare(`UPDATE tasks SET user_id = ? WHERE user_id IS NULL`).run(uid).changes
    result.categories = db.prepare(`UPDATE categories SET user_id = ? WHERE user_id IS NULL`).run(uid).changes
    result.monthly_goals = db.prepare(`UPDATE monthly_goals SET user_id = ? WHERE user_id IS NULL`).run(uid).changes
    result.see_memos = db.prepare(`UPDATE see_memos SET user_id = ? WHERE user_id IS NULL`).run(uid).changes
  })()
  return result
}

// ── Plan 3: 첫 로그인 시 로컬 전체를 sync_queue로 적재 ────────────
// v1.7.x에선 enqueueSync가 currentUserId=null이라 no-op. → 첫 로그인 직후 1회
// 모든 로컬 row를 upsert 큐로 밀어넣어야 Supabase로 올라간다.
// sync_meta의 `initial_sync_done:<uid>` 플래그로 멱등 — 두 번째 로그인부터는 skip.
export function performInitialSync(uid) {
  if (!uid) throw new Error('performInitialSync requires a user id')
  const db = getDb()
  const flagKey = `initial_sync_done:${uid}`
  const flag = db.prepare(`SELECT value FROM sync_meta WHERE key = ?`).get(flagKey)
  if (flag) return { skipped: true, reason: 'already_done' }

  const now = nowIso()
  const counts = { tasks: 0, categories: 0, monthly_goals: 0, see_memos: 0 }
  const insertSync = db.prepare(
    `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const upsertMeta = db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )

  db.transaction(() => {
    // tasks: rowToTask로 boolean/array 정규화한 JS object → JSON
    const tasks = db.prepare(`SELECT * FROM tasks WHERE user_id = ?`).all(uid)
    for (const row of tasks) {
      const payload = rowToTask(row)
      insertSync.run(uid, 'tasks', 'upsert', row.id, JSON.stringify(payload), now)
      counts.tasks++
    }
    // categories: 로컬에 updated_at 없으므로 now를 부여
    const cats = db.prepare(`SELECT id, label, color FROM categories WHERE user_id = ?`).all(uid)
    for (const c of cats) {
      const payload = { id: c.id, user_id: uid, label: c.label, color: c.color || null, updated_at: now }
      insertSync.run(uid, 'categories', 'upsert', c.id, JSON.stringify(payload), now)
      counts.categories++
    }
    const mgs = db.prepare(`SELECT ym, text, updated_at FROM monthly_goals WHERE user_id = ?`).all(uid)
    for (const m of mgs) {
      const payload = { user_id: uid, ym: m.ym, text: m.text || '', updated_at: m.updated_at || now }
      insertSync.run(uid, 'monthly_goals', 'upsert', `${uid}|${m.ym}`, JSON.stringify(payload), now)
      counts.monthly_goals++
    }
    const sms = db.prepare(`SELECT date, good, bad, next, updated_at FROM see_memos WHERE user_id = ?`).all(uid)
    for (const s of sms) {
      const payload = {
        user_id: uid, date: s.date,
        good: s.good || '', bad: s.bad || '', next: s.next || '',
        updated_at: s.updated_at || now
      }
      insertSync.run(uid, 'see_memos', 'upsert', `${uid}|${s.date}`, JSON.stringify(payload), now)
      counts.see_memos++
    }

    upsertMeta.run(flagKey, now)
  })()

  return { skipped: false, counts }
}

function getAllTasks() {
  // Plan 3: 현재 user_id 격리 — 같은 PC에 다른 계정 데이터가 있어도 안 섞임.
  const uid = getCurrentUserId()
  return getDb().prepare('SELECT * FROM tasks WHERE user_id IS ?').all(uid).map(rowToTask)
}

function insertTaskRow(db, task) {
  const stmt = db.prepare(
    `INSERT INTO tasks (${TASK_COLS.join(', ')}) VALUES (${TASK_COLS.map(() => '?').join(', ')})`
  )
  stmt.run(...TASK_COLS.map((c) => valForCol(c, task[c])))
}

function dateRange(startDate, endDate) {
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (cur <= end) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    )
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// 특정 날짜에 누락된 반복 인스턴스를 DB에 INSERT (멱등).
// 멱등성: buildRepeatInstancesForDate가 이미 존재하는 인스턴스를 걸러냄.
// Plan 3: 새 인스턴스에 현재 user_id 주입 (템플릿이 user-filtered 풀에서 왔으니 같은 user) + sync enqueue.
function ensureRepeatInstancesForDate(date) {
  const db = getDb()
  const tasks = getAllTasks()
  const newInstances = buildRepeatInstancesForDate(tasks, date, generateId)
  if (newInstances.length === 0) return false
  const uid = getCurrentUserId()
  db.transaction(() => {
    for (const inst of newInstances) {
      inst.user_id = uid
      insertTaskRow(db, inst)
      enqueueSync(db, 'tasks', 'upsert', inst.id, taskRowToPayload(inst))
    }
  })()
  return true
}

function ensureRepeatInstancesForRange(fromDate, toDate) {
  let changed = false
  for (const date of dateRange(fromDate, toDate)) {
    if (ensureRepeatInstancesForDate(date)) changed = true
  }
  return changed
}

// 정렬 비교자 (특정 날짜 한정 — getTasksByDate에서 사용).
function sortDayTasks(a, b) {
  // 1순위: 완료된 task는 아래로 — 미완료 우선 (v1.8.1)
  const aDone = !!a.is_completed
  const bDone = !!b.is_completed
  if (aDone !== bDone) return aDone ? 1 : -1
  // 진행중 우선 (단 완료 아닐 때만)
  const aInProg = !!a.is_in_progress && !aDone
  const bInProg = !!b.is_in_progress && !bDone
  if (aInProg !== bInProg) return aInProg ? -1 : 1
  const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
  if (star) return star
  if (a.order_index !== b.order_index) return a.order_index - b.order_index
  return (a.created_at || '').localeCompare(b.created_at || '')
}

// 정렬 비교자 (날짜 묶음 — getTasksByMonth/Range에서 사용).
function sortMultiDayTasks(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  // 같은 날짜 안에서는 미완료 우선 (v1.8.1)
  const aDone = !!a.is_completed
  const bDone = !!b.is_completed
  if (aDone !== bDone) return aDone ? 1 : -1
  const aInProg = !!a.is_in_progress && !aDone
  const bInProg = !!b.is_in_progress && !bDone
  if (aInProg !== bInProg) return aInProg ? -1 : 1
  const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
  if (star) return star
  return a.order_index - b.order_index
}

// ── seed (dev 모드용) ──────────────────────────────────────
function seedIfEmpty() {
  const db = getDb()
  const count = db.prepare('SELECT count(*) as c FROM tasks').get().c
  if (count > 0) return false

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const now = nowIso()

  const mk = (overrides) => ({
    id: generateId(),
    title: '', memo: '', date: today, end_date: null,
    is_completed: false, is_in_progress: false, is_starred: false,
    repeat_type: 'none', repeat_days: null, order_index: 0,
    remind_at: null, color: null, category: null, is_habit: false,
    start_time: null, end_time: null,
    is_template: false, parent_id: null, skipped_dates: null,
    rollover_source_id: null,
    completion_note: null, completed_at: null,
    created_at: now, updated_at: now,
    ...overrides
  })

  const tasks = []
  tasks.push(mk({ title: '🧪 [DEV] 회의 준비', category: 'work', color: 'blue', start_time: '10:00', end_time: '11:00', order_index: 0 }))
  tasks.push(mk({ title: '🧪 [DEV] 점심 약속', category: 'personal', color: 'green', start_time: '12:30', end_time: '13:30', order_index: 1 }))
  tasks.push(mk({ title: '🧪 [DEV] 코드 리뷰', category: 'work', color: 'blue', order_index: 2 }))
  tasks.push(mk({ title: '🧪 [DEV] 어제 못 끝낸 일', date: yesterday, order_index: 99 }))

  const stretchT = mk({
    title: '🌱 [DEV] 스트레칭 10분', date: lastWeek,
    repeat_type: 'daily', is_template: true, is_habit: true,
    color: 'orange', category: 'health', skipped_dates: []
  })
  tasks.push(stretchT)
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    if (i % 3 === 0) continue
    tasks.push(mk({
      title: stretchT.title, date: d,
      repeat_type: 'daily', is_habit: true, color: 'orange', category: 'health',
      parent_id: stretchT.id,
      is_completed: true, completed_at: new Date(Date.now() - i * 86400000).toISOString()
    }))
  }

  const waterT = mk({
    title: '🌱 [DEV] 물 8잔 마시기', date: lastWeek,
    repeat_type: 'daily', repeat_days: [1, 2, 3, 4, 5],
    is_template: true, is_habit: true,
    color: 'blue', category: 'health', skipped_dates: []
  })
  tasks.push(waterT)

  const meetingT = mk({
    title: '🧪 [DEV] 주간 팀 미팅', date: lastWeek,
    repeat_type: 'weekly', is_template: true,
    color: 'purple', category: 'work', skipped_dates: []
  })
  tasks.push(meetingT)

  const insertCat = db.prepare('INSERT OR REPLACE INTO categories (id, label, color) VALUES (?, ?, ?)')
  db.transaction(() => {
    for (const t of tasks) insertTaskRow(db, t)
    const cats = [
      { id: 'work', label: '업무', color: 'blue' },
      { id: 'personal', label: '개인', color: 'green' },
      { id: 'health', label: '운동', color: 'orange' }
    ]
    for (const c of cats) insertCat.run(c.id, c.label, c.color)
  })()

  return true
}

// Plan 3: 현재 user_id를 row에 채워 mutation에 사용. 비로그인이면 NULL.
function withUserId(task) {
  return { ...task, user_id: getCurrentUserId() }
}

// ── default export ─────────────────────────────────────────
export default {
  getDbPath: () => dbPath(),
  seedIfEmpty,

  // ── 조회 (Plan 3: 모두 user_id 격리, SQLite의 `IS ?`가 NULL/값 둘 다 안전 비교) ──
  getTasksByDate(date) {
    ensureRepeatInstancesForDate(date)
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ?
           AND is_template = 0
           AND held_at IS NULL
           AND (date = ?
                OR (end_date IS NOT NULL AND date <= ? AND ? <= end_date))`
      )
      .all(uid, date, date, date)
    return rows.map(rowToTask).sort(sortDayTasks)
  },

  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const daysInMonth = new Date(year, month, 0).getDate()
    const startDate = `${prefix}-01`
    const endDate = `${prefix}-${String(daysInMonth).padStart(2, '0')}`
    ensureRepeatInstancesForRange(startDate, endDate)
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ?
           AND is_template = 0
           AND held_at IS NULL
           AND (date LIKE ?
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
      )
      .all(uid, `${prefix}-%`, endDate, startDate)
    return rows.map(rowToTask).sort(sortMultiDayTasks)
  },

  getTasksByRange(startDate, endDate) {
    ensureRepeatInstancesForRange(startDate, endDate)
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ?
           AND is_template = 0
           AND held_at IS NULL
           AND ((date >= ? AND date <= ?)
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
      )
      .all(uid, startDate, endDate, endDate, startDate)
    return rows.map(rowToTask).sort(sortMultiDayTasks)
  },

  getTodayReminders(date) {
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ?
           AND date = ?
           AND remind_at IS NOT NULL
           AND is_template = 0`
      )
      .all(uid, date)
    return rows.map(rowToTask)
  },

  getCompletedTasks({ category, search } = {}) {
    const db = getDb()
    const uid = getCurrentUserId()
    let sql = `SELECT * FROM tasks WHERE user_id IS ? AND is_completed = 1 AND is_template = 0`
    const params = [uid]
    if (category) {
      sql += ` AND category = ?`
      params.push(category)
    }
    const rows = db.prepare(sql).all(...params)
    const filtered = rows.map(rowToTask).filter((t) => {
      if (search) {
        const s = search.toLowerCase()
        const inTitle = (t.title || '').toLowerCase().includes(s)
        const inNote = (t.completion_note || '').toLowerCase().includes(s)
        if (!inTitle && !inNote) return false
      }
      return true
    })
    return filtered.sort((a, b) =>
      ((b.completed_at || b.updated_at) || '').localeCompare(a.completed_at || a.updated_at || '')
    )
  },

  getPoolTasks(poolKey) {
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(`SELECT * FROM tasks WHERE user_id IS ? AND date = ? AND is_template = 0`)
      .all(uid, poolKey)
    return rows
      .map(rowToTask)
      .sort((a, b) =>
        a.order_index - b.order_index || (a.created_at || '').localeCompare(b.created_at || '')
      )
  },

  // ── 쓰기 (Plan 3: user_id 주입 + sync_queue enqueue) ────────
  createTask({
    title,
    memo = '',
    date,
    end_date = null,
    repeat_type = 'none',
    repeat_days = null,
    order_index = 0,
    remind_at = null,
    color = null,
    category = null,
    is_habit = false,
    start_time = null,
    end_time = null
  }) {
    const db = getDb()
    const uid = getCurrentUserId()
    const habit = repeat_type !== 'none' && !!is_habit
    const isPoolKey = typeof date === 'string' && (date.startsWith('M:') || date.startsWith('W:'))
    const resolvedEndDate =
      repeat_type === 'none' && !isPoolKey && end_date && end_date > date ? end_date : null
    const now = nowIso()

    if (repeat_type === 'none') {
      const task = {
        id: generateId(), user_id: uid,
        title, memo, date, end_date: resolvedEndDate,
        is_completed: false, is_in_progress: false, is_starred: false,
        repeat_type, repeat_days: null, order_index,
        remind_at, color, category, is_habit: false,
        start_time, end_time,
        is_template: false, parent_id: null,
        skipped_dates: null, rollover_source_id: null,
        completion_note: null, completed_at: null,
        created_at: now, updated_at: now
      }
      db.transaction(() => {
        insertTaskRow(db, task)
        enqueueSync(db, 'tasks', 'upsert', task.id, taskRowToPayload(task))
      })()
      return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(task.id))
    }

    const templateId = generateId()
    const resolvedRepeatDays =
      repeat_type === 'daily' && repeat_days && repeat_days.length < 7 ? repeat_days : null
    const template = {
      id: templateId, user_id: uid,
      title, memo, date, end_date: null,
      is_completed: false, is_in_progress: false, is_starred: false,
      repeat_type, repeat_days: resolvedRepeatDays, order_index,
      remind_at, color, category, is_habit: habit,
      start_time, end_time,
      is_template: true, parent_id: null,
      skipped_dates: [], rollover_source_id: null,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }
    const instance = {
      id: generateId(), user_id: uid,
      title, memo, date, end_date: null,
      is_completed: false, is_in_progress: false, is_starred: false,
      repeat_type, repeat_days: null, order_index,
      remind_at, color, category, is_habit: habit,
      start_time, end_time,
      is_template: false, parent_id: templateId,
      skipped_dates: null, rollover_source_id: null,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }
    db.transaction(() => {
      insertTaskRow(db, template)
      enqueueSync(db, 'tasks', 'upsert', template.id, taskRowToPayload(template))
      insertTaskRow(db, instance)
      enqueueSync(db, 'tasks', 'upsert', instance.id, taskRowToPayload(instance))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(instance.id))
  },

  updateTask(id, fields) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const task = rowToTask(row)
    const wasTemplate = !!task.is_template
    const prevRepeatType = task.repeat_type
    const now = nowIso()

    // 반복 인스턴스를 다른 날로 '이동'하는 경우 감지 — 이 회차만 옮기는 것이므로
    // 원래 날짜를 부모 템플릿의 skipped_dates에 넣어 ensureRepeatInstancesForDate가
    // 그 날 인스턴스를 재생성(잔상)하지 못하게 막는다.
    const isInstanceDateMove =
      !task.is_template &&
      task.parent_id &&
      Object.prototype.hasOwnProperty.call(fields, 'date') &&
      fields.date &&
      fields.date !== task.date

    // 동적 UPDATE — fields의 키만 갱신. user_id는 변경 금지(외부 입력으로 들어와도 무시).
    const setKeys = []
    const params = []
    for (const [key, val] of Object.entries(fields)) {
      if (!TASK_COLS.includes(key)) continue
      if (key === 'user_id') continue // 소유자 변경 차단
      setKeys.push(`${key} = ?`)
      params.push(valForCol(key, val))
    }
    setKeys.push('updated_at = ?')
    params.push(now)

    db.transaction(() => {
      if (setKeys.length > 0) {
        params.push(id)
        db.prepare(`UPDATE tasks SET ${setKeys.join(', ')} WHERE id = ?`).run(...params)
      }

      // is_habit 변경 전파 (템플릿/인스턴스 모두)
      if (Object.prototype.hasOwnProperty.call(fields, 'is_habit')) {
        const templateId = task.is_template ? task.id : task.parent_id
        if (templateId) {
          const flag = fields.is_habit ? 1 : 0
          db.prepare(
            `UPDATE tasks SET is_habit = ?, updated_at = ?
             WHERE id = ? OR parent_id = ?`
          ).run(flag, now, templateId, templateId)
        }
      }

      // 반복 제거: 템플릿의 repeat_type='none' 변경 시 미래 인스턴스 정리
      if (wasTemplate && prevRepeatType !== 'none' && fields.repeat_type === 'none') {
        const todayStr = new Date().toISOString().slice(0, 10)
        // 미래 인스턴스 삭제 — 각각 enqueue
        const futureRows = db
          .prepare('SELECT id FROM tasks WHERE parent_id = ? AND date > ?')
          .all(task.id, todayStr)
        db.prepare(`DELETE FROM tasks WHERE parent_id = ? AND date > ?`).run(task.id, todayStr)
        for (const r of futureRows) enqueueSync(db, 'tasks', 'delete', r.id, null)
        // 템플릿 → 일반 task로 변환
        db.prepare(
          `UPDATE tasks SET is_template = 0, parent_id = NULL, skipped_dates = NULL, is_habit = 0, updated_at = ?
           WHERE id = ?`
        ).run(now, task.id)
      }

      // 반복 인스턴스 이동: 원래 날짜를 템플릿 skipped_dates에 추가 → 그 날 재생성 방지.
      if (isInstanceDateMove) {
        const tmplRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(task.parent_id)
        if (tmplRow) {
          const tmpl = rowToTask(tmplRow)
          const skipped = new Set(Array.isArray(tmpl.skipped_dates) ? tmpl.skipped_dates : [])
          if (!skipped.has(task.date)) {
            skipped.add(task.date)
            db.prepare(`UPDATE tasks SET skipped_dates = ?, updated_at = ? WHERE id = ?`)
              .run(JSON.stringify([...skipped].sort()), now, task.parent_id)
            const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(task.parent_id)
            if (after) enqueueSync(db, 'tasks', 'upsert', task.parent_id, taskRowToPayload(after))
          }
        }
      }

      // 메인 row의 최종 상태 + 전파된 row들을 모두 enqueue
      const updatedMain = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      if (updatedMain) enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(updatedMain))
      if (Object.prototype.hasOwnProperty.call(fields, 'is_habit')) {
        const templateId = task.is_template ? task.id : task.parent_id
        if (templateId && templateId !== id) {
          const tmplRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId)
          if (tmplRow) enqueueSync(db, 'tasks', 'upsert', templateId, taskRowToPayload(tmplRow))
        }
      }
    })()

    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  toggleTask(id, completionNote = null) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const task = rowToTask(row)
    const now = nowIso()
    const newCompleted = !task.is_completed
    db.transaction(() => {
      if (newCompleted) {
        db.prepare(
          `UPDATE tasks SET is_completed = 1, completed_at = ?, completion_note = ?, is_in_progress = 0, updated_at = ?
           WHERE id = ?`
        ).run(now, completionNote || null, now, id)
      } else {
        db.prepare(
          `UPDATE tasks SET is_completed = 0, completed_at = NULL, completion_note = NULL, updated_at = ?
           WHERE id = ?`
        ).run(now, id)
      }
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  setInProgress(id, value) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const now = nowIso()
    const flag = value ? 1 : 0
    db.transaction(() => {
      if (flag) {
        db.prepare(
          `UPDATE tasks SET is_in_progress = 1, is_completed = 0, updated_at = ? WHERE id = ?`
        ).run(now, id)
      } else {
        db.prepare(
          `UPDATE tasks SET is_in_progress = 0, updated_at = ? WHERE id = ?`
        ).run(now, id)
      }
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  setStarred(id, value) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const flag = value ? 1 : 0
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET is_starred = ?, updated_at = ? WHERE id = ?`
      ).run(flag, nowIso(), id)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  // ── 보류(hold) ──────────────────────────────────────────────
  // 할일을 보류 처리. held_at 마킹 → 일별/주별/월별 목록·진행률·이월 후보에서 빠지고
  // 보류 목록(getHeldTasks)에서만 보인다. 진행중/별표 상태는 그대로 둔다.
  setOnHold(id, value) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const now = nowIso()
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET held_at = ?, updated_at = ? WHERE id = ?`
      ).run(value ? now : null, now, id)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  // 보류 목록 조회 — held_at이 있는 미완료 일반 task. 최근 보류한 것이 위로.
  getHeldTasks() {
    const uid = getCurrentUserId()
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ?
           AND held_at IS NOT NULL
           AND is_completed = 0
           AND is_template = 0
         ORDER BY held_at DESC`
      )
      .all(uid)
    return rows.map(rowToTask)
  },

  // 보류 해제 후 복귀 — held_at 제거 + date를 toDate(오늘)로 이동해 오늘 목록에 다시 등장.
  // order_index는 toDate의 기존 개수 뒤로 붙인다. 이미 한 번 이월된 항목이어도 복귀는 허용.
  returnFromHold(id, toDate) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const now = nowIso()
    const uid = getCurrentUserId()
    const existingOnTo = db
      .prepare('SELECT COUNT(*) AS c FROM tasks WHERE user_id IS ? AND date = ? AND is_template = 0')
      .get(uid, toDate).c
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET held_at = NULL, date = ?, order_index = ?, updated_at = ? WHERE id = ?`
      ).run(toDate, existingOnTo, now, id)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  deleteTask(id) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return { id }
    db.transaction(() => {
      // 반복 인스턴스 삭제 시 템플릿 skipped_dates 갱신 + 템플릿도 upsert로 sync
      if (row.parent_id) {
        const task = rowToTask(row)
        const tmplRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(task.parent_id)
        if (tmplRow) {
          const tmpl = rowToTask(tmplRow)
          const skipped = Array.isArray(tmpl.skipped_dates) ? tmpl.skipped_dates : []
          skipped.push(task.date)
          db.prepare(
            `UPDATE tasks SET skipped_dates = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(skipped), nowIso(), tmpl.id)
          const tmplAfter = db.prepare('SELECT * FROM tasks WHERE id=?').get(tmpl.id)
          enqueueSync(db, 'tasks', 'upsert', tmpl.id, taskRowToPayload(tmplAfter))
        }
      }
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      enqueueSync(db, 'tasks', 'delete', id, null)
    })()
    return { id }
  },

  deleteTaskAndFuture(id, fromDate) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return { id }
    const task = rowToTask(row)
    const templateId = task.is_template ? task.id : task.parent_id || null
    db.transaction(() => {
      if (templateId) {
        const futureRows = db
          .prepare('SELECT id FROM tasks WHERE parent_id = ? AND date >= ?')
          .all(templateId, fromDate)
        db.prepare('DELETE FROM tasks WHERE id = ?').run(templateId)
        enqueueSync(db, 'tasks', 'delete', templateId, null)
        db.prepare(`DELETE FROM tasks WHERE parent_id = ? AND date >= ?`).run(templateId, fromDate)
        for (const r of futureRows) enqueueSync(db, 'tasks', 'delete', r.id, null)
      } else {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
        enqueueSync(db, 'tasks', 'delete', id, null)
      }
    })()
    return { id }
  },

  reorderTasks(date, orderedIds) {
    const db = getDb()
    const now = nowIso()
    const stmt = db.prepare(
      `UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?`
    )
    db.transaction(() => {
      orderedIds.forEach((id, index) => {
        stmt.run(index, now, id)
        const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
        if (after) enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
      })
    })()
    return true
  },

  // ── 이월 ─────────────────────────────────────────────────────
  // 사용자 선택형 이월 후보 (UI 모달용). 진행중 항목은 제외 — 자동 이월로 처리됨.
  getRolloverCandidates(toDate) {
    const tasks = getAllTasks()
    return computeRolloverCandidates(tasks, toDate)
  },

  // 진행중 항목 자동 이월 — 오늘 진입 시 모달 없이 조용히 toDate로 복사 + 원본 rolled_at 마킹.
  // 복사본도 is_in_progress가 유지되므로 완료(또는 진행중 해제)할 때까지 매일 따라온다.
  autoRolloverInProgress(toDate) {
    const db = getDb()
    const tasks = getAllTasks()
    const sources = computeInProgressRolloverCandidates(tasks, toDate)
    if (sources.length === 0) return []
    const existingOnTo = tasks.filter((t) => t.date === toDate).length
    const newTasksRaw = buildRolloverCopies(sources, toDate, existingOnTo)
    const newTasks = newTasksRaw.map((nt) => withUserId(nt))
    const now = nowIso()
    db.transaction(() => {
      for (const nt of newTasks) {
        insertTaskRow(db, nt)
        enqueueSync(db, 'tasks', 'upsert', nt.id, taskRowToPayload(nt))
      }
      const sids = newTasks.map((nt) => nt.rollover_source_id)
      markRolledAt(db, sids, now)
      for (const sid of sids) {
        const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(sid)
        if (after) enqueueSync(db, 'tasks', 'upsert', sid, taskRowToPayload(after))
      }
    })()
    return newTasks
  },

  // 선택된 source id만 toDate로 카피하고 원본을 rolled_at으로 마킹.
  // sourceIds에 없는 task는 그대로 미완료로 남아 다음에 다시 후보가 됨.
  rolloverSelectedTasks(sourceIds, toDate) {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) return []
    const db = getDb()
    const tasks = getAllTasks()
    // 후보 중 사용자가 고른 것만 — 잘못된/이미 이월된 id는 자동 필터.
    const validCandidates = computeRolloverCandidates(tasks, toDate)
    const pickSet = new Set(sourceIds)
    const sources = validCandidates.filter((t) => pickSet.has(t.id))
    if (sources.length === 0) return []
    const existingOnTo = tasks.filter((t) => t.date === toDate).length
    const newTasksRaw = buildRolloverCopies(sources, toDate, existingOnTo)
    const newTasks = newTasksRaw.map((nt) => withUserId(nt))
    const now = nowIso()
    db.transaction(() => {
      for (const nt of newTasks) {
        insertTaskRow(db, nt)
        enqueueSync(db, 'tasks', 'upsert', nt.id, taskRowToPayload(nt))
      }
      const sids = newTasks.map((nt) => nt.rollover_source_id)
      markRolledAt(db, sids, now)
      for (const sid of sids) {
        const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(sid)
        if (after) enqueueSync(db, 'tasks', 'upsert', sid, taskRowToPayload(after))
      }
    })()
    return newTasks
  },

  // ── 반복 일정 관리 ────────────────────────────────────────
  // 모든 반복 템플릿(습관 포함)을 시리즈 단위로 나열. 일반 반복 일정 관리 화면용.
  // 각 항목: 다음 발생일(next_date) + 완료 횟수 등 경량 메타.
  getRecurringTemplates() {
    const db = getDb()
    const uid = getCurrentUserId()
    const today = todayStrLocal()
    const templates = db
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ? AND is_template = 1 AND repeat_type != 'none'
         ORDER BY is_habit DESC, order_index ASC, created_at ASC`
      )
      .all(uid)
      .map(rowToTask)

    return templates.map((tmpl) => {
      // 다음 발생일 — 오늘부터 최대 400일 스캔(중지/skip/요일/종료일 반영).
      let nextDate = null
      if (!tmpl.weekly_goal) {
        const cur = new Date(today + 'T00:00:00')
        for (let i = 0; i < 400; i++) {
          const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
          if ((shouldRepeatOnDate(tmpl, d) || tmpl.date === d) && !(tmpl.skipped_dates || []).includes(d)) {
            nextDate = d
            break
          }
          cur.setDate(cur.getDate() + 1)
        }
      }
      const doneCount = db
        .prepare(`SELECT count(*) AS c FROM tasks WHERE parent_id = ? AND is_completed = 1`)
        .get(tmpl.id).c
      return {
        id: tmpl.id,
        title: tmpl.title,
        color: tmpl.color || null,
        category: tmpl.category || null,
        repeat_type: tmpl.repeat_type,
        repeat_days: tmpl.repeat_days || null,
        weekly_goal: tmpl.weekly_goal || null,
        is_habit: !!tmpl.is_habit,
        start_date: tmpl.date,
        remind_at: tmpl.remind_at || null,
        paused: !!tmpl.end_date,
        paused_at: tmpl.end_date || null,
        order_index: tmpl.order_index || 0,
        next_date: nextDate,
        done_count: doneCount
      }
    })
  },

  // 템플릿의 습관 추적 on/off 토글 (템플릿 + 인스턴스 전파). '습관으로 전환'용.
  setTemplateIsHabit(templateId, isHabit) {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId)
    if (!row) return null
    const now = nowIso()
    const flag = isHabit ? 1 : 0
    db.transaction(() => {
      db.prepare(`UPDATE tasks SET is_habit = ?, updated_at = ? WHERE id = ? OR parent_id = ?`)
        .run(flag, now, templateId, templateId)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId)
      enqueueSync(db, 'tasks', 'upsert', templateId, taskRowToPayload(after))
      const insts = db.prepare('SELECT * FROM tasks WHERE parent_id = ?').all(templateId)
      for (const r of insts) enqueueSync(db, 'tasks', 'upsert', r.id, taskRowToPayload(r))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId))
  },

  // ── 습관 트래커 ───────────────────────────────────────────
  getHabitMatrix(fromDate, toDate) {
    ensureRepeatInstancesForRange(fromDate, toDate)
    const db = getDb()
    const uid = getCurrentUserId()
    const templates = db
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id IS ? AND is_template = 1 AND is_habit = 1 AND repeat_type != 'none'
         ORDER BY order_index ASC, created_at ASC`
      )
      .all(uid)
      .map(rowToTask)

    const todayStr = todayStrLocal()
    const week = isoWeekRange(todayStr)
    return templates.map((tmpl) => {
      const isGoal = !!tmpl.weekly_goal // 주 N회 목표형 — 고정 요일이 아니라 빈도로 추적
      const instances = db
        .prepare(
          `SELECT * FROM tasks
           WHERE user_id IS ? AND is_template = 0 AND parent_id = ?
             AND date >= ? AND date <= ?`
        )
        .all(uid, tmpl.id, fromDate, toDate)
        .map(rowToTask)
      const byDate = {}
      for (const inst of instances) {
        byDate[inst.date] = {
          id: inst.id,
          is_completed: !!inst.is_completed,
          completed_at: inst.completed_at || null,
          completion_note: inst.completion_note || null
        }
      }
      const skipped = new Set(tmpl.skipped_dates || [])
      const days = []
      let weekDone = 0
      for (const date of dateRange(fromDate, toDate)) {
        // 목표형은 특정 요일을 강제하지 않음 → 완료/휴식 외엔 항상 off (miss 없음).
        const expected = isGoal ? tmpl.date === date : (shouldRepeatOnDate(tmpl, date) || tmpl.date === date)
        const isDone = !!byDate[date]?.is_completed
        let status
        if (isDone) status = 'done' // 완료는 항상 최우선 — 중지/목표형에서도 잔디 유지
        else if (skipped.has(date)) status = 'skip'
        else if (!expected) status = 'off'
        else if (date > todayStr) status = 'future'
        else if (date === todayStr) status = 'today'
        else status = 'miss'
        if (isGoal && isDone && date >= week.start && date <= week.end) weekDone += 1
        days.push({ date, status, instance: byDate[date] || null })
      }
      return {
        template: {
          id: tmpl.id,
          title: tmpl.title,
          color: tmpl.color || null,
          category: tmpl.category || null,
          repeat_type: tmpl.repeat_type,
          repeat_days: tmpl.repeat_days || null,
          weekly_goal: tmpl.weekly_goal || null,
          order_index: tmpl.order_index || 0,
          start_date: tmpl.date,
          // end_date가 찍혀 있으면 '중지됨' — 기록은 보존하되 이후 추적을 멈춘 습관.
          paused: !!tmpl.end_date,
          paused_at: tmpl.end_date || null
        },
        // 주 N회 목표형 진척 (이번 ISO 주)
        weekProgress: isGoal ? { done: weekDone, target: tmpl.weekly_goal } : null,
        days
      }
    })
  },

  toggleHabitOnDate(templateId, date, note = undefined) {
    const db = getDb()
    const uid = getCurrentUserId()
    const tmplRow = db
      .prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`)
      .get(templateId)
    if (!tmplRow) return null
    const tmpl = rowToTask(tmplRow)
    const instRow = db
      .prepare(
        `SELECT * FROM tasks WHERE parent_id = ? AND date = ? AND is_template = 0`
      )
      .get(templateId, date)
    if (!instRow) {
      const now = nowIso()
      const inst = {
        id: generateId(), user_id: uid,
        title: tmpl.title, memo: tmpl.memo, date, end_date: null,
        is_completed: true, is_in_progress: false, is_starred: false,
        repeat_type: tmpl.repeat_type, repeat_days: null, order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null, category: tmpl.category || null,
        is_habit: true, start_time: null, end_time: null,
        is_template: false, parent_id: templateId,
        skipped_dates: null, rollover_source_id: null,
        completion_note: note ?? null, completed_at: now,
        created_at: now, updated_at: now
      }
      db.transaction(() => {
        insertTaskRow(db, inst)
        enqueueSync(db, 'tasks', 'upsert', inst.id, taskRowToPayload(inst))
      })()
      return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id))
    }
    const inst = rowToTask(instRow)
    const now = nowIso()
    const newCompleted = !inst.is_completed
    // note가 명시되면(완료 메모 저장) 완료 상태를 유지/설정하고 메모만 갱신, 아니면 완료 토글.
    const noteProvided = note !== undefined
    const completed = noteProvided ? true : newCompleted
    const nextNote = noteProvided ? (note || null) : inst.completion_note ?? null
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET is_completed = ?, completed_at = ?, completion_note = ?, updated_at = ?
         WHERE id = ?`
      ).run(completed ? 1 : 0, completed ? (inst.completed_at || now) : null, completed ? nextNote : null, now, inst.id)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id)
      enqueueSync(db, 'tasks', 'upsert', inst.id, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id))
  },

  // 습관 '중지/재개' — 기록(인스턴스)은 보존하고 end_date만 토글한다.
  // paused=true: end_date=오늘(로컬) → 이후 날짜는 'off'(미래 인스턴스 생성 중단), 트래커엔 계속 표시.
  // paused=false: end_date=null → 재개. 단, 중지했던 구간(end_date+1 ~ 어제)을 skipped_dates에
  //   병합해 '회색 skip'으로 남긴다 → 재개 시 그 기간이 빨간 miss로 소급되는 걸 막는다.
  setHabitPaused(templateId, paused) {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId)
    if (!row) return null
    const tmpl = rowToTask(row)
    const now = nowIso()
    const today = todayStrLocal()
    let endDate
    let skipped = Array.isArray(tmpl.skipped_dates) ? [...tmpl.skipped_dates] : []
    if (paused) {
      endDate = today
    } else {
      endDate = null
      // 중지 기간을 휴식(skip)으로 채움 — 잔디는 회색, 통계엔 불계산.
      if (tmpl.end_date && tmpl.end_date < today) {
        const set = new Set(skipped)
        for (const d of dateRange(tmpl.end_date, prevDateStr(today))) {
          if (d > tmpl.end_date) set.add(d) // 중지 당일(end_date)은 제외, 그 다음날부터
        }
        skipped = [...set].sort()
      }
    }
    db.transaction(() => {
      db.prepare(`UPDATE tasks SET end_date = ?, skipped_dates = ?, updated_at = ? WHERE id = ?`)
        .run(endDate, JSON.stringify(skipped), now, templateId)
      // 중지 시: 이미 만들어진 미래(오늘 이후) 인스턴스를 정리한다.
      // end_date만 찍으면 '새' 인스턴스 생성만 멈출 뿐, 캘린더 뷰가 미리 만들어 둔
      // 미래 인스턴스는 남아 일정에 계속 표시되기 때문. (반복 제거/이후 삭제와 동일 패턴)
      if (paused) {
        const futureRows = db
          .prepare('SELECT id FROM tasks WHERE parent_id = ? AND date > ?')
          .all(templateId, today)
        db.prepare(`DELETE FROM tasks WHERE parent_id = ? AND date > ?`).run(templateId, today)
        for (const r of futureRows) enqueueSync(db, 'tasks', 'delete', r.id, null)
      }
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId)
      enqueueSync(db, 'tasks', 'upsert', templateId, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId))
  },

  // 특정 날짜를 휴식(skip)으로 토글 — 아파서 못한 날 등 streak을 깨지 않게.
  // skipped_dates 배열에 date를 추가/제거. 'done'인 날은 skip 처리하지 않는다(완료 우선).
  setHabitSkip(templateId, date, skip) {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId)
    if (!row) return null
    const tmpl = rowToTask(row)
    const now = nowIso()
    const set = new Set(Array.isArray(tmpl.skipped_dates) ? tmpl.skipped_dates : [])
    if (skip) set.add(date)
    else set.delete(date)
    const skipped = [...set].sort()
    db.transaction(() => {
      db.prepare(`UPDATE tasks SET skipped_dates = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(skipped), now, templateId)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId)
      enqueueSync(db, 'tasks', 'upsert', templateId, taskRowToPayload(after))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId))
  },

  // 트래커에서 직접 새 습관 생성 — 반복 템플릿(is_habit=1)만 만든다(인스턴스는 토글/자동생성).
  // weekly_goal이 있으면 '주 N회 목표형' (고정 요일 없음 → repeat_type='daily'로 두되 자동 인스턴스 안 생김).
  createHabit({ title, color = null, repeat_type = 'daily', repeat_days = null, weekly_goal = null }) {
    const db = getDb()
    const uid = getCurrentUserId()
    const now = nowIso()
    const goal = weekly_goal && weekly_goal > 0 ? Math.round(weekly_goal) : null
    const rtype = goal ? 'daily' : repeat_type
    const resolvedDays =
      !goal && rtype === 'daily' && repeat_days && repeat_days.length > 0 && repeat_days.length < 7
        ? repeat_days
        : null
    // 새 습관은 맨 위로 — 기존 최소 order_index - 1
    const minRow = db
      .prepare(`SELECT MIN(order_index) AS m FROM tasks WHERE user_id IS ? AND is_template = 1 AND is_habit = 1`)
      .get(uid)
    const order_index = (minRow?.m ?? 0) - 1
    const template = {
      id: generateId(), user_id: uid,
      title: String(title || '').trim() || '새 습관', memo: '', date: todayStrLocal(), end_date: null,
      is_completed: false, is_in_progress: false, is_starred: false,
      repeat_type: rtype, repeat_days: resolvedDays, order_index,
      remind_at: null, color, category: null, is_habit: true, weekly_goal: goal,
      start_time: null, end_time: null,
      is_template: true, parent_id: null,
      skipped_dates: [], rollover_source_id: null,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }
    db.transaction(() => {
      insertTaskRow(db, template)
      enqueueSync(db, 'tasks', 'upsert', template.id, taskRowToPayload(template))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(template.id))
  },

  // 습관 편집 — 템플릿의 title/color/반복/목표를 갱신하고 title/color는 인스턴스에도 전파.
  updateHabit(templateId, { title, color, repeat_type, repeat_days, weekly_goal }) {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId)
    if (!row) return null
    const now = nowIso()
    const goal = weekly_goal && weekly_goal > 0 ? Math.round(weekly_goal) : null
    const rtype = goal ? 'daily' : (repeat_type || 'daily')
    const resolvedDays =
      !goal && rtype === 'daily' && repeat_days && repeat_days.length > 0 && repeat_days.length < 7
        ? repeat_days
        : null
    const cleanTitle = String(title ?? '').trim() || '새 습관'
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET title = ?, color = ?, repeat_type = ?, repeat_days = ?, weekly_goal = ?, updated_at = ?
         WHERE id = ?`
      ).run(cleanTitle, color ?? null, rtype, resolvedDays ? JSON.stringify(resolvedDays) : null, goal, now, templateId)
      // title/color는 day/week 뷰의 인스턴스에도 반영
      db.prepare(`UPDATE tasks SET title = ?, color = ?, updated_at = ? WHERE parent_id = ?`)
        .run(cleanTitle, color ?? null, now, templateId)
      const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId)
      enqueueSync(db, 'tasks', 'upsert', templateId, taskRowToPayload(after))
      const insts = db.prepare('SELECT * FROM tasks WHERE parent_id = ?').all(templateId)
      for (const r of insts) enqueueSync(db, 'tasks', 'upsert', r.id, taskRowToPayload(r))
    })()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(templateId))
  },

  // 습관 카드 순서 변경 — 템플릿의 order_index를 배열 순서대로 부여.
  reorderHabits(orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return true
    const db = getDb()
    const now = nowIso()
    const stmt = db.prepare(`UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ? AND is_template = 1`)
    db.transaction(() => {
      orderedIds.forEach((id, index) => {
        stmt.run(index, now, id)
        const after = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
        if (after) enqueueSync(db, 'tasks', 'upsert', id, taskRowToPayload(after))
      })
    })()
    return true
  },

  // 습관 완전 삭제 — 템플릿 + 모든 인스턴스(과거/미래)를 제거한다.
  deleteHabit(templateId) {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId)
    if (!row) return { id: templateId }
    db.transaction(() => {
      const instRows = db.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(templateId)
      db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(templateId)
      for (const r of instRows) enqueueSync(db, 'tasks', 'delete', r.id, null)
      db.prepare('DELETE FROM tasks WHERE id = ?').run(templateId)
      enqueueSync(db, 'tasks', 'delete', templateId, null)
    })()
    return { id: templateId }
  },

  // ── Categories ───────────────────────────────────────────
  getCategories() {
    const db = getDb()
    const uid = getCurrentUserId()
    const rows = db.prepare('SELECT id, label, color FROM categories WHERE user_id IS ?').all(uid)
    if (rows.length > 0) return rows
    // fallback: 마이그레이션 호환 — settings의 categories 키 (user 무관, PC 단일 시 시절 데이터)
    const setting = db.prepare("SELECT value FROM settings WHERE key='categories'").get()
    if (!setting) return []
    try {
      const parsed = JSON.parse(setting.value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },

  setCategories(categories) {
    const db = getDb()
    const uid = getCurrentUserId()
    const now = nowIso()
    db.transaction(() => {
      // 기존 user의 categories 삭제 → row별 delete 이벤트
      const existing = db.prepare('SELECT id FROM categories WHERE user_id IS ?').all(uid)
      db.prepare('DELETE FROM categories WHERE user_id IS ?').run(uid)
      for (const e of existing) enqueueSync(db, 'categories', 'delete', e.id, null)
      // 신규 categories 삽입 → row별 upsert
      const stmt = db.prepare('INSERT INTO categories (id, user_id, label, color) VALUES (?, ?, ?, ?)')
      for (const c of categories) {
        stmt.run(c.id, uid, c.label, c.color || null)
        enqueueSync(db, 'categories', 'upsert', c.id, {
          id: c.id, user_id: uid, label: c.label, color: c.color || null, updated_at: now
        })
      }
    })()
  },

  // ── 설정 (key/value) — settings는 PC별 (user 격리 없음) ────
  getSetting(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return undefined
    const raw = row.value
    if (raw === null || raw === undefined) return raw
    const first = raw.charAt(0)
    if (first === '{' || first === '[') {
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }
    return raw
  },

  setSetting(key, value) {
    const db = getDb()
    const stored =
      typeof value === 'string' ? value : value === undefined ? null : JSON.stringify(value)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stored)
  },

  // ── PDS: See 회고 (user_id + date 복합 PK) ────────────────
  getSeeMemo(date) {
    const uid = getCurrentUserId()
    const row = getDb()
      .prepare('SELECT good, bad, next FROM see_memos WHERE user_id IS ? AND date = ?')
      .get(uid, date)
    if (!row) return { good: '', bad: '', next: '' }
    return { good: row.good || '', bad: row.bad || '', next: row.next || '' }
  },

  setSeeMemo(date, obj) {
    const db = getDb()
    const uid = getCurrentUserId()
    const good = (obj && obj.good) || ''
    const bad = (obj && obj.bad) || ''
    const next = (obj && obj.next) || ''
    const now = nowIso()
    db.transaction(() => {
      // SQLite는 NULL을 다른 NULL과 구별하므로 INSERT OR REPLACE를 위해 user_id IS NULL 분기 필요.
      // 단순화: 기존 row 있으면 UPDATE, 없으면 INSERT.
      const existing = db.prepare('SELECT 1 FROM see_memos WHERE user_id IS ? AND date = ?').get(uid, date)
      if (existing) {
        db.prepare(
          `UPDATE see_memos SET good = ?, bad = ?, next = ?, updated_at = ?
           WHERE user_id IS ? AND date = ?`
        ).run(good, bad, next, now, uid, date)
      } else {
        db.prepare(
          `INSERT INTO see_memos (user_id, date, good, bad, next, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(uid, date, good, bad, next, now)
      }
      enqueueSync(db, 'see_memos', 'upsert', `${uid}|${date}`, {
        user_id: uid, date, good, bad, next, updated_at: now
      })
    })()
  },

  // ── PDS: Look Back ──────────────────────────────────────
  getMonthlyStats(months) {
    const db = getDb()
    const uid = getCurrentUserId()
    const totalStmt = db.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE user_id IS ? AND date LIKE ? AND is_template = 0`
    )
    const doneStmt = db.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE user_id IS ? AND date LIKE ? AND is_template = 0 AND is_completed = 1`
    )
    return months.map((ym) => {
      const pattern = `${ym}-%`
      const total = totalStmt.get(uid, pattern).c
      const done = doneStmt.get(uid, pattern).c
      return { ym, total, done, rate: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
  },

  // ── PDS: Look Forward (user_id + ym 복합 PK) ──────────────
  getMonthlyGoal(ym) {
    const uid = getCurrentUserId()
    const row = getDb()
      .prepare('SELECT text FROM monthly_goals WHERE user_id IS ? AND ym = ?')
      .get(uid, ym)
    return row ? row.text || '' : ''
  },

  setMonthlyGoal(ym, text) {
    const db = getDb()
    const uid = getCurrentUserId()
    const now = nowIso()
    db.transaction(() => {
      const existing = db.prepare('SELECT 1 FROM monthly_goals WHERE user_id IS ? AND ym = ?').get(uid, ym)
      if (existing) {
        db.prepare(
          `UPDATE monthly_goals SET text = ?, updated_at = ?
           WHERE user_id IS ? AND ym = ?`
        ).run(text, now, uid, ym)
      } else {
        db.prepare(
          `INSERT INTO monthly_goals (user_id, ym, text, updated_at)
           VALUES (?, ?, ?, ?)`
        ).run(uid, ym, text, now)
      }
      enqueueSync(db, 'monthly_goals', 'upsert', `${uid}|${ym}`, {
        user_id: uid, ym, text, updated_at: now
      })
    })()
  },

  // ── 메모 노트 (notes) — 사용자별 메모 N개 관리. 로컬-only, sync 미적용.
  listNotes() {
    const uid = getCurrentUserId()
    return getDb()
      .prepare(
        'SELECT id, title, content, order_index, created_at, updated_at FROM notes WHERE user_id IS ? ORDER BY order_index ASC, updated_at DESC'
      )
      .all(uid)
  },

  getNote(id) {
    return getDb()
      .prepare('SELECT id, title, content, order_index, created_at, updated_at FROM notes WHERE id = ?')
      .get(id)
  },

  createNote(input) {
    const db = getDb()
    const uid = getCurrentUserId()
    const now = nowIso()
    const id = 'note_' + generateId()
    const title = (input && input.title) || ''
    const content = (input && input.content) || ''
    // 새 노트는 가장 위쪽에 — 기존 최소 order_index보다 1 작게
    const minRow = db
      .prepare('SELECT MIN(order_index) AS m FROM notes WHERE user_id IS ?')
      .get(uid)
    const order = (minRow && minRow.m !== null ? minRow.m : 0) - 1
    db.prepare(
      `INSERT INTO notes (id, user_id, title, content, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, uid, title, content, order, now, now)
    return { id, title, content, order_index: order, created_at: now, updated_at: now }
  },

  updateNote(id, patch) {
    const db = getDb()
    const now = nowIso()
    const fields = []
    const params = []
    if (patch && patch.title !== undefined) { fields.push('title = ?'); params.push(patch.title) }
    if (patch && patch.content !== undefined) { fields.push('content = ?'); params.push(patch.content) }
    if (patch && patch.order_index !== undefined) { fields.push('order_index = ?'); params.push(patch.order_index) }
    if (fields.length === 0) return null
    fields.push('updated_at = ?')
    params.push(now, id)
    db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return db
      .prepare('SELECT id, title, content, order_index, created_at, updated_at FROM notes WHERE id = ?')
      .get(id)
  },

  deleteNote(id) {
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
    return true
  }
}
