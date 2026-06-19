function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function yesterdayOf(toDate) {
  const d = new Date(toDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// 이월 후보 공통 조건: toDate 이전 미완료 일반 task 중 아직 한 번도 이월되지 않은 것.
// 주말/휴가로 며칠 비워도 chain이 끊기지 않게 'date < toDate' 전체를 본다.
// rolled_at이 set이면 영구 제외 (사용자가 카피를 삭제해도 다시 이월되지 않음).
// held_at이 set이면 제외 (보류된 항목은 보류 목록에서만 관리, 이월 대상 아님).
function isRolloverEligible(t, toDate) {
  return (
    t.date < toDate &&
    !t.is_completed &&
    !t.is_template &&
    !t.parent_id &&
    !t.end_date &&
    !t.rolled_at &&
    !t.held_at
  )
}

// 사용자 선택형 이월 후보(모달용): 진행중이 '아닌' 항목만.
// 진행중 항목은 모달을 거치지 않고 자동 이월되므로 후보에서 뺀다.
export function getRolloverCandidates(tasks, toDate) {
  return tasks.filter((t) => isRolloverEligible(t, toDate) && !t.is_in_progress)
}

// 자동 이월 대상: 진행중 항목만. 오늘 진입 시 모달 없이 조용히 오늘로 복사된다.
export function getInProgressRolloverCandidates(tasks, toDate) {
  return tasks.filter((t) => isRolloverEligible(t, toDate) && t.is_in_progress)
}

// 카피 row 빌더. sources는 이월 대상 원본 배열, existingMaxOrder는 toDate에 이미 존재하는 task 개수.
export function buildRolloverCopies(sources, toDate, existingMaxOrder) {
  if (sources.length === 0) return []
  const now = new Date().toISOString()
  return sources.map((t, i) => ({
    id: generateId(),
    title: t.title,
    memo: t.memo,
    date: toDate,
    is_completed: false,
    is_in_progress: !!t.is_in_progress,
    repeat_type: 'none',
    order_index: existingMaxOrder + i,
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
