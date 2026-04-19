import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const dbPath = join(app.getPath('userData'), 'todostick.json')

function read() {
  try {
    if (!existsSync(dbPath)) return { tasks: [] }
    return JSON.parse(readFileSync(dbPath, 'utf-8'))
  } catch {
    return { tasks: [] }
  }
}

function write(data) {
  writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export default {
  getTasksByDate(date) {
    const { tasks } = read()
    return tasks
      .filter((t) => t.date === date)
      .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
  },

  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const { tasks } = read()
    return tasks
      .filter((t) => t.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index)
  },

  getTasksByRange(startDate, endDate) {
    const { tasks } = read()
    return tasks
      .filter((t) => t.date >= startDate && t.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index)
  },

  createTask({ title, memo = '', date, repeat_type = 'none', order_index = 0 }) {
    const data = read()
    const task = {
      id: generateId(), title, memo, date,
      is_completed: false, repeat_type, order_index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    data.tasks.push(task)
    write(data)
    return task
  },

  updateTask(id, fields) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    Object.assign(task, fields, { updated_at: new Date().toISOString() })
    write(data)
    return task
  },

  toggleTask(id) {
    const data = read()
    const task = data.tasks.find((t) => t.id === id)
    if (!task) return null
    task.is_completed = !task.is_completed
    task.updated_at = new Date().toISOString()
    write(data)
    return task
  },

  deleteTask(id) {
    const data = read()
    data.tasks = data.tasks.filter((t) => t.id !== id)
    write(data)
    return { id }
  }
}
