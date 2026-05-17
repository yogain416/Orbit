# Orbit — Phase 1 설계 문서

> 작성일: 2026-05-17 | 버전: v0.1 | 상태: 검토 중
>
> 대상 범위: **개인 — PC ↔ Supabase ↔ Google Calendar/Tasks 양방향 sync**

---

## 0. 한 줄 요약

기존 TodoStick(Electron 로컬 앱)을 **Orbit**으로 리브랜딩하면서 **Supabase 백엔드 + Google Calendar/Tasks 양방향 sync**를 붙인다. 사용자는 폰에서 **Google 자체 앱**으로 PC와 동일한 일정/할일을 보고 편집할 수 있다. 자체 모바일 앱은 Phase 2.

---

## 1. 범위 (Scope)

### 1.1 포함

| 카테고리 | 항목 |
|---|---|
| 백엔드 | 로컬 JSON → Supabase Postgres 이전 |
| 인증 | Google OAuth (Supabase Auth 경유) |
| 오프라인 | 로컬 캐시(SQLite) + 자동 sync |
| Google sync | Calendar 일정 ↔ TodoStick 일정 (양방향) |
| Google sync | Google Tasks ↔ TodoStick 할일 (양방향) — *주1* |
| 기존 기능 유지 | 일별·주별·월별·타임블록·습관·리뷰·기록·스티커·플래너 풀 |
| 버그 수정 | **이월(carry-over) — 일별 뷰에서 어제 미완료가 안 뜨는 문제** |
| 브랜딩 | TodoStick → Orbit (창제목/아이콘/패키지명) |
| 코드 정리 | `team-store.js`, `MeetingsView`, `ProjectsView`, `SupportProgramsView`, `TeamDashboardView`, `TeamScheduleView`, `team-view-utils.js`, `team-store.test.js` 삭제 + 관련 import/IPC 제거 |

**주1**: Google "Reminders"는 2023년 Google Tasks에 통합됐다. 이 문서에서 말하는 "리마인더 sync"는 Google Tasks API로 구현한다.

### 1.2 명시적 제외

- ❌ 자체 모바일 앱 → Phase 2
- ❌ 팀/멤버/공유/로그인 — 개인용만 → Phase 3
- ❌ 프로젝트/태스크 관리 → Phase 4
- ❌ 지원사업 → Phase 5
- ❌ 회의록 (실시간 협업 포함) → Phase 6
- ❌ 주/월 목표 트래킹 (멤버별) → Phase 7

기존 `orbit` 브랜치의 Tiptap WYSIWYG 회의록·프로젝트 시스템 코드는 **현 시점에서 머지하지 않음**. Phase 4~6에서 참고용 자산으로 보존.

---

## 2. 아키텍처

```
   ┌─────────────────────────────────────────────────┐
   │                  PC 앱 (Electron)               │
   │  ┌──────────────────────────────────────────┐  │
   │  │ Renderer (React) — 기존 뷰 유지            │  │
   │  └──────────────────────────────────────────┘  │
   │  ┌──────────────────────────────────────────┐  │
   │  │ Main process                             │  │
   │  │  ├ Local cache (SQLite, better-sqlite3)   │  │
   │  │  ├ Sync engine (큐 + 워커)                │  │
   │  │  ├ Supabase client                        │  │
   │  │  └ Google API client (calendar/tasks)     │  │
   │  └──────────────────────────────────────────┘  │
   └────────────┬──────────────────┬─────────────────┘
                │                  │
       Supabase JS SDK        Google API (직접)
                │                  │
                ▼                  ▼
   ┌────────────────────┐   ┌──────────────────────┐
   │     Supabase       │   │  Google Calendar +   │
   │  - Auth (Google)   │   │  Google Tasks        │
   │  - Postgres DB     │   │                      │
   │  - Realtime        │   └──────────────────────┘
   └────────────────────┘
```

### 핵심 아키텍처 결정

