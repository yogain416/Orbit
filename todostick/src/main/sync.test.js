import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase } from './sqlite.js'
import { createSyncEngine, __internals } from './sync.js'

// ── Supabase 클라이언트 mock ──────────────────────────────────
// 한 컬렉션 안에서 chain된 .from().select().eq().gt().order().limit() 등을 모사한다.
// 테스트는 mockClient.tables[tableName]에 직접 데이터를 채워 pull 결과를 제어.

function makeMockClient(initial = {}) {
  const tables = {
    tasks: [],
    categories: [],
    monthly_goals: [],
    see_memos: [],
    ...initial
  }
  // 마지막으로 처리된 push 요청들 추적
  const calls = { upserts: [], deletes: [] }
  // 다음 N번 요청을 실패시키도록 큐잉 — 백오프 테스트용
  const failQueue = []

  function failNext(error) {
    failQueue.push(error)
  }

  function consumeFail() {
    return failQueue.length > 0 ? failQueue.shift() : null
  }

  function selectChain(tableName) {
    const filters = []
    let orderField = null
    let orderAsc = true
    let limit = null

    const chain = {
      select() { return chain },
      eq(field, value) {
        filters.push((r) => r[field] === value)
        return chain
      },
      gt(field, value) {
        filters.push((r) => (r[field] || '') > value)
        return chain
      },
      order(field, opts) {
        orderField = field
        orderAsc = opts?.ascending !== false
        return chain
      },
      limit(n) {
        limit = n
        return chain
      },
      then(resolve) {
        const err = consumeFail()
        if (err) {
          resolve({ data: null, error: err })
          return
        }
        let rows = tables[tableName].filter((r) => filters.every((f) => f(r)))
        if (orderField) {
          rows = [...rows].sort((a, b) => {
            const av = a[orderField] || ''
            const bv = b[orderField] || ''
            if (av < bv) return orderAsc ? -1 : 1
            if (av > bv) return orderAsc ? 1 : -1
            return 0
          })
        }
        if (limit != null) rows = rows.slice(0, limit)
        resolve({ data: rows.map((r) => ({ ...r })), error: null })
      }
    }
    return chain
  }

  function from(tableName) {
    return {
      select: () => selectChain(tableName),
      async upsert(payload, opts) {
        const err = consumeFail()
        if (err) return { data: null, error: err }
        const rows = Array.isArray(payload) ? payload : [payload]
        const onConflict = (opts?.onConflict || 'id').split(',').map((s) => s.trim())
        for (const row of rows) {
          const idx = tables[tableName].findIndex((r) =>
            onConflict.every((k) => r[k] === row[k])
          )
          if (idx >= 0) tables[tableName][idx] = { ...tables[tableName][idx], ...row }
          else tables[tableName].push({ ...row })
          calls.upserts.push({ table: tableName, payload: row })
        }
        return { data: rows, error: null }
      },
      delete() {
        const filters = []
        const delChain = {
          eq(field, value) {
            filters.push((r) => r[field] === value)
            return delChain
          },
          then(resolve) {
            const err = consumeFail()
            if (err) {
              resolve({ data: null, error: err })
              return
            }
            const before = tables[tableName].length
            tables[tableName] = tables[tableName].filter((r) => !filters.every((f) => f(r)))
            calls.deletes.push({ table: tableName, removed: before - tables[tableName].length })
            resolve({ data: null, error: null })
          }
        }
        return delChain
      }
    }
  }

  return { from, tables, calls, failNext }
}

let tmp
let db
let client
let engine

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-sync-'))
  db = openDatabase(join(tmp, 'orbit.db'))
  client = makeMockClient()
  engine = createSyncEngine({
    getClient: () => client,
    getDb: () => db,
    getUserId: () => 'user-1'
  })
})

