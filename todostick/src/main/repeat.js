/**
 * repeat.js — 반복 인스턴스 생성 순수 함수
 *
 * 이 모듈은 부수 효과(side effect) 없는 순수 함수만 포함한다.
 * DB 접근, 파일 I/O, 상태 변이(mutation)를 하지 않는다.
 * 호출자(database.js)가 반환값을 바탕으로 실제 DB/배열에 적용한다.
 */

/**
 * 특정 날짜에 반복 템플릿의 인스턴스를 생성해야 하는지 판단한다.
 *
 * @param {object} template - is_template: true인 태스크 객체
 * @param {string} date - 'YYYY-MM-DD' 형식의 대상 날짜
 * @returns {boolean}
 */
export function shouldRepeatOnDate(template, date) {
  if (template.date >= date) return false
  // 주 N회 목표형 습관은 고정 요일이 없음 → 자동 인스턴스를 만들지 않는다(완료는 수동 토글로만).
  if (template.weekly_goal) return false
  // 종료일(end_date) 이후는 반복하지 않음 — 습관 '중지' 시 end_date를 찍어 미래 인스턴스를 끊는다.
  // (일반 반복 템플릿은 end_date가 항상 null이므로 영향 없음.)
  if (template.end_date && date > template.end_date) return false
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

/**
 * 특정 날짜에 생성해야 할 반복 인스턴스 객체 배열을 반환한다.
 * 입력 tasks 배열을 변이(mutate)하지 않는다.
 *
 * @param {object[]} tasks - 전체 tasks 배열 (템플릿 + 인스턴스 혼합)
 * @param {string} date - 'YYYY-MM-DD' 형식의 대상 날짜
 * @param {() => string} generateId - 새 인스턴스 id 생성 함수 (의존성 주입)
 * @returns {object[]} 새로 만들어야 할 인스턴스 객체 배열 (이미 존재하는 것 제외)
 */
export function buildRepeatInstancesForDate(tasks, date, generateId) {
  const templates = tasks.filter((t) => t.is_template && t.repeat_type !== 'none')
  if (templates.length === 0) return []

  // 해당 날짜에 이미 존재하는 인스턴스의 parent_id Set
  const existing = new Set()
  for (const t of tasks) {
    if (t.parent_id && t.date === date) existing.add(t.parent_id)
  }

  const newInstances = []
  const now = new Date().toISOString()

  for (const tmpl of templates) {
    if (!shouldRepeatOnDate(tmpl, date)) continue
    if (existing.has(tmpl.id)) continue

    newInstances.push({
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
      created_at: now,
      updated_at: now
    })

    existing.add(tmpl.id)
  }

  return newInstances
}