| 결정 | 내용 | 이유 |
|---|---|---|
| **로컬 캐시 유지** | SQLite로 모든 데이터 로컬에 복제 | 오프라인 모드, 빠른 첫 화면 |
| **PC가 Google 직접 호출** | Supabase 우회, OAuth 토큰은 OS 보안 저장소 | 보안↑, Edge Function 운영 부담↓ |
| **Optimistic UI** | UI는 로컬 캐시 즉시 반영, sync는 백그라운드 | 체감 속도 |
| **last-write-wins + updated_at** | 충돌 시 timestamp 큰 쪽 승리 | 단순. Phase 3 팀 도입 시 재검토 |
| **JSON → SQLite 변환** | 마이그레이션 시 한 번 변환 | 성능, 트랜잭션 안전성 |

---

## 3. 데이터 모델

### 3.1 Supabase 테이블

#### `profiles`
```sql
id uuid primary key references auth.users(id),
email text,
display_name text,
google_calendar_id text,        -- primary calendar id
google_tasklist_id text,        -- primary tasklist id
created_at timestamptz default now()
```

#### `tasks` (기존 TodoStick task 그대로)
```sql
id uuid primary key default gen_random_uuid(),
user_id uuid references profiles(id) on delete cascade,
title text not null,
memo text default '',
date text not null,              -- 'YYYY-MM-DD' or 'M:YYYY-MM' or 'W:YYYY-MM-DD'
end_date text,                   -- 다일 이벤트
is_completed boolean default false,
is_in_progress boolean default false,
is_starred boolean default false,
repeat_type text default 'none', -- 'none' | 'daily' | 'weekly' | 'monthly'
repeat_days int[],
order_index int default 0,
remind_at timestamptz,
color text,
category text,
is_habit boolean default false,
start_time text,
end_time text,
is_template boolean default false,
parent_id uuid references tasks(id),
skipped_dates text[],
rollover_source_id uuid references tasks(id),
completion_note text,
completed_at timestamptz,
created_at timestamptz default now(),
updated_at timestamptz default now()
```

#### `categories`
```sql
id text,                         -- 'work', 'personal' 등 user-defined
user_id uuid references profiles(id) on delete cascade,
label text not null,
color text,
primary key (id, user_id)
```

#### `monthly_goals`
```sql
user_id uuid references profiles(id) on delete cascade,
ym text not null,                -- 'YYYY-MM'
text text default '',
updated_at timestamptz default now(),
primary key (user_id, ym)
```

#### `daily_reviews` (PDS See 회고)
```sql
user_id uuid references profiles(id) on delete cascade,
date text not null,              -- 'YYYY-MM-DD'
good text default '',
bad text default '',
next text default '',
updated_at timestamptz default now(),
primary key (user_id, date)
```

#### `google_sync_map`
```sql
user_id uuid references profiles(id) on delete cascade,
task_id uuid references tasks(id) on delete cascade,
google_event_id text,            -- 일정인 경우
google_task_id text,             -- 할일인 경우
last_synced_at timestamptz,
primary key (user_id, task_id)
```

#### `sync_log`
```sql
id bigserial primary key,
user_id uuid references profiles(id) on delete cascade,
direction text,                  -- 'push_supabase' | 'pull_supabase' | 'push_google' | 'pull_google'
target text,                     -- 'tasks' | 'google_calendar' | 'google_tasks'
ok boolean,
error text,
created_at timestamptz default now()
```

### 3.2 Row-Level Security (RLS)

모든 테이블에 `user_id = auth.uid()` RLS 정책. 사용자는 자기 데이터만 보고 수정 가능. (Phase 3 팀 도입 시 정책 확장)

### 3.3 로컬 SQLite 스키마

Supabase 스키마와 1:1 동일. 추가로 sync 큐 테이블:

```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT,                       -- 'insert' | 'update' | 'delete'
  table_name TEXT,
  row_id TEXT,
  payload TEXT,                  -- JSON
  attempt INT DEFAULT 0,
  last_error TEXT,
  created_at TEXT
);
```

---

## 4. Sync 흐름

### 4.1 일반 쓰기 흐름 (Optimistic)