afterEach(() => {
  engine?.stop()
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('createSyncEngine — push', () => {
  it('sync_queue의 upsert를 Supabase upsert로 보내고 큐에서 제거', async () => {
    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'user-1',
      'tasks',
      'upsert',
      'task-1',
      JSON.stringify({ id: 'task-1', user_id: 'user-1', title: '테스트', date: '2026-05-21' }),
      '2026-05-21T00:00:00Z'
    )

    const result = await engine.runOnce()

    expect(result.push.pushed).toBe(1)
    expect(client.calls.upserts).toHaveLength(1)
    expect(client.calls.upserts[0]).toMatchObject({
      table: 'tasks',
      payload: { id: 'task-1', title: '테스트' }
    })
    expect(db.prepare('SELECT count(*) as c FROM sync_queue').get().c).toBe(0)
  })

  it('delete op는 row_id + user_id로 Supabase에서 정확히 한 row 삭제', async () => {
    client.tables.tasks.push({ id: 'task-1', user_id: 'user-1', title: '지울 거', date: '2026-05-21' })
    client.tables.tasks.push({ id: 'task-2', user_id: 'user-2', title: '남길 거', date: '2026-05-21' })

    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('user-1', 'tasks', 'delete', 'task-1', null, '2026-05-21T00:00:00Z')

    await engine.runOnce()
    expect(client.tables.tasks.map((r) => r.id).sort()).toEqual(['task-2'])
    expect(db.prepare('SELECT count(*) as c FROM sync_queue').get().c).toBe(0)
  })

  it('push 실패 시 큐에 남고 attempts/last_error가 갱신됨', async () => {
    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'user-1',
      'tasks',
      'upsert',
      'task-1',
      JSON.stringify({ id: 'task-1', user_id: 'user-1', title: 't', date: '2026-05-21' }),
      '2026-05-21T00:00:00Z'
    )
    client.failNext({ message: 'network down' })

    await engine.runOnce()

    const row = db.prepare('SELECT * FROM sync_queue').get()
    expect(row).toBeTruthy()
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('network down')
  })

  it('attempts > 0이고 backoff 미경과 row는 건너뛴다', async () => {
    // 백오프 1번 시도 후 1초 미경과 상태 모사
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at, attempts, last_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'user-1',
      'tasks',
      'upsert',
      'task-1',
      JSON.stringify({ id: 'task-1', user_id: 'user-1', title: 't', date: '2026-05-21' }),
      '2026-05-21T00:00:00Z',
      1,
      now,
      'prev fail'
    )

    const result = await engine.runOnce()

    // 백오프 중이므로 push 시도 자체가 일어나지 않음
    expect(result.push.pushed).toBe(0)
    expect(result.push.failed).toBe(0)
    expect(client.calls.upserts).toHaveLength(0)
  })
})

