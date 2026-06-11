// Orbit Phase 1 — Plan 3 (Sync engine, v1.8.0)
//
// SQLite ↔ Supabase 양방향 동기화 워커.
//
// 모든 mutation은 database.js에서 sync_queue로 적재됨 (Task 3).
// 이 워커는:
//   1) push: sync_queue의 row를 Supabase로 보내고, 성공 시 큐에서 제거
//   2) pull: sync_meta의 last_pulled_at:<uid>:<table>보다 새로운 row를 Supabase에서 받아
//      LWW(updated_at 비교)로 로컬에 반영. 로컬이 더 새면 sync_log에 conflict 기록만.
//
// 워커는 createSyncEngine() 팩토리로 DI 가능 — 테스트에선 Supabase 클라이언트를 mock.
//
// 충돌 정책: last-write-wins by updated_at (timestamp 큰 쪽 승).
// PC 시계 어긋남 위험은 spec §위험 #5 — Supabase 측 set_updated_at 트리거로 일부 회피.

const TABLES = ['tasks', 'categories', 'monthly_goals', 'see_memos']
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30 * 60 * 1000 // 30분 상한
const DEFAULT_INTERVAL_MS = 30_000
const PUSH_BATCH_LIMIT = 100
const PULL_BATCH_LIMIT = 500

// Supabase upsert 시 conflict target — 테이블별 PK 형태.
function onConflictFor(table) {
  if (table === 'tasks') return 'id'
  if (table === 'categories') return 'user_id,id'
  if (table === 'monthly_goals') return 'user_id,ym'
  if (table === 'see_memos') return 'user_id,date'
  return undefined
}

// 백오프 시간(ms) — attempts 회 실패한 row를 다음 시도 전까지 잠시 둔다.
function backoffMsFor(attempts) {
  if (attempts <= 0) return 0
  const exp = BACKOFF_BASE_MS * Math.pow(2, attempts - 1)
  return Math.min(BACKOFF_MAX_MS, exp)
}

// sync_queue payload(JSON 문자열로 저장됨) → JS object. 부적합한 row는 throw.
function parsePayload(raw) {
  if (!raw) return null
  if (typeof raw !== 'string') return raw
  return JSON.parse(raw)
}

// Supabase tasks 응답 → 로컬 SQLite 컬럼 값 매핑 (boolean → 0/1, array → JSON 문자열).
function remoteTaskToLocalCols(remote) {
  return {
    id: remote.id,
    user_id: remote.user_id ?? null,
    title: remote.title ?? '',
    memo: remote.memo ?? '',
    date: remote.date,
    end_date: remote.end_date ?? null,
    is_completed: remote.is_completed ? 1 : 0,
    is_in_progress: remote.is_in_progress ? 1 : 0,
    is_starred: remote.is_starred ? 1 : 0,
    repeat_type: remote.repeat_type ?? 'none',
    repeat_days: remote.repeat_days != null ? JSON.stringify(remote.repeat_days) : null,
    order_index: remote.order_index ?? 0,
    remind_at: remote.remind_at ?? null,
    color: remote.color ?? null,
    category: remote.category ?? null,
    is_habit: remote.is_habit ? 1 : 0,
    start_time: remote.start_time ?? null,
    end_time: remote.end_time ?? null,
    is_template: remote.is_template ? 1 : 0,
    parent_id: remote.parent_id ?? null,
    skipped_dates: remote.skipped_dates != null ? JSON.stringify(remote.skipped_dates) : null,
    rollover_source_id: remote.rollover_source_id ?? null,
    rolled_at: remote.rolled_at ?? null,
    completion_note: remote.completion_note ?? null,
    completed_at: remote.completed_at ?? null,
    created_at: remote.created_at ?? null,
    updated_at: remote.updated_at ?? null
  }
}

// LWW 비교: 로컬 updated_at이 remote보다 strictly 더 크면 remote 무시.
// 같거나 더 작으면 remote 적용. updated_at이 NULL이면 remote 승 (로컬에 없는 row).
function localShouldWin(localUpdatedAt, remoteUpdatedAt) {
  if (!localUpdatedAt) return false
  if (!remoteUpdatedAt) return true
  return localUpdatedAt > remoteUpdatedAt
}

