import { describe, it, expect } from 'vitest'
import { shouldRepeatOnDate, buildRepeatInstancesForDate } from './repeat.js'

function mkTemplate(overrides) {
  return {
    id: 'tmpl_' + Math.random().toString(36).slice(2),
    title: 'task',
    memo: '',
    date: '2026-05-10',
    is_template: true,
    parent_id: null,
    repeat_type: 'daily',
    repeat_days: null,
    skipped_dates: [],
    is_habit: false,
    order_index: 0,
    remind_at: null,
    color: null,
    category: null,
    is_completed: false,
    is_in_progress: false,
    is_starred: false,
    start_time: null,
    end_time: null,
    end_date: null,
    rollover_source_id: null,
    completion_note: null,
    completed_at: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
    ...overrides
  }
}

let counter = 0
const mockId = () => `gen_${++counter}`

describe('shouldRepeatOnDate', () => {
  it('template.date보다 작거나 같은 날엔 인스턴스 생성 안 함', () => {
    const t = mkTemplate({ date: '2026-05-17' })
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(false)
    expect(shouldRepeatOnDate(t, '2026-05-10')).toBe(false)
  })

  it('skipped_dates 포함된 날은 false', () => {
    const t = mkTemplate({ date: '2026-05-10', skipped_dates: ['2026-05-17'] })
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(false)
  })

  it('daily 반복 + repeat_days 없음 → 매일 true', () => {
    const t = mkTemplate({ date: '2026-05-10', repeat_type: 'daily' })
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(true)
    expect(shouldRepeatOnDate(t, '2026-05-18')).toBe(true)
  })

  it('daily + repeat_days [1,2,3,4,5] → 평일만 (월~금)', () => {
    const t = mkTemplate({ date: '2026-05-10', repeat_type: 'daily', repeat_days: [1,2,3,4,5] })
    // 2026-05-17은 일요일 (getDay=0), 5-18은 월요일 (1)
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(false) // 일
    expect(shouldRepeatOnDate(t, '2026-05-18')).toBe(true)  // 월
    expect(shouldRepeatOnDate(t, '2026-05-22')).toBe(true)  // 금
    expect(shouldRepeatOnDate(t, '2026-05-23')).toBe(false) // 토
  })

  it('weekly → 템플릿과 같은 요일만', () => {
    // 2026-05-10는 일요일 (getDay=0)
    const t = mkTemplate({ date: '2026-05-10', repeat_type: 'weekly' })
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(true)  // 일
    expect(shouldRepeatOnDate(t, '2026-05-18')).toBe(false) // 월
    expect(shouldRepeatOnDate(t, '2026-05-24')).toBe(true)  // 일
  })

  it('monthly → 템플릿과 같은 일자만', () => {
    const t = mkTemplate({ date: '2026-05-10', repeat_type: 'monthly' })
    expect(shouldRepeatOnDate(t, '2026-06-10')).toBe(true)
    expect(shouldRepeatOnDate(t, '2026-06-11')).toBe(false)
    expect(shouldRepeatOnDate(t, '2026-07-10')).toBe(true)
  })

  it('repeat_type none 또는 알 수 없는 값은 false', () => {
    const t = mkTemplate({ date: '2026-05-10', repeat_type: 'none' })
    expect(shouldRepeatOnDate(t, '2026-05-17')).toBe(false)
  })
})

describe('buildRepeatInstancesForDate', () => {
  it('템플릿 없으면 빈 배열', () => {
    const result = buildRepeatInstancesForDate([], '2026-05-17', mockId)
    expect(result).toEqual([])
  })

  it('daily 템플릿 + 해당 날짜 인스턴스 없음 → 1개 생성', () => {
    const tmpl = mkTemplate({ id: 'tmpl1', date: '2026-05-10', repeat_type: 'daily', title: '스트레칭' })
    const result = buildRepeatInstancesForDate([tmpl], '2026-05-17', mockId)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('스트레칭')
    expect(result[0].date).toBe('2026-05-17')
    expect(result[0].is_template).toBe(false)
    expect(result[0].parent_id).toBe('tmpl1')
    expect(result[0].repeat_type).toBe('daily')
  })

  it('이미 해당 날짜 인스턴스 있으면 중복 생성 안 함', () => {
    const tmpl = mkTemplate({ id: 'tmpl1', date: '2026-05-10', repeat_type: 'daily' })
    const existing = { id: 'inst1', date: '2026-05-17', parent_id: 'tmpl1', is_template: false, repeat_type: 'daily', title: 't' }
    const result = buildRepeatInstancesForDate([tmpl, existing], '2026-05-17', mockId)
    expect(result).toEqual([])
  })

  it('여러 템플릿 처리', () => {
    const t1 = mkTemplate({ id: 'a', date: '2026-05-10', repeat_type: 'daily', title: 'A' })
    const t2 = mkTemplate({ id: 'b', date: '2026-05-10', repeat_type: 'daily', title: 'B' })
    const result = buildRepeatInstancesForDate([t1, t2], '2026-05-17', mockId)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.title).sort()).toEqual(['A', 'B'])
  })

  it('is_template false인 것은 무시 (인스턴스는 인스턴스만 만들지 않음)', () => {
    const inst = mkTemplate({ id: 'a', date: '2026-05-10', repeat_type: 'daily', is_template: false })
    const result = buildRepeatInstancesForDate([inst], '2026-05-17', mockId)
    expect(result).toEqual([])
  })

  it('repeat_type none인 template도 무시', () => {
    const t = mkTemplate({ id: 'a', date: '2026-05-10', repeat_type: 'none', is_template: true })
    const result = buildRepeatInstancesForDate([t], '2026-05-17', mockId)
    expect(result).toEqual([])
  })

  it('shouldRepeatOnDate가 false인 날짜는 skip', () => {
    // weekly 템플릿, 다른 요일
    const t = mkTemplate({ id: 'a', date: '2026-05-10', repeat_type: 'weekly' }) // 일요일
    const result = buildRepeatInstancesForDate([t], '2026-05-18', mockId) // 월요일
    expect(result).toEqual([])
  })

  it('생성된 인스턴스가 템플릿 속성 보존 (color, category, order_index, is_habit, remind_at)', () => {
    const t = mkTemplate({
      id: 'a', date: '2026-05-10', repeat_type: 'daily',
      title: '운동', color: 'orange', category: 'health',
      order_index: 5, is_habit: true, remind_at: '09:00'
    })
    const result = buildRepeatInstancesForDate([t], '2026-05-17', mockId)
    expect(result[0].color).toBe('orange')
    expect(result[0].category).toBe('health')
    expect(result[0].order_index).toBe(5)
    expect(result[0].is_habit).toBe(true)
    expect(result[0].remind_at).toBe('09:00')
  })

  it('생성된 인스턴스는 is_completed false, completion_note null, completed_at null', () => {
    const t = mkTemplate({ id: 'a', date: '2026-05-10', repeat_type: 'daily' })
    const result = buildRepeatInstancesForDate([t], '2026-05-17', mockId)
    expect(result[0].is_completed).toBe(false)
    expect(result[0].completion_note).toBeNull()
    expect(result[0].completed_at).toBeNull()
  })

  it('생성된 인스턴스의 id는 generateId로 생성됨', () => {
    counter = 100
    const t = mkTemplate({ id: 'tmpl', date: '2026-05-10', repeat_type: 'daily' })
    const result = buildRepeatInstancesForDate([t], '2026-05-17', mockId)
    expect(result[0].id).toBe('gen_101')
  })
})
