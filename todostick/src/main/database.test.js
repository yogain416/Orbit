import { describe, it, expect } from 'vitest'
import { autoRolloverOverdue } from './rollover.js'

function mkTask(overrides) {
  return {
    id: 'id_' + Math.random().toString(36).slice(2),
    title: 'task',
    date: '2026-05-16',
    is_completed: false,
    is_in_progress: false,
    is_template: false,
    parent_id: null,
    end_date: null,
    rollover_source_id: undefined,
    order_index: 0,
    color: null,
    category: null,
    memo: '',
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides
  }
}

describe('autoRolloverOverdue', () => {
  it('어제 미완료 일반 task를 오늘로 자동 복사한다', () => {
    const tasks = [
      mkTask({ id: 'a', title: '회의 준비', date: '2026-05-16', is_completed: false })
    ]
    const newTasks = autoRolloverOverdue(tasks, '2026-05-17')
    expect(newTasks).toHaveLength(1)
    expect(newTasks[0].title).toBe('회의 준비')
    expect(newTasks[0].date).toBe('2026-05-17')
    expect(newTasks[0].is_completed).toBe(false)
    expect(newTasks[0].rollover_source_id).toBe('a')
  })

  it('어제 이미 완료된 task는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: true })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('반복 인스턴스(parent_id 있음)는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', parent_id: 'tmpl1' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('템플릿(is_template)은 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_template: true })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('다일 이벤트(end_date 있음)는 복사하지 않는다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', end_date: '2026-05-18' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('이미 오늘로 이월된 원본은 중복 복사 안 함 (멱등)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_completed: false }),
      mkTask({ id: 'b', date: '2026-05-17', rollover_source_id: 'a' })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('어제 미완료 task의 is_in_progress 상태를 보존한다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_in_progress: true })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].is_in_progress).toBe(true)
  })

  it('일반 미완료의 is_in_progress는 false 유지', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', is_in_progress: false })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].is_in_progress).toBe(false)
  })

  it('어제보다 더 옛날 task는 복사하지 않는다 (어제만 대상)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-10', is_completed: false })
    ]
    expect(autoRolloverOverdue(tasks, '2026-05-17')).toHaveLength(0)
  })

  it('order_index를 오늘 끝에 붙인다', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16', order_index: 5 }),
      mkTask({ id: 'b', date: '2026-05-17', order_index: 0 }),
      mkTask({ id: 'c', date: '2026-05-17', order_index: 1 })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].order_index).toBe(2)
  })

  it('새 id를 생성한다 (원본 id 재사용 X)', () => {
    const tasks = [
      mkTask({ id: 'a', date: '2026-05-16' })
    ]
    const out = autoRolloverOverdue(tasks, '2026-05-17')
    expect(out[0].id).not.toBe('a')
    expect(out[0].id).toBeTruthy()
  })
})
