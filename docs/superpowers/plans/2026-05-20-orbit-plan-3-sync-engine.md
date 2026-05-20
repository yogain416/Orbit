# Orbit Phase 1 — Plan 3: Sync engine (Local SQLite ↔ Supabase)

**Goal:** v1.7.x까지의 Orbit은 로컬 SQLite + 로그인만 가능. Plan 3는 사용자 데이터(tasks/categories/monthly_goals/see_memos)를 Supabase로 양방향 동기화. 끝나면 사용자가 같은 계정으로 다른 PC에서도 같은 데이터를 봄. 출시 버전 v1.8.0.

**Branch:** `feat/orbit-plan-3-sync`
**Base:** `master` (v1.7.4 시점)
**Target Version:** v1.8.0

---

## 핵심 아키텍처 결정 (spec §2, §4, §6 기반)

| 결정 | 내용 | 이유 |
|---|---|---|
| **로컬 SQLite를 source of truth로 유지** | 로컬 캐시가 아니라 평등한 sync 대상 | 오프라인 모드 + 빠른 첫 화면 |
| **last-write-wins** by `updated_at` | 충돌 시 timestamp 큰 쪽 승리. `sync_log` 테이블에 기록 | 단순. Phase 3 팀 도입 시 재검토 |
| **sync_queue** 로컬 테이블 | 모든 mutation이 큐에 적재되고 백그라운드 워커가 push | 오프라인 → 회복 시 자동 재시도, optimistic UI |
| **Realtime은 안 씀** | 폴링(30초) 또는 push trigger 후 manual pull | Plan 1은 1인용이라 실시간 우선순위 낮음. 단순함 우선 |
| **user_id 컬럼 도입** | 로컬 SQLite에도 user_id 추가 → 멀티 계정 분리 + Supabase row 필터링 | 로그아웃 후 다른 계정 들어가도 데이터 섞이지 않음 |
| **id 형식: text UUID** | 로컬에서 generateId() 대신 crypto.randomUUID()로 변경 | Supabase의 uuid pk와 호환 |

---

## File Structure

| 파일 | 역할 | 변경 종류 |
|---|---|---|
| `docs/supabase/2026-05-2X-sync-tables.sql` | Supabase 테이블 + RLS + 트리거 | 신규 (사용자 콘솔 작업) |
| `todostick/src/main/sqlite.js` | schema v2→v3: user_id 컬럼, sync_queue 테이블 | 수정 |
| `todostick/src/main/database.js` | 모든 mutation이 user_id + sync_queue enqueue | 수정 (큰 변경) |
| `todostick/src/main/sync.js` | sync 워커: push/pull/backoff/충돌해결 | 신규 |
| `todostick/src/main/sync.test.js` | sync 단위 테스트 (Supabase mock) | 신규 |
| `todostick/src/main/index.js` | sync 워커 시작/중단 (auth 상태 hook) | 수정 |
| `todostick/src/preload/index.js` | sync 상태 API (마지막 sync 시각, 큐 길이) 노출 | 수정 |
| `todostick/src/renderer/src/components/SyncStatusBadge.jsx` | 헤더에 작은 sync 상태 표시 | 신규 |

---

## Task 1: Supabase 스키마 + RLS (사용자 콘솔 작업)

**Files:**
- Create: `docs/supabase/2026-05-2X-sync-tables.sql`

스키마 핵심:
- 모든 데이터 테이블에 `user_id uuid references profiles(id) on delete cascade`
- `id`는 text (로컬 SQLite와 일치, 또는 uuid로 통일)
- `updated_at timestamptz default now()` — 충돌 해결용
- RLS: `using (auth.uid() = user_id)` (select/insert/update/delete 4종)
- `updated_at` 자동 갱신 트리거 (`before update`로)

테이블:
- `tasks` (spec §3.1 그대로 + user_id)
- `categories`
- `monthly_goals` (user_id + ym 복합 PK)
- `see_memos` (user_id + date 복합 PK)

`settings`는 사용자별 PC 설정 (shortcuts, memo)이라 local-only로 둠.

**검증:**
- Supabase 콘솔 SQL Editor에 복붙 실행
- Table editor에서 4개 테이블 + RLS 활성화 확인

---

## Task 2: 로컬 SQLite 스키마 v2→v3 (user_id + sync_queue)

**Files:**
- Modify: `todostick/src/main/sqlite.js`
- Modify: `todostick/src/main/sqlite.test.js`

핵심:
- SCHEMA_VERSION = 3
- ALTER TABLE tasks/categories/monthly_goals/see_memos ADD COLUMN user_id TEXT
- `CREATE TABLE sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, table_name TEXT, op TEXT, row_id TEXT, payload TEXT, attempts INTEGER DEFAULT 0, last_attempt_at TEXT, last_error TEXT, created_at TEXT)`
- `CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT)` — last_pulled_at 등
- `applyMigrations`에 v3 단계 추가

**검증:** sqlite.test.js의 'tasks 테이블에 user_id 컬럼 존재' + 'sync_queue 테이블 존재' 테스트.

---

## Task 3: database.js의 모든 mutation이 user_id + sync_queue enqueue

**Files:**
- Modify: `todostick/src/main/database.js`
- Modify: `todostick/src/main/database.test.js`

기존 mutation 메서드(`createTask`, `updateTask`, `deleteTask`, `toggleTask`, `setInProgress`, `setStarred`, `setCategories`, `setMonthlyGoal`, `setSeeMemo`, `reorderTasks`, `rolloverTasks`, `autoRolloverOverdue`, `deleteTaskAndFuture`, `toggleHabitOnDate`)을 모두:
1. 현재 `user_id`를 받는 형태로 변경 — main에서 auth.getUser().id를 주입
2. INSERT/UPDATE/DELETE 후 sync_queue에 변경 이벤트 enqueue (같은 트랜잭션)
3. 읽기 메서드(`getTasksByDate` 등)도 user_id 필터링 추가