// 충돌 기록 — sync_meta의 'sync_log:seq' 카운터 + sync_log:<N> 항목.
function logConflict(db, table, rowId, kind, localTs, remoteTs) {
  const seqRow = db.prepare(`SELECT value FROM sync_meta WHERE key = 'sync_log:seq'`).get()
  const seq = (seqRow ? parseInt(seqRow.value, 10) || 0 : 0) + 1
  const upsertMeta = db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  upsertMeta.run('sync_log:seq', String(seq))
  upsertMeta.run(
    `sync_log:${seq}`,
    JSON.stringify({
      at: new Date().toISOString(),
      table,
      row_id: rowId,
      kind,
      local_updated_at: localTs || null,
      remote_updated_at: remoteTs || null
    })
  )
}

// remote row 한 건을 로컬에 반영. 트랜잭션 밖에서 호출되어도 안전하지만,
// pull()이 테이블당 한 트랜잭션으로 감싼다.
function applyRemoteRow(db, table, remote) {
  if (table === 'tasks') {
    const local = db.prepare('SELECT updated_at FROM tasks WHERE id = ?').get(remote.id)
    if (local && localShouldWin(local.updated_at, remote.updated_at)) {
      logConflict(db, table, remote.id, 'local_newer', local.updated_at, remote.updated_at)
      return
    }
    const cols = remoteTaskToLocalCols(remote)
    const keys = Object.keys(cols)
    const placeholders = keys.map(() => '?').join(',')
    const updateClause = keys.filter((k) => k !== 'id').map((k) => `${k}=excluded.${k}`).join(',')
    db.prepare(
      `INSERT INTO tasks (${keys.join(',')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updateClause}`
    ).run(...keys.map((k) => cols[k]))
    return
  }

  if (table === 'categories') {
    // categories는 로컬에 updated_at 컬럼이 없어서 LWW 불가 — remote가 항상 승.
    const local = db
      .prepare('SELECT id FROM categories WHERE id = ? AND user_id IS ?')
      .get(remote.id, remote.user_id)
    if (local) {
      db.prepare(
        `UPDATE categories SET label = ?, color = ? WHERE id = ? AND user_id IS ?`
      ).run(remote.label ?? '', remote.color ?? null, remote.id, remote.user_id)
    } else {
      db.prepare(
        `INSERT INTO categories (id, user_id, label, color) VALUES (?, ?, ?, ?)`
      ).run(remote.id, remote.user_id, remote.label ?? '', remote.color ?? null)
    }
    return
  }

  if (table === 'monthly_goals') {
    const local = db
      .prepare('SELECT updated_at FROM monthly_goals WHERE user_id IS ? AND ym = ?')
      .get(remote.user_id, remote.ym)
    if (local && localShouldWin(local.updated_at, remote.updated_at)) {
      logConflict(db, table, `${remote.user_id}|${remote.ym}`, 'local_newer', local.updated_at, remote.updated_at)
      return
    }
    if (local) {
      db.prepare(
        `UPDATE monthly_goals SET text = ?, updated_at = ? WHERE user_id IS ? AND ym = ?`
      ).run(remote.text ?? '', remote.updated_at ?? null, remote.user_id, remote.ym)
    } else {
      db.prepare(
        `INSERT INTO monthly_goals (user_id, ym, text, updated_at) VALUES (?, ?, ?, ?)`
      ).run(remote.user_id, remote.ym, remote.text ?? '', remote.updated_at ?? null)
    }
    return
  }

  if (table === 'see_memos') {
    const local = db
      .prepare('SELECT updated_at FROM see_memos WHERE user_id IS ? AND date = ?')
      .get(remote.user_id, remote.date)
    if (local && localShouldWin(local.updated_at, remote.updated_at)) {
      logConflict(db, table, `${remote.user_id}|${remote.date}`, 'local_newer', local.updated_at, remote.updated_at)
      return
    }
    if (local) {
      db.prepare(
        `UPDATE see_memos SET good = ?, bad = ?, next = ?, updated_at = ? WHERE user_id IS ? AND date = ?`
      ).run(remote.good ?? '', remote.bad ?? '', remote.next ?? '', remote.updated_at ?? null, remote.user_id, remote.date)
    } else {
      db.prepare(
        `INSERT INTO see_memos (user_id, date, good, bad, next, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(remote.user_id, remote.date, remote.good ?? '', remote.bad ?? '', remote.next ?? '', remote.updated_at ?? null)
    }
  }
}

// Supabase 측 delete — row_id와 uid로 정확히 한 row만 지운다.
async function deleteRemote(client, table, rowId, uid) {
  if (table === 'tasks') {
    const { error } = await client.from('tasks').delete().eq('id', rowId).eq('user_id', uid)
    if (error) throw error
    return
  }
  if (table === 'categories') {
    const { error } = await client.from('categories').delete().eq('id', rowId).eq('user_id', uid)
    if (error) throw error
    return
  }
  if (table === 'monthly_goals') {
    const ym = rowId.includes('|') ? rowId.split('|')[1] : rowId
    const { error } = await client.from('monthly_goals').delete().eq('user_id', uid).eq('ym', ym)
    if (error) throw error
    return
  }
  if (table === 'see_memos') {
    const date = rowId.includes('|') ? rowId.split('|')[1] : rowId
    const { error } = await client.from('see_memos').delete().eq('user_id', uid).eq('date', date)
    if (error) throw error
  }
}

// 한 row push → 성공이면 sync_queue에서 제거, 실패면 attempts++ 백오프 기록.
async function pushOneRow(client, db, row) {
  const now = new Date().toISOString()
  try {
    if (row.op === 'upsert') {
      const payload = parsePayload(row.payload)
      if (!payload) throw new Error('upsert payload empty')
      // 로컬 전용 컬럼 — Supabase tasks 테이블엔 없으므로 push 전에 제거(없는 컬럼 업서트 에러 방지).
      if (row.table_name === 'tasks' && payload && 'weekly_goal' in payload) {
        delete payload.weekly_goal
      }
      const onConflict = onConflictFor(row.table_name)
      const { error } = await client
        .from(row.table_name)
        .upsert(payload, onConflict ? { onConflict } : {})
      if (error) throw error
    } else if (row.op === 'delete') {
      await deleteRemote(client, row.table_name, row.row_id, row.user_id)
    } else {
      throw new Error(`unknown op: ${row.op}`)
    }
    db.prepare('DELETE FROM sync_queue WHERE id = ?').run(row.id)
    return { ok: true }
  } catch (e) {
    const msg = String(e?.message || e)
    db.prepare(
      `UPDATE sync_queue SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE id = ?`
    ).run(now, msg, row.id)
    return { ok: false, error: msg }
  }
}

// 큐를 한 번 훑어서 push 가능한 row를 처리. 같은 row_id의 후속 변경 순서는 id ASC로 보존.
async function pushOnce(client, db, uid) {
  const rows = db
    .prepare(`SELECT * FROM sync_queue WHERE user_id = ? ORDER BY id ASC LIMIT ?`)
    .all(uid, PUSH_BATCH_LIMIT)
  let pushed = 0
  let failed = 0
  let lastError = null
  for (const row of rows) {
    if (row.attempts > 0 && row.last_attempt_at) {
      const delay = backoffMsFor(row.attempts)
      const lastMs = new Date(row.last_attempt_at).getTime()
      if (Number.isFinite(lastMs) && Date.now() < lastMs + delay) continue
    }
    const result = await pushOneRow(client, db, row)
    if (result.ok) {
      pushed++
    } else {
      failed++
      lastError = result.error
    }
  }
  return { pushed, failed, lastError }
}

// 한 테이블 pull. last_pulled_at:<uid>:<table> 기준으로 증분.
async function pullTable(client, db, uid, table) {
  const metaKey = `last_pulled_at:${uid}:${table}`
  const lastRow = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(metaKey)
  const last = lastRow?.value || '1970-01-01T00:00:00Z'

  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('user_id', uid)
    .gt('updated_at', last)
    .order('updated_at', { ascending: true })
    .limit(PULL_BATCH_LIMIT)

  if (error) throw error
  if (!data || data.length === 0) return { applied: 0 }

  let maxUpdatedAt = last
  db.transaction(() => {
    for (const remote of data) {
      applyRemoteRow(db, table, remote)
      if (remote.updated_at && remote.updated_at > maxUpdatedAt) {
        maxUpdatedAt = remote.updated_at
      }
    }
    db.prepare(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(metaKey, maxUpdatedAt)
  })()
  return { applied: data.length }
}

async function pullOnce(client, db, uid) {
  let totalApplied = 0
  for (const table of TABLES) {
    const result = await pullTable(client, db, uid, table)
    totalApplied += result.applied
  }
  return { applied: totalApplied }
}

// sync_queue의 현재 user 큐 길이 (UI 표시용).
function countQueue(db, uid) {
  if (!uid) return 0
  return db.prepare('SELECT count(*) as c FROM sync_queue WHERE user_id = ?').get(uid).c
}

// 워커 팩토리 — getClient/getDb/getUserId DI로 production과 test 모두 커버.
export function createSyncEngine({ getClient, getDb, getUserId, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (typeof getClient !== 'function') throw new Error('createSyncEngine requires getClient')
  if (typeof getDb !== 'function') throw new Error('createSyncEngine requires getDb')
  if (typeof getUserId !== 'function') throw new Error('createSyncEngine requires getUserId')

  let timer = null
  let running = false
  // listeners에 status snapshot을 broadcast — UI badge가 구독.
  const listeners = new Set()
  const status = {
    queueLength: 0,
    lastSyncedAt: null,
    lastError: null,
    running: false
  }

  function snapshot() {
    return {
      queueLength: countQueue(getDb(), getUserId()),
      lastSyncedAt: status.lastSyncedAt,
      lastError: status.lastError,
      running
    }
  }

  function emit() {
    const snap = snapshot()
    for (const cb of listeners) {
      try {
        cb(snap)
      } catch {
        // listener 오류는 무시 — 다른 listener에 영향 주지 않게.
      }
    }
  }

  async function runOnce() {
    const uid = getUserId()
    if (!uid) return { skipped: true }
    if (running) return { skipped: true, reason: 'already_running' }
    running = true
    status.running = true
    status.lastError = null
    emit()

    const db = getDb()
    const client = getClient()
    let pushResult = { pushed: 0, failed: 0 }
    let pullResult = { applied: 0 }
    try {
      pushResult = await pushOnce(client, db, uid)
      pullResult = await pullOnce(client, db, uid)
      status.lastSyncedAt = new Date().toISOString()
      if (pushResult.lastError) status.lastError = pushResult.lastError
    } catch (e) {
      status.lastError = String(e?.message || e)
    } finally {
      running = false
      status.running = false
      emit()
    }
    return { push: pushResult, pull: pullResult, error: status.lastError }
  }

  function start() {
    if (timer) return
    // 시작 즉시 1회 실행 + interval.
    runOnce().catch(() => {})
    timer = setInterval(() => {
      runOnce().catch(() => {})
    }, intervalMs)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    running = false
    status.running = false
    emit()
  }

  function getStatus() {
    return snapshot()
  }

  function onChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  return {
    start,
    stop,
    runOnce,
    getStatus,
    onChange,
    // 테스트/디버그용 내부 노출
    __push: () => pushOnce(getClient(), getDb(), getUserId()),
    __pull: () => pullOnce(getClient(), getDb(), getUserId())
  }
}

// 테스트에서 사용 — 내부 헬퍼들을 export.
export const __internals = {
  backoffMsFor,
  remoteTaskToLocalCols,
  localShouldWin,
  applyRemoteRow,
  onConflictFor,
  TABLES
}