```
User 액션
  ↓
1. 로컬 SQLite 즉시 update (UI 즉시 반영)
  ↓
2. sync_queue에 enqueue
  ↓
3. 워커가 비동기로 Supabase 푸시
  ↓ (성공 시)
4. Supabase에 매핑된 google_event_id 있으면 Google API에도 update
  ↓
5. sync_queue에서 제거
```

실패 시: `sync_queue.attempt` 증가, 지수 backoff (1s, 2s, 4s, ..., 최대 30분).

### 4.2 Pull (서버 → 로컬)

- 앱 시작 시 1회 + Realtime 구독으로 변경 push 받음
- Realtime은 Supabase의 `postgres_changes` 채널 활용
- 받은 변경을 로컬 SQLite에 반영. 단, **로컬에서 더 최신**(updated_at 비교)이면 무시

### 4.3 Google ↔ Supabase 양방향

#### Calendar (일정)
- TodoStick 일정 중 `start_time`, `end_time` 있는 항목이 Google Calendar 이벤트로 sync
- 매핑 규칙:
  - `title` → `summary`
  - `memo` → `description`
  - `date` + `start_time`/`end_time` → `start`/`end`
  - `color` → `colorId` (가까운 Google 색상으로 매핑)
  - `category` → 무시 (Calendar에 대응 없음)
  - `is_completed` → 무시 (Calendar에 완료 개념 없음)

#### Tasks (할일)
- 시간 없는 일정(시간/이벤트 아닌 것)을 Google Tasks와 sync
- 매핑:
  - `title` → `title`
  - `memo` → `notes`
  - `date` → `due`
  - `is_completed` → `status` ('needsAction' / 'completed')

#### Pull (Google → TodoStick)
- 마지막 sync 이후 변경된 항목만 (`updatedMin` 파라미터)
- `last_sync_at`는 로컬 SQLite `meta` 테이블에 `google_calendar_last_sync`, `google_tasks_last_sync` 두 키로 보관 (디바이스마다 별도)
- 새 이벤트면 → TodoStick task 생성 + 매핑 추가
- 기존 이벤트 update면 → 매핑된 task update (단, 로컬이 더 최신이면 충돌 → 일단 server-wins)

#### Push (TodoStick → Google)
- 로컬에서 만든 task 중 매핑 없는 것 → Google에 create, id 매핑 저장
- 매핑 있는 것 update → Google API update
- 삭제 → Google에서도 삭제

### 4.4 sync 주기

| 트리거 | 동작 |
|---|---|
| 앱 시작 | Supabase pull + Google pull |
| 5분마다 | Google pull (Calendar/Tasks) |
| 모든 로컬 변경 | 즉시 sync_queue enqueue → 워커가 처리 |
| 네트워크 재연결 | sync_queue 전부 flush |
| 사용자 수동 동기화 | 설정 메뉴에서 "지금 동기화" 버튼 |

---

## 5. 인증 흐름

### 5.1 첫 로그인
1. 앱 실행 → 로그인 화면 표시
2. "Google로 로그인" 클릭
3. Supabase Auth가 Google OAuth 흐름 시작 (브라우저 팝업)
4. 사용자 동의 (scopes: `email`, `profile`, `calendar`, `tasks`)
5. Supabase가 access/refresh token 반환
6. Google access/refresh token은 **OS 보안 저장소**에 저장 (Electron `safeStorage` API)
7. `profiles` 테이블에 user 레코드 생성
8. 메인 화면으로

### 5.2 토큰 갱신
- Supabase 세션: SDK가 자동 refresh
- Google: access token 만료 임박(5분 이내) 시 refresh token으로 자동 갱신
- refresh token 만료/취소: 사용자 재로그인 요청

### 5.3 로그아웃
- Supabase signOut
- OS 보안 저장소에서 Google 토큰 제거
- 로컬 SQLite는 유지 (다른 계정으로 로그인하면 별도 폴더)

---

## 6. 오류 처리 & 오프라인