큰 변경. 한 번에 다 하지 말고 메서드 그룹별로 sub-step.

**검증:** 각 mutation 후 sync_queue에 적절한 row가 들어갔는지 단위 테스트.

---

## Task 4: sync.js 워커 모듈

**Files:**
- Create: `todostick/src/main/sync.js`
- Create: `todostick/src/main/sync.test.js`

핵심 API:
- `createSyncEngine({ getClient, getDb, userId })` — DI 가능한 팩토리
- `engine.start()` — 30초 주기 워커 시작
- `engine.stop()` — 워커 중단 (로그아웃 시)
- `engine.runOnce()` — 즉시 1회 push + pull
- `engine.getStatus()` — { queueLength, lastSyncedAt, error }

워커 로직:
1. **Push**: sync_queue에서 row 가져와 Supabase에 upsert/delete
   - 성공: queue에서 제거
   - 실패: attempts++, last_error 기록, 백오프 (1s → 2s → 4s ... → 30분 상한)
2. **Pull**: Supabase에서 `updated_at > last_pulled_at`인 row 가져옴
   - 로컬에 upsert (단, 로컬 updated_at이 더 크면 skip = last-write-wins)
   - last_pulled_at 갱신
3. 충돌 시 sync_meta의 `sync_log:N`에 기록 (사용자 알림은 Phase 2 가능성)

**검증:** Supabase 클라이언트 mock으로 push/pull/conflict/backoff 시나리오 각각 단위 테스트.

---

## Task 5: 로그인 직후 초기 sync (기존 로컬 데이터 → Supabase)

**Files:**
- Modify: `todostick/src/main/sync.js` (메서드 추가)
- Modify: `todostick/src/main/index.js` (인증 hook에서 호출)

핵심:
- 처음 로그인한 user가 Supabase에 데이터가 없으면 → 로컬 SQLite 전체를 batch upsert
- 이전부터 로그인된 user면 → pull로 시작
- `sync_meta`의 `initial_sync_done_for_user:<userId>` 플래그로 멱등

**검증:** 로컬에 task 만들고 로그인 → Supabase에 그대로 들어왔는지 (수동 검증).

---

## Task 6: main/index.js 인증 hook + sync 워커 라이프사이클

**Files:**
- Modify: `todostick/src/main/index.js`
- Modify: `todostick/src/preload/index.js`

핵심:
- `refreshUserWindows()` 흐름에 `engine.start() / stop()` 추가
  - 로그인 → engine.start()
  - 로그아웃 → engine.stop() + (선택) 로컬 데이터 삭제? 또는 user_id별 분리 유지
- IPC `sync:status` — 현재 큐 길이/마지막 sync 시각 반환
- preload `window.api.sync.status()`, `window.api.sync.onChange(cb)` 노출

---

## Task 7: SyncStatusBadge UI

**Files:**
- Create: `todostick/src/renderer/src/components/SyncStatusBadge.jsx`
- Modify: `todostick/src/renderer/src/App.jsx`

핵심:
- 헤더 우측 UserMenu 옆에 작은 점/스피너
- 상태:
  - 🟢 동기화됨
  - 🔵 동기화 중 (스피너)
  - 🟡 오프라인 (큐만 쌓임)
  - 🔴 에러 (마지막 에러 메시지 hover로)
- 클릭 시 마지막 sync 시각 + "지금 동기화" 버튼

---

## Task 8: v1.8.0 출시

- version bump 1.7.4 → 1.8.0
- 빌드 + 패키지
- tag v1.8.0
- 사용자 검증: 2개 PC에 깔고 한쪽에서 task 만들어서 다른 쪽에 자동 반영되는지 확인 (가장 큰 가치)

---

## 알려진 위험

1. **id 형식 충돌**: 기존 로컬 SQLite의 task id는 `Date.now() + random base36` 같은 형식. Supabase의 uuid pk와 호환 안 됨 → Task 3에서 마이그레이션 시 id를 uuid로 변환하거나 Supabase 컬럼을 text로 둘지 결정 필요.
2. **이미 로컬에 쌓인 v1.7.x 데이터의 user_id**: 컬럼 추가 시 NULL → 첫 로그인 시 일괄 UPDATE로 user_id 채워야. (사용자 직접 한 명만 쓴 상태라면 안전)
3. **sync_queue 무한 적재**: 인터넷 끊김 + 잦은 편집 → 큐 비대 → 회복 시 push 폭주. Rate limiter 필요.
4. **충돌 알림 부재**: last-write-wins이라 사용자 데이터가 silently 덮어쓰여질 수 있음. v1.8.0은 sync_log만 두고 알림은 후속.
5. **PC 시계 어긋남**: updated_at이 PC 로컬 시각 기반 → 시계 어긋난 PC가 시간 미래로 가있으면 항상 이김. Supabase 측 updated_at 사용으로 회피 가능.

---

## 진입점 (다음 세션에서)

1. Task 1의 SQL 파일 먼저 작성 → 사용자가 콘솔에서 실행
2. Task 2 로컬 스키마 마이그레이션 (TDD)
3. Task 3 mutation에 user_id + queue enqueue (가장 큰 작업, 메서드 그룹별로 분해)
4. Task 4 sync 워커 (mock 테스트 위주)
5. Task 5~7 통합 + UI
6. Task 8 출시 + 사용자 검증
