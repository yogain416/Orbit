import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const dbPath = join(app.getPath('userData'), 'todostick.json')

function read() {
  try {
    if (!existsSync(dbPath)) return { tasks: [], settings: {} }
    const data = JSON.parse(readFileSync(dbPath, 'utf-8'))
    if (!data.settings) data.settings = {}
    return data
  } catch {
    return { tasks: [], settings: {} }
  }
}

function write(data) {
  writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
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
  let changed = false
  for (const tmpl of templates) {
    if (!shouldRepeatOnDate(tmpl, date)) continue
    const exists = data.tasks.some((t) => t.parent_id === tmpl.id && t.date === date)
    if (!exists) {
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
        parent_id: tmpl.id,
        is_template: false,
        completion_note: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
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
  getTasksByDate(date) {
    const data = read()
    const changed = generateRepeatInstances(data, date)
    if (changed) write(data)
    return data.tasks
      .filter((t) => t.date === date && !t.is_template)
      .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
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
      .filter((t) => t.date.startsWith(prefix) && !t.is_template)
      .sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index)
  },

  getTasksByRange(startDate, endDate) {
    const data = read()
    let changed = false
    for (const date of dateRange(startDate, endDate)) {
      if (generateRepeatInstances(data, date)) changed = true
    }
    if (changed) write(data)
    return data.tasks
      .filter((t) => t.date >= startDate && t.date <= endDate && !t.is_template)
      .sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index)
  },

  getOverdueTasks(date) {
    const { tasks } = read()
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    const yesterday = d.toISOString().slice(0, 10)
    return tasks.filter((t) => t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id)
  },

  getTodayReminders(date) {
    const { tasks } = read()
    return tasks.filter((t) => t.date === date && t.remind_at && !t.is_template)
  },

  createTask({ title, memo = '', date, repeat_type = 'none', repeat_days = null, order_index = 0, remind_at = null, color = null, category = null }) {
    const data = read()
    if (repeat_type === 'none') {
      const task = {
        id: generateId(), title, memo, date,
        is_completed: false, repeat_type, order_index,
        remind_at, color, category, is_template: false, parent_id: null,
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
      remind_at, color, category, is_template: true, parent_id: null,
      skipped_dates: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const instance = {
      id: generateId(), title, memo, date,
      is_completed: false, repeat_type, order_index,
      remind_at, color, category, is_template: false, parent_id: templateId,
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
    Object.assign(task, fields, { updated_at: new Date().toISOString() })
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
    } else {
      task.completed_at = null
      task.completion_note = null
    }
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
    const overdue = data.tasks.filter((t) => t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id)
    const overdueIds = new Set(overdue.map((t) => t.id))
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length
    const newTasks = overdue.map((t, i) => ({
      id: generateId(),
      title: t.title,
      memo: t.memo,
      date: toDate,
      is_completed: false,
      repeat_type: 'none',
      order_index: maxOrder + i,
      remind_at: null,
      color: t.color || null,
      category: t.category || null,
      is_template: false,
      parent_id: null,
      completion_note: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
    // 원본 삭제 후 오늘 날짜로 이동
    data.tasks = data.tasks.filter((t) => !overdueIds.has(t.id))
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
  },

  rolloverSelectedTasks(taskIds, toDate) {
    const data = read()
    const idSet = new Set(taskIds)
    const selected = data.tasks.filter((t) => idSet.has(t.id))
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length
    const newTasks = selected.map((t, i) => ({
      id: generateId(), title: t.title, memo: t.memo, date: toDate,
      is_completed: false, repeat_type: 'none', order_index: maxOrder + i,
      remind_at: null, color: t.color || null,
      category: t.category || null,
      is_template: false, parent_id: null,
      completion_note: null, completed_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }))
    data.tasks = data.tasks.filter((t) => !idSet.has(t.id))
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
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
