import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { autoRolloverOverdue as computeAutoRolloverOverdue } from './rollover.js'

// lazy: setup-paths.js의 setPath가 적용된 후 호출됨
function dbPath() {
  return join(app.getPath('userData'), 'todostick.json')
}

// 모듈 전역 인메모리 캐시 — Electron 메인 프로세스 단일 owner라 동시성 안전.
// 모든 read/write가 이 캐시를 경유. write 시 디스크 동기 flush로 영속성 유지.
let cache = null

function read() {
  if (cache) return cache
  try {
    const path = dbPath()
    if (!existsSync(path)) {
      cache = { tasks: [], settings: {} }
      return cache
    }
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    if (!data.settings) data.settings = {}
    // lazy migration: is_habit / is_in_progress / is_starred 필드 보정 (캐시 적재 시 1회만)
    for (const t of data.tasks) {
      if (t.is_habit === undefined) t.is_habit = false
      if (t.is_in_progress === undefined) t.is_in_progress = false
      if (t.is_starred === undefined) t.is_starred = false
    }
    cache = data
    return cache
  } catch {
    cache = { tasks: [], settings: {} }
    return cache
  }
}

function write(data) {
  cache = data
  writeFileSync(dbPath(), JSON.stringify(data, null, 2), 'utf-8')
}

// dev 모드에서 빈 DB일 때 시드 데이터 자동 생성
function seedIfEmpty() {
  const path = dbPath()
  if (existsSync(path)) return false
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const seed = {
    tasks: [],
    settings: {
      categories: [
        { id: 'work', label: '업무', color: 'blue' },
        { id: 'personal', label: '개인', color: 'green' },
        { id: 'health', label: '운동', color: 'orange' }
      ]
    }
  }

  const mk = (overrides) => ({
    id: generateId(),
    title: '', memo: '', date: today,
    is_completed: false, repeat_type: 'none', order_index: 0,
    remind_at: null, color: null, category: null, is_habit: false,
    start_time: null, end_time: null,
    is_template: false, parent_id: null,
    completion_note: null, completed_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides
  })

  // 일반 할 일 (오늘)
  seed.tasks.push(mk({ title: '🧪 [DEV] 회의 준비', category: 'work', color: 'blue', start_time: '10:00', end_time: '11:00', order_index: 0 }))
  seed.tasks.push(mk({ title: '🧪 [DEV] 점심 약속', category: 'personal', color: 'green', start_time: '12:30', end_time: '13:30', order_index: 1 }))
  seed.tasks.push(mk({ title: '🧪 [DEV] 코드 리뷰', category: 'work', color: 'blue', order_index: 2 }))

  // 어제 미완료 (이월 테스트용)
  seed.tasks.push(mk({ title: '🧪 [DEV] 어제 못 끝낸 일', date: yesterday, order_index: 99 }))

  // 매일 반복 + 습관 (스트레칭)
  const stretchT = mk({
    title: '🌱 [DEV] 스트레칭 10분', date: lastWeek,
    repeat_type: 'daily', is_template: true, is_habit: true,
    color: 'orange', category: 'health', skipped_dates: []
  })
  seed.tasks.push(stretchT)
  // 지난 7일 중 5일 완료한 척
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    if (i % 3 === 0) continue // 일부는 건너뜀(miss)
    seed.tasks.push(mk({
      title: stretchT.title, date: d,
      repeat_type: 'daily', is_habit: true, color: 'orange', category: 'health',
      parent_id: stretchT.id,
      is_completed: true, completed_at: new Date(Date.now() - i * 86400000).toISOString()
    }))
  }

  // 평일 반복 + 습관 (물 8잔)
  const waterT = mk({
    title: '🌱 [DEV] 물 8잔 마시기', date: lastWeek,
    repeat_type: 'daily', repeat_days: [1, 2, 3, 4, 5],
    is_template: true, is_habit: true,
    color: 'blue', category: 'health', skipped_dates: []
  })
  seed.tasks.push(waterT)

  // 매주 회의 (반복만, 습관 아님)
  const meetingT = mk({
    title: '🧪 [DEV] 주간 팀 미팅', date: lastWeek,
    repeat_type: 'weekly', is_template: true,
    color: 'purple', category: 'work', skipped_dates: []
  })
  seed.tasks.push(meetingT)

  writeFileSync(path, JSON.stringify(seed, null, 2), 'utf-8')
  cache = null // 다음 read()가 시드 적재 + 마이그레이션을 거치도록 무효화
  return true
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function shouldRepeatOnDate(template, date) {
  if (template.date >= date) return false
  if (template.skipped_dates && template.skipped_dates.includes(date)) return false
  const tDate = new Date(template.date + 'T00:00:00')
  const rDate = new Date(date + 'T00:00:00')
  if (template.repeat_type === 'daily') {
    if (template.repeat_days && template.repeat_days.length > 0) {
      return template.repeat_days.includes(rDate.getDay())
    }
    return true
  }
  if (template.repeat_type === 'weekly') return tDate.getDay() === rDate.getDay()
  if (template.repeat_type === 'monthly') return tDate.getDate() === rDate.getDate()
  return false
}