describe('createSyncEngine — pull', () => {
  it('Supabase의 새 task를 로컬에 upsert', async () => {
    client.tables.tasks.push({
      id: 'remote-1',
      user_id: 'user-1',
      title: '원격 새 task',
      memo: '',
      date: '2026-05-22',
      end_date: null,
      is_completed: false,
      is_in_progress: true,
      is_starred: false,
      repeat_type: 'none',
      repeat_days: null,
      order_index: 0,
      remind_at: null,
      color: null,
      category: null,
      is_habit: false,
      start_time: null,
      end_time: null,
      is_template: false,
      parent_id: null,
      skipped_dates: null,
      rollover_source_id: null,
      rolled_at: null,
      completion_note: null,
      completed_at: null,
      created_at: '2026-05-22T00:00:00Z',
      updated_at: '2026-05-22T00:00:00Z'
    })

    await engine.runOnce()

    const local = db.prepare('SELECT * FROM tasks WHERE id = ?').get('remote-1')
    expect(local).toBeTruthy()
    expect(local.title).toBe('원격 새 task')
    expect(local.is_in_progress).toBe(1)
    expect(local.user_id).toBe('user-1')
  })

  it('LWW: 로컬 updated_at이 더 크면 remote 무시 + sync_log 기록', async () => {
    // 로컬 row가 더 최신
    db.prepare(
      `INSERT INTO tasks (id, user_id, title, date, updated_at, is_template)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).run('shared-1', 'user-1', '로컬 최신', '2026-05-22', '2026-05-22T12:00:00Z')

    client.tables.tasks.push({
      id: 'shared-1',
      user_id: 'user-1',
      title: '원격 옛것',
      date: '2026-05-22',
      updated_at: '2026-05-22T08:00:00Z',
      is_template: false
    })

    await engine.runOnce()

    const local = db.prepare('SELECT title FROM tasks WHERE id = ?').get('shared-1')
    expect(local.title).toBe('로컬 최신')

    const log = db.prepare("SELECT value FROM sync_meta WHERE key = 'sync_log:1'").get()
    expect(log).toBeTruthy()
    const parsed = JSON.parse(log.value)
    expect(parsed.kind).toBe('local_newer')
    expect(parsed.row_id).toBe('shared-1')
  })

  it('LWW: remote가 더 새로우면 로컬 덮어쓰기', async () => {
    db.prepare(
      `INSERT INTO tasks (id, user_id, title, date, updated_at, is_template)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).run('shared-2', 'user-1', '로컬 옛것', '2026-05-22', '2026-05-22T08:00:00Z')

    client.tables.tasks.push({
      id: 'shared-2',
      user_id: 'user-1',
      title: '원격 새것',
      date: '2026-05-22',
      updated_at: '2026-05-22T12:00:00Z',
      is_template: false
    })

    await engine.runOnce()

    const local = db.prepare('SELECT title FROM tasks WHERE id = ?').get('shared-2')
    expect(local.title).toBe('원격 새것')
  })

  it('last_pulled_at:<uid>:<table>이 max updated_at으로 갱신됨', async () => {
    client.tables.tasks.push({
      id: 'r1', user_id: 'user-1', title: 'a', date: '2026-05-22',
      updated_at: '2026-05-22T08:00:00Z'
    })
    client.tables.tasks.push({
      id: 'r2', user_id: 'user-1', title: 'b', date: '2026-05-22',
      updated_at: '2026-05-22T10:00:00Z'
    })

    await engine.runOnce()

    const meta = db.prepare("SELECT value FROM sync_meta WHERE key = ?").get('last_pulled_at:user-1:tasks')
    expect(meta.value).toBe('2026-05-22T10:00:00Z')

    // 두 번째 runOnce는 더 이상 가져올 게 없어야 (재호출 시 변화 없음)
    const beforeCount = db.prepare('SELECT count(*) as c FROM tasks').get().c
    await engine.runOnce()
    const afterCount = db.prepare('SELECT count(*) as c FROM tasks').get().c
    expect(afterCount).toBe(beforeCount)
  })

  it('다른 user의 row는 pull하지 않음 (RLS와 별개로 클라이언트 필터)', async () => {
    client.tables.tasks.push({
      id: 'other', user_id: 'user-2', title: '남의 것', date: '2026-05-22',
      updated_at: '2026-05-22T10:00:00Z'
    })

    await engine.runOnce()

    expect(db.prepare('SELECT count(*) as c FROM tasks').get().c).toBe(0)
  })
})

describe('createSyncEngine — composite PK tables', () => {
  it('monthly_goals upsert (user_id, ym) on conflict', async () => {
    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'user-1', 'monthly_goals', 'upsert', 'user-1|2026-05',
      JSON.stringify({ user_id: 'user-1', ym: '2026-05', text: '월간 목표', updated_at: '2026-05-21T00:00:00Z' }),
      '2026-05-21T00:00:00Z'
    )

    await engine.runOnce()

    expect(client.tables.monthly_goals).toHaveLength(1)
    expect(client.tables.monthly_goals[0]).toMatchObject({ user_id: 'user-1', ym: '2026-05', text: '월간 목표' })
  })

  it('see_memos pull → 로컬에 LWW 적용', async () => {
    client.tables.see_memos.push({
      user_id: 'user-1', date: '2026-05-21',
      good: '잘한 점', bad: '못한 점', next: '다음에',
      updated_at: '2026-05-21T12:00:00Z'
    })

    await engine.runOnce()

    const row = db.prepare('SELECT * FROM see_memos WHERE user_id = ? AND date = ?').get('user-1', '2026-05-21')
    expect(row).toBeTruthy()
    expect(row.good).toBe('잘한 점')
    expect(row.bad).toBe('못한 점')
  })
})

