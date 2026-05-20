function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function yesterdayOf(toDate) {
  const d = new Date(toDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function autoRolloverOverdue(tasks, toDate) {
  // toDate 이전의 모든 미완료를 대상으로 함 — 주말/휴가로 며칠 비워도 chain 끊기지 않게.
  const candidates = tasks.filter((t) =>
    t.date < toDate &&
    !t.is_completed &&
    !t.is_template &&
    !t.parent_id &&
    !t.end_date
  )
  if (candidates.length === 0) return []

  const existingSources = new Set(
    tasks
      .filter((t) => t.date === toDate && t.rollover_source_id)
      .map((t) => t.rollover_source_id)
  )
  const toCopy = candidates.filter((t) => !existingSources.has(t.id))
  if (toCopy.length === 0) return []

  const maxOrder = tasks.filter((t) => t.date === toDate).length
  const now = new Date().toISOString()

  return toCopy.map((t, i) => ({
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
}
