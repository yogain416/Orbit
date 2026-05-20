import { join } from 'path'
import { app } from 'electron'
import { openDatabase } from './sqlite.js'
import { migrateJsonToSqlite } from './migrate.js'
import { autoRolloverOverdue as computeAutoRolloverOverdue } from './rollover.js'
import { buildRepeatInstancesForDate, shouldRepeatOnDate } from './repeat.js'

// ── 모듈 전역 상태 ──────────────────────────────────────────
let _db = null

function dbPath() {
  return join(app.getPath('userData'), 'orbit.db')
}

function jsonPath() {
  return join(app.getPath('userData'), 'todostick.json')
}

function getDb() {
  if (_db) return _db
  _db = openDatabase(dbPath())
  try {
    migrateJsonToSqlite(jsonPath(), _db)
  } catch (e) {
    console.error('[migrate] failed:', e)
  }
  return _db
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

const TASK_COLS = [
  'id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress', 'is_starred',
  'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category', 'is_habit',
  'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates', 'rollover_source_id',
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

function getAllTasks() {
  return getDb().prepare('SELECT * FROM tasks').all().map(rowToTask)
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
function ensureRepeatInstancesForDate(date) {
  const db = getDb()
  const tasks = getAllTasks()
  const newInstances = buildRepeatInstancesForDate(tasks, date, generateId)
  if (newInstances.length === 0) return false
  db.transaction(() => {
    for (const inst of newInstances) insertTaskRow(db, inst)
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
  const aInProg = !!a.is_in_progress && !a.is_completed
  const bInProg = !!b.is_in_progress && !b.is_completed
  if (aInProg !== bInProg) return aInProg ? -1 : 1
  const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
  if (star) return star
  if (a.order_index !== b.order_index) return a.order_index - b.order_index
  return (a.created_at || '').localeCompare(b.created_at || '')
}

// 정렬 비교자 (날짜 묶음 — getTasksByMonth/Range에서 사용).
function sortMultiDayTasks(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  const aInProg = !!a.is_in_progress && !a.is_completed
  const bInProg = !!b.is_in_progress && !b.is_completed
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

// ── default export ─────────────────────────────────────────
export default {
  getDbPath: () => dbPath(),
  seedIfEmpty,

  // ── 조회 ─────────────────────────────────────────────────
  getTasksByDate(date) {
    ensureRepeatInstancesForDate(date)
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE is_template = 0
           AND (date = ?
                OR (end_date IS NOT NULL AND date <= ? AND ? <= end_date))`
      )
      .all(date, date, date)
    return rows.map(rowToTask).sort(sortDayTasks)
  },

  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const daysInMonth = new Date(year, month, 0).getDate()
    const startDate = `${prefix}-01`
    const endDate = `${prefix}-${String(daysInMonth).padStart(2, '0')}`
    ensureRepeatInstancesForRange(startDate, endDate)
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE is_template = 0
           AND (date LIKE ?
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
      )
      .all(`${prefix}-%`, endDate, startDate)
    return rows.map(rowToTask).sort(sortMultiDayTasks)
  },

  getTasksByRange(startDate, endDate) {
    ensureRepeatInstancesForRange(startDate, endDate)
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE is_template = 0
           AND ((date >= ? AND date <= ?)
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
      )
      .all(startDate, endDate, endDate, startDate)
    return rows.map(rowToTask).sort(sortMultiDayTasks)
  },

  getOverdueTasks(date) {
    const db = getDb()
    // 이미 오늘로 이월된 원본 id 모음 (멱등 보장)
    const rolledSources = new Set(
      db
        .prepare(
          `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
        )
        .all(date)
        .map((r) => r.rollover_source_id)
    )
    // date 이전의 모든 미완료 — 주말/휴가로 며칠 비워도 잡힘.
    const rows = db
      .prepare(
        `SELECT * FROM tasks
         WHERE date < ?
           AND is_completed = 0
           AND is_template = 0
           AND parent_id IS NULL
           AND end_date IS NULL`
      )
      .all(date)
    return rows.map(rowToTask).filter((t) => !rolledSources.has(t.id))
  },

  getTodayReminders(date) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE date = ?
           AND remind_at IS NOT NULL
           AND is_template = 0`
      )
      .all(date)
    return rows.map(rowToTask)
  },

  getCompletedTasks({ category, search } = {}) {
    const db = getDb()
    let sql = `SELECT * FROM tasks WHERE is_completed = 1 AND is_template = 0`
    const params = []
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
    const rows = getDb()
      .prepare(`SELECT * FROM tasks WHERE date = ? AND is_template = 0`)
      .all(poolKey)
    return rows
      .map(rowToTask)
      .sort((a, b) =>
        a.order_index - b.order_index || (a.created_at || '').localeCompare(b.created_at || '')
      )
  },

  // ── 쓰기 ─────────────────────────────────────────────────
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
    const habit = repeat_type !== 'none' && !!is_habit
    const isPoolKey = typeof date === 'string' && (date.startsWith('M:') || date.startsWith('W:'))
    const resolvedEndDate =
      repeat_type === 'none' && !isPoolKey && end_date && end_date > date ? end_date : null
    const now = nowIso()

    if (repeat_type === 'none') {
      const task = {
        id: generateId(),
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
      insertTaskRow(db, task)
      return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(task.id))
    }

    const templateId = generateId()
    const resolvedRepeatDays =
      repeat_type === 'daily' && repeat_days && repeat_days.length < 7 ? repeat_days : null
    const template = {
      id: templateId,
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
      id: generateId(),
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
      insertTaskRow(db, instance)
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

    // 동적 UPDATE — fields의 키만 갱신
    const setKeys = []
    const params = []
    for (const [key, val] of Object.entries(fields)) {
      if (!TASK_COLS.includes(key)) continue
      setKeys.push(`${key} = ?`)
      params.push(valForCol(key, val))
    }
    setKeys.push('updated_at = ?')
    params.push(now)
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
      db.transaction(() => {
        db.prepare(
          `DELETE FROM tasks WHERE parent_id = ? AND date > ?`
        ).run(task.id, todayStr)
        // 템플릿 → 일반 task로 변환
        db.prepare(
          `UPDATE tasks SET is_template = 0, parent_id = NULL, skipped_dates = NULL, is_habit = 0, updated_at = ?
           WHERE id = ?`
        ).run(now, task.id)
      })()
    }

    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  toggleTask(id, completionNote = null) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const task = rowToTask(row)
    const now = nowIso()
    const newCompleted = !task.is_completed
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
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  setInProgress(id, value) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const now = nowIso()
    const flag = value ? 1 : 0
    if (flag) {
      db.prepare(
        `UPDATE tasks SET is_in_progress = 1, is_completed = 0, updated_at = ? WHERE id = ?`
      ).run(now, id)
    } else {
      db.prepare(
        `UPDATE tasks SET is_in_progress = 0, updated_at = ? WHERE id = ?`
      ).run(now, id)
    }
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  setStarred(id, value) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return null
    const flag = value ? 1 : 0
    db.prepare(
      `UPDATE tasks SET is_starred = ?, updated_at = ? WHERE id = ?`
    ).run(flag, nowIso(), id)
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
  },

  deleteTask(id) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (row && row.parent_id) {
      const task = rowToTask(row)
      const tmplRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(task.parent_id)
      if (tmplRow) {
        const tmpl = rowToTask(tmplRow)
        const skipped = Array.isArray(tmpl.skipped_dates) ? tmpl.skipped_dates : []
        skipped.push(task.date)
        db.prepare(
          `UPDATE tasks SET skipped_dates = ?, updated_at = ? WHERE id = ?`
        ).run(JSON.stringify(skipped), nowIso(), tmpl.id)
      }
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return { id }
  },

  deleteTaskAndFuture(id, fromDate) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    if (!row) return { id }
    const task = rowToTask(row)
    const templateId = task.is_template ? task.id : task.parent_id || null
    if (templateId) {
      db.transaction(() => {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(templateId)
        db.prepare(
          `DELETE FROM tasks WHERE parent_id = ? AND date >= ?`
        ).run(templateId, fromDate)
      })()
    } else {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    }
    return { id }
  },

  reorderTasks(date, orderedIds) {
    const db = getDb()
    const now = nowIso()
    const stmt = db.prepare(
      `UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?`
    )
    db.transaction(() => {
      orderedIds.forEach((id, index) => stmt.run(index, now, id))
    })()
    return true
  },

  // ── 이월 ─────────────────────────────────────────────────
  rolloverTasks(toDate) {
    const db = getDb()
    const overdueRows = db
      .prepare(
        `SELECT * FROM tasks
         WHERE date < ?
           AND is_completed = 0
           AND is_template = 0
           AND parent_id IS NULL
           AND end_date IS NULL`
      )
      .all(toDate)
    const overdue = overdueRows.map(rowToTask)
    const existingSources = new Set(
      db
        .prepare(
          `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
        )
        .all(toDate)
        .map((r) => r.rollover_source_id)
    )
    const toCopy = overdue.filter((t) => !existingSources.has(t.id))
    if (toCopy.length === 0) return []
    const maxOrder = db
      .prepare(`SELECT count(*) as c FROM tasks WHERE date = ?`)
      .get(toDate).c
    const now = nowIso()
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title, memo: t.memo, date: toDate, end_date: null,
      is_completed: false, is_in_progress: !!t.is_in_progress, is_starred: false,
      repeat_type: 'none', repeat_days: null, order_index: maxOrder + i,
      remind_at: null, color: t.color || null, category: t.category || null,
      is_habit: false, start_time: null, end_time: null,
      is_template: false, parent_id: null, skipped_dates: null,
      rollover_source_id: t.id,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }))
    db.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db, nt)
    })()
    return newTasks
  },

  rolloverSelectedTasks(taskIds, toDate) {
    const db = getDb()
    if (!taskIds || taskIds.length === 0) return []
    const placeholders = taskIds.map(() => '?').join(',')
    const selectedRows = db
      .prepare(`SELECT * FROM tasks WHERE id IN (${placeholders}) AND end_date IS NULL`)
      .all(...taskIds)
    const selected = selectedRows.map(rowToTask)
    const existingSources = new Set(
      db
        .prepare(
          `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
        )
        .all(toDate)
        .map((r) => r.rollover_source_id)
    )
    const toCopy = selected.filter((t) => !existingSources.has(t.id))
    if (toCopy.length === 0) return []
    const maxOrder = db
      .prepare(`SELECT count(*) as c FROM tasks WHERE date = ?`)
      .get(toDate).c
    const now = nowIso()
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title, memo: t.memo, date: toDate, end_date: null,
      is_completed: false, is_in_progress: !!t.is_in_progress, is_starred: false,
      repeat_type: 'none', repeat_days: null, order_index: maxOrder + i,
      remind_at: null, color: t.color || null, category: t.category || null,
      is_habit: false, start_time: null, end_time: null,
      is_template: false, parent_id: null, skipped_dates: null,
      rollover_source_id: t.id,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }))
    db.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db, nt)
    })()
    return newTasks
  },

  autoRolloverOverdue(toDate) {
    const db = getDb()
    const tasks = getAllTasks()
    const newTasks = computeAutoRolloverOverdue(tasks, toDate)
    if (newTasks.length === 0) return []
    db.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db, nt)
    })()
    return newTasks
  },

  // ── 습관 트래커 ───────────────────────────────────────────
  getHabitMatrix(fromDate, toDate) {
    ensureRepeatInstancesForRange(fromDate, toDate)
    const db = getDb()
    const templates = db
      .prepare(
        `SELECT * FROM tasks
         WHERE is_template = 1 AND is_habit = 1 AND repeat_type != 'none'`
      )
      .all()
      .map(rowToTask)

    const todayStr = new Date().toISOString().slice(0, 10)
    return templates.map((tmpl) => {
      const instances = db
        .prepare(
          `SELECT * FROM tasks
           WHERE is_template = 0 AND parent_id = ?
             AND date >= ? AND date <= ?`
        )
        .all(tmpl.id, fromDate, toDate)
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
      for (const date of dateRange(fromDate, toDate)) {
        const expected = shouldRepeatOnDate(tmpl, date) || tmpl.date === date
        let status
        if (skipped.has(date)) status = 'skip'
        else if (!expected) status = 'off'
        else if (byDate[date]?.is_completed) status = 'done'
        else if (date > todayStr) status = 'future'
        else if (date === todayStr) status = 'today'
        else status = 'miss'
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
          start_date: tmpl.date
        },
        days
      }
    })
  },

  toggleHabitOnDate(templateId, date) {
    const db = getDb()
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
        id: generateId(),
        title: tmpl.title, memo: tmpl.memo, date, end_date: null,
        is_completed: true, is_in_progress: false, is_starred: false,
        repeat_type: tmpl.repeat_type, repeat_days: null, order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null, category: tmpl.category || null,
        is_habit: true, start_time: null, end_time: null,
        is_template: false, parent_id: templateId,
        skipped_dates: null, rollover_source_id: null,
        completion_note: null, completed_at: now,
        created_at: now, updated_at: now
      }
      insertTaskRow(db, inst)
      return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id))
    }
    const inst = rowToTask(instRow)
    const now = nowIso()
    const newCompleted = !inst.is_completed
    db.prepare(
      `UPDATE tasks SET is_completed = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(newCompleted ? 1 : 0, newCompleted ? now : null, now, inst.id)
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(inst.id))
  },

  // ── Categories ───────────────────────────────────────────
  getCategories() {
    const db = getDb()
    const rows = db.prepare('SELECT id, label, color FROM categories').all()
    if (rows.length > 0) return rows
    // fallback: 마이그레이션 호환 — settings의 categories 키
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
    db.transaction(() => {
      db.prepare('DELETE FROM categories').run()
      const stmt = db.prepare('INSERT INTO categories (id, label, color) VALUES (?, ?, ?)')
      for (const c of categories) stmt.run(c.id, c.label, c.color || null)
    })()
  },

  // ── 설정 (key/value) ─────────────────────────────────────
  getSetting(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return undefined
    const raw = row.value
    if (raw === null || raw === undefined) return raw
    // object/array만 JSON 파싱 — 일반 문자열은 그대로 반환.
    // ('true', '123' 같은 사용자 입력 문자열이 boolean/number로 오인되는 것 방지)
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

  // ── PDS: See 회고 ────────────────────────────────────────
  getSeeMemo(date) {
    const row = getDb()
      .prepare('SELECT good, bad, next FROM see_memos WHERE date = ?')
      .get(date)
    if (!row) return { good: '', bad: '', next: '' }
    return { good: row.good || '', bad: row.bad || '', next: row.next || '' }
  },

  setSeeMemo(date, obj) {
    const db = getDb()
    const good = (obj && obj.good) || ''
    const bad = (obj && obj.bad) || ''
    const next = (obj && obj.next) || ''
    db.prepare(
      `INSERT OR REPLACE INTO see_memos (date, good, bad, next, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(date, good, bad, next, nowIso())
  },

  // ── PDS: Look Back ──────────────────────────────────────
  getMonthlyStats(months) {
    const db = getDb()
    const totalStmt = db.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE date LIKE ? AND is_template = 0`
    )
    const doneStmt = db.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE date LIKE ? AND is_template = 0 AND is_completed = 1`
    )
    return months.map((ym) => {
      const pattern = `${ym}-%`
      const total = totalStmt.get(pattern).c
      const done = doneStmt.get(pattern).c
      return { ym, total, done, rate: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
  },

  // ── PDS: Look Forward ───────────────────────────────────
  getMonthlyGoal(ym) {
    const row = getDb().prepare('SELECT text FROM monthly_goals WHERE ym = ?').get(ym)
    return row ? row.text || '' : ''
  },

  setMonthlyGoal(ym, text) {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO monthly_goals (ym, text, updated_at)
         VALUES (?, ?, ?)`
      )
      .run(ym, text, nowIso())
  }
}