| 상황 | 동작 |
|---|---|
| 네트워크 없음 | 모든 읽기는 로컬 캐시, 쓰기는 sync_queue 적재, UI는 정상 동작 |
| Supabase 5xx | sync_queue에서 backoff 재시도 (1s → 30분 상한) |
| Google API 429 (rate limit) | 응답의 `Retry-After` 헤더 존중, 못 받으면 60s backoff |
| Google API 401 (만료) | refresh token으로 재발급 시도, 실패 시 재로그인 안내 토스트 |
| 데이터 충돌 (양쪽 동시 수정) | server(updated_at 큰 쪽) 승리. `sync_log`에 기록. 사용자 알림은 Phase 2에서 |
| 로컬 SQLite 손상 | 자동 백업에서 복구 시도, 실패 시 Supabase에서 풀 리프레시 |
| 마이그레이션 실패 | 원본 JSON 보존, 사용자에게 에러 표시, 재시도 가능 |

---

## 7. 이월(carry-over) 버그 진단 & 수정

### 진단 (코드 읽기 결과)

- `src/main/database.js` 에 `rolloverTasks(toDate)`, `autoRolloverInProgress(toDate)` 함수는 구현되어 있음 (line 541-649)
- `getTasksByDate(date)` (line 253)는 단순히 `t.date === date` 필터만 함
- **rolloverTasks를 자동으로 호출하는 코드가 없음** — 그래서 어제 미완료가 오늘 안 뜸

### 수정 방향

1. **로컬 측 (즉시 적용 가능)**:
   - 앱 시작 시 + 자정 넘김 감지 시 `autoRolloverInProgress(today)` 자동 호출
   - 사용자 선택형 이월(`getOverdueTasks` + 모달 UI)도 일별 뷰 상단에 배지로 노출
2. **Supabase 측**:
   - Scheduled function으로 매일 자정 자동 이월 (다중 디바이스 일관성)
   - 단, Phase 1에선 로컬 처리만으로 충분 (Phase 2 모바일 도입 시 서버 측 추가)

### 검증
- 어제 날짜 task 만들고 미완료 상태로 둠 → 앱 재실행 → 오늘 뷰에 표시되는지 확인
- 다일 이벤트(`end_date` 있는 것)는 이월 대상이 아님 확인
- 멱등성: 같은 날 재실행해도 중복 안 생기는지 확인 (`rollover_source_id` 체크)

---

## 8. 마이그레이션 전략

### 8.1 로컬 JSON → 로컬 SQLite
- 첫 실행 시 `app.getPath('userData')/todostick.json` 존재 확인
- 있으면: JSON 파싱 → SQLite로 일괄 insert (트랜잭션)
- 백업: `todostick.json.backup-YYYYMMDD` 로 복사
- 1개월 후 자동 정리 (또는 수동 삭제 가이드)

### 8.2 로컬 SQLite → Supabase
- 로그인 직후 1회: 로컬 task 전체를 Supabase에 batch insert
- `created_at` 보존
- 기존 `id`가 string이면 uuid로 변환 (마이그레이션 시 매핑 테이블 임시 사용)
- Google sync 매핑은 마이그레이션 후 첫 sync에서 자동 생성

### 8.3 마이그레이션 실패 안전망
- 모든 마이그레이션은 트랜잭션. 실패 시 롤백
- 원본 JSON은 마이그레이션 성공 후에도 1개월간 보존
- 마이그레이션 진행률 표시 UI (대량 데이터 사용자 대비)

---

## 9. 테스트 전략

| 레벨 | 대상 | 도구 |
|---|---|---|
| 단위 | 이월 로직, 반복 인스턴스 생성, 충돌 해결 | Vitest (이미 셋업됨) |
| 단위 | sync_queue 큐잉 & 재시도 backoff | Vitest |
| 통합 | Supabase CRUD (로컬 dev 인스턴스) | Supabase CLI + Vitest |
| 수동 | Google Calendar/Tasks 양방향 sync | 테스트 계정으로 직접 |
| 수동 | 오프라인 모드 → 재연결 sync | 네트워크 끊기 |
| 수동 | 마이그레이션 (기존 사용자 JSON 데이터로) | 실제 v1.5.2 사용 데이터 |