describe('createSyncEngine — lifecycle', () => {
  it('비로그인(uid=null)이면 runOnce는 skip', async () => {
    const offlineEngine = createSyncEngine({
      getClient: () => client,
      getDb: () => db,
      getUserId: () => null
    })
    const result = await offlineEngine.runOnce()
    expect(result.skipped).toBe(true)
  })

  it('start() → setInterval, stop() → clearInterval', () => {
    vi.useFakeTimers()
    const e = createSyncEngine({
      getClient: () => client,
      getDb: () => db,
      getUserId: () => 'user-1',
      intervalMs: 1000
    })
    e.start()
    // start() 즉시 호출 + setInterval 등록 확인
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    e.stop()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('getStatus는 큐 길이와 lastSyncedAt을 반환', async () => {
    db.prepare(
      `INSERT INTO sync_queue (user_id, table_name, op, row_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'user-1', 'tasks', 'upsert', 'task-1',
      JSON.stringify({ id: 'task-1', user_id: 'user-1', title: 't', date: '2026-05-21' }),
      '2026-05-21T00:00:00Z'
    )

    expect(engine.getStatus().queueLength).toBe(1)
    expect(engine.getStatus().lastSyncedAt).toBeNull()

    await engine.runOnce()

    expect(engine.getStatus().queueLength).toBe(0)
    expect(engine.getStatus().lastSyncedAt).toBeTruthy()
  })

  it('onChange listener는 push/pull 전후로 호출됨', async () => {
    const events = []
    engine.onChange((s) => events.push({ ...s }))
    await engine.runOnce()
    // 최소 시작/종료 두 번 emit
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[events.length - 1].running).toBe(false)
  })
})

describe('createSyncEngine — internals', () => {
  it('backoffMsFor — 1회 1s, 2회 2s, 5회 16s, 무한대 → 30분 상한', () => {
    expect(__internals.backoffMsFor(0)).toBe(0)
    expect(__internals.backoffMsFor(1)).toBe(1000)
    expect(__internals.backoffMsFor(2)).toBe(2000)
    expect(__internals.backoffMsFor(5)).toBe(16000)
    expect(__internals.backoffMsFor(100)).toBe(30 * 60 * 1000)
  })

  it('localShouldWin — 로컬이 더 크면 true', () => {
    expect(__internals.localShouldWin('2026-05-22T12:00:00Z', '2026-05-22T08:00:00Z')).toBe(true)
    expect(__internals.localShouldWin('2026-05-22T08:00:00Z', '2026-05-22T12:00:00Z')).toBe(false)
    expect(__internals.localShouldWin(null, '2026-05-22T12:00:00Z')).toBe(false)
    expect(__internals.localShouldWin('2026-05-22T12:00:00Z', null)).toBe(true)
  })

  it('remoteTaskToLocalCols — boolean → 0/1, array → JSON string', () => {
    const cols = __internals.remoteTaskToLocalCols({
      id: 't1',
      user_id: 'u1',
      title: 'x',
      date: '2026-05-21',
      is_completed: true,
      is_in_progress: false,
      repeat_days: [1, 2, 3],
      skipped_dates: ['2026-05-20']
    })
    expect(cols.is_completed).toBe(1)
    expect(cols.is_in_progress).toBe(0)
    expect(cols.repeat_days).toBe('[1,2,3]')
    expect(cols.skipped_dates).toBe('["2026-05-20"]')
  })

  it('onConflictFor — 테이블별 PK 형태', () => {
    expect(__internals.onConflictFor('tasks')).toBe('id')
    expect(__internals.onConflictFor('categories')).toBe('user_id,id')
    expect(__internals.onConflictFor('monthly_goals')).toBe('user_id,ym')
    expect(__internals.onConflictFor('see_memos')).toBe('user_id,date')
  })
})