function generateRepeatInstances(data, date) {
  const templates = data.tasks.filter((t) => t.is_template && t.repeat_type !== 'none')
  if (templates.length === 0) return false
  // 같은 date에 이미 생성된 인스턴스를 1회 스캔으로 Set화 → O(1) 룩업
  // (기존: 템플릿마다 data.tasks.some() 풀스캔 = O(T*N))
  const existing = new Set()
  for (const t of data.tasks) {
    if (t.parent_id && t.date === date) existing.add(t.parent_id)
  }
  let changed = false
  for (const tmpl of templates) {
    if (!shouldRepeatOnDate(tmpl, date)) continue
    if (!existing.has(tmpl.id)) {
      data.tasks.push({
        id: generateId(),
        title: tmpl.title,
        memo: tmpl.memo,
        date,
        is_completed: false,
        repeat_type: tmpl.repeat_type,
        order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null,
        category: tmpl.category || null,
        is_habit: !!tmpl.is_habit,
        parent_id: tmpl.id,
        is_template: false,
        completion_note: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      existing.add(tmpl.id)
      changed = true
    }
  }
  return changed
}

function dateRange(startDate, endDate) {
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (cur <= end) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default {
  seedIfEmpty,
  getDbPath: () => dbPath(),

  getTasksByDate(date) {
    const data = read()
    const changed = generateRepeatInstances(data, date)
    if (changed) write(data)
    return data.tasks
      .filter((t) => !t.is_template && (
        t.date === date ||
        (t.end_date && t.date <= date && date <= t.end_date)
      ))
      .sort((a, b) => {
        // 진행중이 최우선 (단, 완료된 것은 제외 — setInProgress가 둘 다 true 방지하지만 안전망)
        const aInProg = !!a.is_in_progress && !a.is_completed
        const bInProg = !!b.is_in_progress && !b.is_completed
        if (aInProg !== bInProg) return aInProg ? -1 : 1
        const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
        if (star) return star
        return a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)
      })
  },

  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const daysInMonth = new Date(year, month, 0).getDate()
    const startDate = `${prefix}-01`
    const endDate = `${prefix}-${String(daysInMonth).padStart(2, '0')}`
    const data = read()
    let changed = false
    for (const date of dateRange(startDate, endDate)) {
      if (generateRepeatInstances(data, date)) changed = true
    }
    if (changed) write(data)
    return data.tasks
      .filter((t) => !t.is_template && (
        t.date.startsWith(prefix) ||
        (t.end_date && t.date <= endDate && t.end_date >= startDate)
      ))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        const aInProg = !!a.is_in_progress && !a.is_completed
        const bInProg = !!b.is_in_progress && !b.is_completed
        if (aInProg !== bInProg) return aInProg ? -1 : 1
        const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
        if (star) return star
        return a.order_index - b.order_index
      })
  },

  getTasksByRange(startDate, endDate) {
    const data = read()
    let changed = false
    for (const date of dateRange(startDate, endDate)) {
      if (generateRepeatInstances(data, date)) changed = true
    }
    if (changed) write(data)
    return data.tasks
      .filter((t) => !t.is_template && (
        (t.date >= startDate && t.date <= endDate) ||
        (t.end_date && t.date <= endDate && t.end_date >= startDate)
      ))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        const aInProg = !!a.is_in_progress && !a.is_completed
        const bInProg = !!b.is_in_progress && !b.is_completed
        if (aInProg !== bInProg) return aInProg ? -1 : 1
        const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
        if (star) return star
        return a.order_index - b.order_index
      })
  },

  getOverdueTasks(date) {
    const { tasks } = read()
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    const yesterday = d.toISOString().slice(0, 10)
    // 이미 오늘로 이월된 원본은 제외 (rolloverTasks가 원본 보존하므로 멱등 보장 필요)
    const rolledSources = new Set(
      tasks.filter((t) => t.date === date && t.rollover_source_id).map((t) => t.rollover_source_id)
    )
    // 다일 이벤트(end_date 보유)는 이미 오늘 셀에 자연 표시되므로 이월 대상 아님
    return tasks.filter((t) =>
      t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date && !rolledSources.has(t.id)
    )
  },

  getTodayReminders(date) {
    const { tasks } = read()
    return tasks.filter((t) => t.date === date && t.remind_at && !t.is_template)
  },

  createTask({ title, memo = '', date, end_date = null, repeat_type = 'none', repeat_days = null, order_index = 0, remind_at = null, color = null, category = null, is_habit = false, start_time = null, end_time = null }) {
    const data = read()
    // 습관은 반복 일정일 때만 의미가 있음
    const habit = repeat_type !== 'none' && !!is_habit
    // 다일 이벤트는 비반복 + 일반 날짜(M:/W: 풀 키 아님)일 때만 의미 있음
    const isPoolKey = typeof date === 'string' && (date.startsWith('M:') || date.startsWith('W:'))
    const resolvedEndDate = (repeat_type === 'none' && !isPoolKey && end_date && end_date > date) ? end_date : null
    if (repeat_type === 'none') {
      const task = {
        id: generateId(), title, memo, date, end_date: resolvedEndDate,
        is_completed: false, repeat_type, order_index,
        remind_at, color, category, is_habit: false,
        start_time, end_time,
        is_template: false, parent_id: null,
        completion_note: null, completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      data.tasks.push(task)
      write(data)
      return task
    }
    const templateId = generateId()
    const resolvedRepeatDays = (repeat_type === 'daily' && repeat_days && repeat_days.length < 7) ? repeat_days : null
    const template = {
      id: templateId, title, memo, date,
      is_completed: false, repeat_type, repeat_days: resolvedRepeatDays, order_index,
      remind_at, color, category, is_habit: habit,
      start_time, end_time,
      is_template: true, parent_id: null,
      skipped_dates: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const instance = {
      id: generateId(), title, memo, date,
      is_completed: false, repeat_type, order_index,
      remind_at, color, category, is_habit: habit,
      start_time, end_time,
      is_template: false, parent_id: templateId,
      completion_note: null, completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    data.tasks.push(template, instance)
    write(data)
    return instance
  },

  updateTask(id, fields) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    const wasTemplate = !!task.is_template
    const prevRepeatType = task.repeat_type
    Object.assign(task, fields, { updated_at: new Date().toISOString() })

    // is_habit 변경은 템플릿/인스턴스 전체에 전파 (HabitView는 템플릿만 보므로 부모도 맞춰야 잔디에 반영됨)
    if (Object.prototype.hasOwnProperty.call(fields, 'is_habit')) {
      const templateId = task.is_template ? task.id : task.parent_id
      if (templateId) {
        const now = new Date().toISOString()
        for (const t of data.tasks) {
          if (t.id === templateId || t.parent_id === templateId) {
            t.is_habit = !!fields.is_habit
            t.updated_at = now
          }
        }
      }
    }

    // 반복 제거: 템플릿의 repeat_type을 'none'으로 변경 시 미래 인스턴스 정리
    // (과거 인스턴스는 기록 보존, 템플릿은 일반 task로 변환되어 자동 생성 중단)
    if (wasTemplate && prevRepeatType !== 'none' && fields.repeat_type === 'none') {
      const todayStr = new Date().toISOString().slice(0, 10)
      data.tasks = data.tasks.filter((t) => {
        if (t.parent_id === task.id && t.date > todayStr) return false
        return true
      })
      task.is_template = false
      task.parent_id = null
      task.skipped_dates = undefined
      task.is_habit = false
    }

    write(data)
    return task
  },

  toggleTask(id, completionNote = null) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    task.is_completed = !task.is_completed
    task.updated_at = new Date().toISOString()
    if (task.is_completed) {
      task.completed_at = new Date().toISOString()
      task.completion_note = completionNote || null
      task.is_in_progress = false
    } else {
      task.completed_at = null
      task.completion_note = null
    }
    write(data)
    return task
  },

  setInProgress(id, value) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    task.is_in_progress = !!value
    if (task.is_in_progress) task.is_completed = false
    task.updated_at = new Date().toISOString()
    write(data)
    return task
  },

  setStarred(id, value) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    task.is_starred = !!value
    task.updated_at = new Date().toISOString()
    write(data)
    return task
  },

  getCompletedTasks({ category, search } = {}) {
    const { tasks } = read()
    return tasks
      .filter((t) => {
        if (!t.is_completed || t.is_template) return false
        if (category && t.category !== category) return false
        if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
            !(t.completion_note || '').toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at))
  },

  deleteTask(id) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (task && task.parent_id) {
      // 반복 인스턴스 삭제 시 해당 날짜를 skip 처리
      const template = data.tasks.find((t) => t.id === task.parent_id)
      if (template) {
        if (!template.skipped_dates) template.skipped_dates = []
        template.skipped_dates.push(task.date)
      }
    }
    data.tasks = data.tasks.filter((t) => t.id !== id)
    write(data)
    return { id }
  },

  deleteTaskAndFuture(id, fromDate) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return { id }
    const templateId = task.is_template ? task.id : (task.parent_id || null)
    if (templateId) {
      data.tasks = data.tasks.filter((t) => {
        if (t.id === templateId) return false
        if (t.parent_id === templateId && t.date >= fromDate) return false
        return true
      })
    } else {
      data.tasks = data.tasks.filter((t) => t.id !== id)
    }
    write(data)
    return { id }
  },

  reorderTasks(date, orderedIds) {
    const data = read()
    orderedIds.forEach((id, index) => {
      const task = data.tasks.find((t) => t.id === id)
      if (task) {
        task.order_index = index
        task.updated_at = new Date().toISOString()
      }
    })
    write(data)
    return true
  },

  rolloverTasks(toDate) {
    const data = read()
    const d = new Date(toDate)
    d.setDate(d.getDate() - 1)
    const yesterday = d.toISOString().slice(0, 10)
    // 다일 이벤트는 이월 대상에서 제외 (이미 오늘 표시됨)
    const overdue = data.tasks.filter((t) => t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date)
    // 멱등: 같은 원본을 이미 toDate에 복사한 게 있으면 스킵
    const existingSources = new Set(
      data.tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
    )
    const toCopy = overdue.filter((t) => !existingSources.has(t.id))
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length
    const now = new Date().toISOString()
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title,
      memo: t.memo,
      date: toDate,
      is_completed: false,
      is_in_progress: !!t.is_in_progress,
      repeat_type: 'none',
      order_index: maxOrder + i,
      remind_at: null,
      color: t.color || null,
      category: t.category || null,
      is_template: false,
      parent_id: null,
      rollover_source_id: t.id,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    }))
    // 원본은 그대로 유지 — 어제 기록 보존
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
  },

  rolloverSelectedTasks(taskIds, toDate) {
    const data = read()
    const idSet = new Set(taskIds)
    // 다일 이벤트는 이미 오늘 표시되므로 선택 들어와도 복사 안 함 (방어)
    const selected = data.tasks.filter((t) => idSet.has(t.id) && !t.end_date)
    const existingSources = new Set(
      data.tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
    )
    const toCopy = selected.filter((t) => !existingSources.has(t.id))
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length
    const now = new Date().toISOString()
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(), title: t.title, memo: t.memo, date: toDate,
      is_completed: false, is_in_progress: !!t.is_in_progress,
      repeat_type: 'none', order_index: maxOrder + i,
      remind_at: null, color: t.color || null,
      category: t.category || null,
      is_template: false, parent_id: null,
      rollover_source_id: t.id,
      completion_note: null, completed_at: null,
      created_at: now, updated_at: now
    }))
    // 원본은 그대로 유지
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
  },

  autoRolloverOverdue(toDate) {
    const data = read()
    const newTasks = computeAutoRolloverOverdue(data.tasks, toDate)
    if (newTasks.length === 0) return []
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
  },

  // ── 습관 트래커 ─────────────────────────────────────────
  getHabitMatrix(fromDate, toDate) {
    const data = read()
    // fromDate~toDate 범위에 인스턴스 자동 생성
    let changed = false
    for (const date of dateRange(fromDate, toDate)) {
      if (generateRepeatInstances(data, date)) changed = true
    }
    if (changed) write(data)

    const templates = data.tasks.filter((t) => t.is_template && t.is_habit && t.repeat_type !== 'none')
    return templates.map((tmpl) => {
      const instances = data.tasks.filter(
        (t) => !t.is_template && t.parent_id === tmpl.id && t.date >= fromDate && t.date <= toDate
      )
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
        else if (date > new Date().toISOString().slice(0, 10)) status = 'future'
        else if (date === new Date().toISOString().slice(0, 10)) status = 'today'
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
    const data = read()
    const tmpl = data.tasks.find((t) => t.id === templateId && t.is_template)
    if (!tmpl) return null
    let inst = data.tasks.find((t) => t.parent_id === templateId && t.date === date && !t.is_template)
    if (!inst) {
      // 인스턴스가 아직 없는 날에 직접 체크 → 인스턴스 생성 후 완료 처리
      inst = {
        id: generateId(),
        title: tmpl.title,
        memo: tmpl.memo,
        date,
        is_completed: true,
        repeat_type: tmpl.repeat_type,
        order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null,
        category: tmpl.category || null,
        is_habit: true,
        parent_id: templateId,
        is_template: false,
        completion_note: null,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      data.tasks.push(inst)
    } else {
      inst.is_completed = !inst.is_completed
      inst.completed_at = inst.is_completed ? new Date().toISOString() : null
      inst.updated_at = new Date().toISOString()
    }
    write(data)
    return inst
  },

  // ── 플래너 풀 (M:YYYY-MM, W:YYYY-MM-DD 형식) ───────────
  getPoolTasks(poolKey) {
    const { tasks } = read()
    return tasks
      .filter((t) => t.date === poolKey && !t.is_template)
      .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
  },

  // ── Categories ─────────────────────────────────────────
  getCategories() {
    const { settings } = read()
    return settings.categories || []
  },

  setCategories(categories) {
    const data = read()
    data.settings.categories = categories
    write(data)
  },

  getSetting(key) {
    const { settings } = read()
    return settings[key]
  },

  setSetting(key, value) {
    const data = read()
    data.settings[key] = value
    write(data)
  },

  // ── PDS: See 회고 (날짜별) ─────────────────────────────
  getSeeMemo(date) {
    const { settings } = read()
    const raw = settings[`see:${date}`]
    if (!raw) return { good: '', bad: '', next: '' }
    if (typeof raw === 'string') return { good: raw, bad: '', next: '' }
    return raw
  },

  setSeeMemo(date, obj) {
    const data = read()
    data.settings[`see:${date}`] = obj
    write(data)
  },

  // ── PDS: Look Back 월별 통계 ──────────────────────────
  getMonthlyStats(months) {
    const { tasks } = read()
    return months.map((ym) => {
      const monthTasks = tasks.filter((t) => t.date.startsWith(ym) && !t.is_template)
      const total = monthTasks.length
      const done = monthTasks.filter((t) => t.is_completed).length
      return { ym, total, done, rate: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
  },

  // ── PDS: Look Forward 월별 목표 ───────────────────────
  getMonthlyGoal(ym) {
    const { settings } = read()
    return settings[`goal:${ym}`] || ''
  },

  setMonthlyGoal(ym, text) {
    const data = read()
    data.settings[`goal:${ym}`] = text
    write(data)
  }
}