자동화 우선순위: 이월 로직 → sync_queue 재시도 → Supabase CRUD → Google sync (계정 의존성 때문에 가장 마지막).

---

## 10. 작업 순서 (개략)

세부 implementation plan은 별도 작성 예정. 큰 흐름만:

1. **준비**: 브랜치 정리 (master/dev/feat 셋업), 팀 코드 삭제
2. **Supabase 셋업**: 프로젝트 생성, 스키마 적용, RLS 정책
3. **인증**: Google OAuth + Supabase Auth 연동, 토큰 보안 저장
4. **로컬 SQLite 도입**: JSON → SQLite 마이그레이션 코드
5. **Sync engine**: queue + 워커 + 재시도
6. **Supabase ↔ 로컬 sync**: pull/push + Realtime
7. **Google Calendar sync**: 양방향
8. **Google Tasks sync**: 양방향
9. **이월 버그 수정**
10. **브랜딩**: TodoStick → Orbit (창제목/아이콘/패키지명)
11. **테스트 + 사용자 테스트 + 출시**

---

## 11. 미결정 / 추후 결정

- [ ] Supabase 리전 (Tokyo vs Seoul) — Pro 티어 갈 때 결정
- [ ] 다중 디바이스(같은 사용자가 PC 2대)에서 same-account sync 우선순위 — Phase 2 진입 시 재검토
- [ ] Google Calendar에 만든 일정의 변경 알림(webhook) 도입 여부 — 일단 5분 polling, 부족하면 도입
- [ ] 첨부파일 처리 — Phase 1엔 미포함, Phase 4(프로젝트 도입)에서 Google Drive 연동
- [ ] 모바일 앱 스택 (React Native vs Flutter vs Expo) — Phase 2 진입 시 별도 brainstorm

---

## 부록 A. 코덱스가 만든 코드 처리 표

| 파일 | 처리 |
|---|---|
| `src/renderer/src/views/TeamDashboardView.jsx` | 삭제 |
| `src/renderer/src/views/TeamScheduleView.jsx` | 삭제 |
| `src/renderer/src/views/ProjectsView.jsx` | 삭제 |
| `src/renderer/src/views/MeetingsView.jsx` | 삭제 |
| `src/renderer/src/views/SupportProgramsView.jsx` | 삭제 |
| `src/renderer/src/views/team-view-utils.js` | 삭제 |
| `src/main/team-store.js` | 삭제 |
| `src/main/team-store.test.js` | 삭제 |
| `src/renderer/src/App.jsx` | 부분 수정 (3-탭 제거, 팀 import 제거, Orbit 브랜딩 유지) |
| `src/main/database.js` | 부분 수정 (team-store import/함수 제거) |
| `src/main/index.js` | 부분 수정 (팀 IPC 핸들러 제거) |
| `src/preload/index.js` | 부분 수정 (팀 API 노출 제거) |
| `out/` 빌드 산출물 | 재빌드 |

## 부록 B. 브랜치 전략

| 브랜치 | 역할 | 푸시? |
|---|---|---|
| `master` | 출시용 (안정) | 태그 + push |
| `dev` | 로컬 테스트 통합 | push |
| `feat/<이름>` | 기능 단위 작업 | 작업 중에만 |
| `todostick` (현재 원격 main) | **legacy** — `master`로 이름 변경 후 폐기 (GitHub default 브랜치 변경 필요) |
| `orbit` (로컬) | **참고 자산** — 삭제하지 말고 보존 (Phase 4~6에서 Tiptap 회의록·프로젝트 시스템 참고) |
| `codex/todostick-team-planning` | 폐기 (코덱스 작업 결과물, 본 spec과 무관) |

작업 시작 시:
1. `master` 브랜치를 origin/todostick에서 갱신
2. `dev` 생성 (from master)
3. `feat/orbit-phase-1-cleanup` 생성 (from dev) — 팀 코드 삭제부터
