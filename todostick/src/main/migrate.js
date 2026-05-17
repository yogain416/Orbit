import { existsSync, readFileSync } from 'fs'

const TASK_COLS = [
  'id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress', 'is_starred',
  'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category', 'is_habit',
  'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates', 'rollover_source_id',
  'completion_note', 'completed_at', 'created_at', 'updated_at'
]

const BOOL_COLS = new Set(['is_completed', 'is_in_progress', 'is_starred', 'is_habit', 'is_template'])
const ARRAY_COLS = new Set(['repeat_days', 'skipped_dates'])

function normalizeTaskValue(col, value) {
  if (value === undefined) return null
  if (BOOL_COLS.has(col)) return value ? 1 : 0
  if (ARRAY_COLS.has(col)) return value ? JSON.stringify(value) : null
  return value
}

export function migrateJsonToSqlite(jsonPath, db) {
  const already = db.prepare("SELECT value FROM meta WHERE key='json_migrated'").get()
  if (already) {
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 }
  }

  if (!existsSync(jsonPath)) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('json_migrated', '1')").run()
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 }
  }

  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const tasks = raw.tasks || []
  const settings = raw.settings || {}

  const insertTask = db.prepare(`INSERT INTO tasks (${TASK_COLS.join(', ')}) VALUES (${TASK_COLS.map(() => '?').join(', ')})`)
  const insertCategory = db.prepare('INSERT OR REPLACE INTO categories (id, label, color) VALUES (?, ?, ?)')
  const insertSeeMemo = db.prepare('INSERT OR REPLACE INTO see_memos (date, good, bad, next, updated_at) VALUES (?, ?, ?, ?, ?)')
  const insertGoal = db.prepare('INSERT OR REPLACE INTO monthly_goals (ym, text, updated_at) VALUES (?, ?, ?)')
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  const now = new Date().toISOString()
  let categoriesCount = 0
  let seeCount = 0
  let goalCount = 0

  db.transaction(() => {
    for (const t of tasks) {
      insertTask.run(...TASK_COLS.map((col) => normalizeTaskValue(col, t[col])))
    }
    for (const cat of (settings.categories || [])) {
      insertCategory.run(cat.id, cat.label, cat.color || null)
      categoriesCount++
    }
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'categories') continue
      if (key.startsWith('see:')) {
        const date = key.slice(4)
        const obj = typeof value === 'string' ? { good: value, bad: '', next: '' } : value
        insertSeeMemo.run(date, obj.good || '', obj.bad || '', obj.next || '', now)
        seeCount++
      } else if (key.startsWith('goal:')) {
        const ym = key.slice(5)
        insertGoal.run(ym, String(value), now)
        goalCount++
      } else {
        const v = typeof value === 'string' ? value : JSON.stringify(value)
        insertSetting.run(key, v)
      }
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('json_migrated', '1')").run()
  })()

  return { skipped: false, tasks: tasks.length, categories: categoriesCount, seeMemos: seeCount, goals: goalCount }
}
