# Orbit Phase 1 — Plan 4: Google Calendar/Tasks 양방향 sync

**Goal:** Plan 3까지 끝나면 PC↔Supabase가 동기화됨. Plan 4는 거기에 Google Calendar/Tasks 양방향 sync를 더해서 **폰의 Google 캘린더/Tasks 앱**으로 Orbit 데이터를 볼 수 있게 함. 자체 모바일 앱(Phase 2)을 만들기 전에 폰-PC sync 비전을 완성. 출시 버전 v1.9.0 또는 v2.0.0(Phase 1 비전 완성 메이저).

**Branch:** `feat/orbit-plan-4-google-sync`
**Base:** `master` (Plan 3 완료 후, v1.8.x)
**Target Version:** v1.9.0 (또는 v2.0.0)

---

## 핵심 아키텍처 결정 (spec §2, §3.2, §6 기반)

| 결정 | 내용 | 이유 |
|---|---|---|
| **PC가 Google API 직접 호출** | Supabase Edge Function 우회 | 보안↑, 운영 부담↓ |
| **Google access/refresh token은 secure-storage에 저장** | Supabase가 provider_token으로 한 번 넘겨주는 걸 받아서 보관. 만료 임박 시 refresh로 재발급 | OS 보안 저장소 활용 |
| **Calendar ↔ tasks 매핑은 1:1** | task.id ↔ calendar event extendedProperties.private.orbit_id 또는 별도 매핑 테이블 | 양방향 식별 가능 |
| **Google Tasks ↔ task (할일) 매핑** | calendar event 매핑과 별도. task.id ↔ google_tasks 항목의 id | Google이 캘린더와 Tasks를 분리해 운영 |
| **단방향 먼저 → 양방향** | Phase A: Orbit → Google. Phase B: Google → Orbit | 위험 분산. Phase B가 양방향 sync의 복잡도 핵심 |
| **start_time/end_time 있는 task → Calendar event**, 없으면 → Tasks | Orbit의 데이터 모델과 자연 매핑 | 사용자 직관 |
| **선택적 sync (opt-in, 기본 OFF)** ⭐ 2026-05-22 추가 | `tasks.sync_to_google` 컬럼으로 레코드별 토글. 사용자가 명시적으로 체크한 task만 Google로 push | 반복/다일/카테고리 매핑 등 호환 안 되는 케이스를 사용자가 미리 차단. silent 손상 방지 |
| **ON → OFF 토글 시 Google에서 삭제** | google_event_id/google_tasks_id 있으면 Google API delete 호출 후 매핑 NULL화 | "Google에서 빼고 싶다"는 사용자 의도 직관 일치 |
| **Pull로 들어온 신규 event/task는 항상 sync_to_google = 1** | Google이 원본이므로 매핑 유지가 자연스러움 | 외부 source에서 들어왔으므로 sync 의도 자명 |

---

## File Structure

| 파일 | 역할 | 변경 종류 |
|---|---|---|
| `todostick/src/main/google-tokens.js` | Google access/refresh token 보관 + 재발급 | 신규 |
| `todostick/src/main/google-calendar.js` | Calendar API wrapper (list/insert/update/delete) | 신규 |
| `todostick/src/main/google-tasks.js` | Tasks API wrapper | 신규 |
| `todostick/src/main/google-sync.js` | task ↔ Google 매핑 + Orbit→Google push + Google→Orbit pull | 신규 |
| `todostick/src/main/google-sync.test.js` | google-sync 단위 테스트 (Google API mock) | 신규 |
| `todostick/src/main/auth.js` | Supabase가 넘겨주는 provider_token을 secure-storage에 저장 | 수정 |
| `todostick/src/main/sync.js` (Plan 3) | sync 워커에 Google sync 단계 추가 | 수정 |
| `todostick/src/main/index.js` | Google sync 워커 라이프사이클 | 수정 |
| `todostick/src/preload/index.js` | Google sync 상태 + 수동 실행 IPC | 수정 |
| `todostick/src/renderer/src/components/SyncStatusBadge.jsx` | Google sync 상태도 표시 | 수정 |
| `todostick/src/renderer/src/components/SettingsModal.jsx` | "Google 연결 해제" 옵션 | 수정 |

새 SQLite 컬럼 (또는 별도 테이블):
- `tasks.sync_to_google INTEGER DEFAULT 0` ⭐ **opt-in 플래그 (선택적 sync)**
- `tasks.google_event_id TEXT` — Calendar event id 매핑
- `tasks.google_tasks_id TEXT` — Google Tasks 항목 id 매핑
- 새 테이블 `google_sync_meta`: `last_calendar_sync_at`, `last_tasks_sync_at`

---

## Task 1: provider_token 캐치 + 보관

**Files:**
- Modify: `todostick/src/main/auth.js`
- Create: `todostick/src/main/google-tokens.js`

Supabase의 `signInWithOAuth`로 Google 로그인 후, session에 provider_token이 잠깐 들어옴 (access_token). provider_refresh_token도 함께.
- `handleAuthCallback` 안에서 session.provider_token / provider_refresh_token 추출 → secure-storage에 저장
- `google-tokens.js`:
  - `getAccessToken()` — 만료 5분 이내면 refresh로 재발급 (POST https://oauth2.googleapis.com/token)
  - `clearTokens()` — 로그아웃 시 호출
- Supabase는 refresh token을 첫 로그인 시에만 줌 → access_type=offline + prompt=consent (이미 auth.js에 적용됨)

**검증:** 로그인 후 secure-storage의 google_access_token / google_refresh_token이 있는지 확인.

---

## Task 2: Google Calendar/Tasks API wrapper

**Files:**
- Create: `todostick/src/main/google-calendar.js`
- Create: `todostick/src/main/google-tasks.js`

핵심:
- 둘 다 fetch 기반 (외부 의존 추가 없이)
- `listEvents({ calendarId, syncToken? })` — incremental sync에 syncToken 활용
- `insertEvent`, `updateEvent`, `deleteEvent`
- 같은 패턴으로 Tasks API

**검증:** mock fetch로 4xx/5xx/401(token expired) 시나리오 단위 테스트.

---

## Task 3: 매핑 컬럼 + DB 스키마 v3→v4 (선택적 sync 플래그 포함)

**Files:**
- Modify: `todostick/src/main/sqlite.js`
- Modify: `todostick/src/main/database.js`
- Modify: `todostick/src/renderer/src/components/TaskModal.jsx`

- ALTER TABLE tasks ADD COLUMN:
  - `sync_to_google INTEGER DEFAULT 0` ⭐ opt-in 플래그
  - `google_event_id TEXT`
  - `google_tasks_id TEXT`
- 새 테이블 `google_sync_meta` (key, value)
- `applyMigrations` v4 단계 추가
- TaskModal에 "📅 Google 캘린더/Tasks에 동기화" 체크박스 추가
- database.js: createTask/updateTask가 `sync_to_google` 받도록

**검증:** sqlite.test.js의 'tasks 테이블에 sync_to_google 컬럼 존재 + default 0' 테스트.

---

## Task 4: Orbit → Google push (단방향 먼저, 선택적 sync 적용)

**Files:**
- Create: `todostick/src/main/google-sync.js`
- Modify: `todostick/src/main/database.js` — `setSyncToGoogle(taskId, value)` 메서드

로직:
- `pushOrbitToGoogle({ userId })`:
  - **필터: `sync_to_google = 1`인 task만 처리** ⭐
  - DB에서 `sync_to_google = 1 AND google_event_id IS NULL`인 task 중 start_time 있는 것 → Calendar insert → id 저장
  - `sync_to_google = 1 AND google_tasks_id IS NULL`인 task 중 start_time 없는 것 → Tasks insert → id 저장
  - 이미 매핑된 task가 로컬에서 변경됨 → updated_at 기준으로 update API 호출
  - 로컬에서 삭제된 task (sync_queue의 delete event) → Google API delete + 매핑 NULL화

- **토글 OFF 처리** (`setSyncToGoogle(id, 0)` 호출 시):
  - google_event_id 있으면 → Calendar event delete + google_event_id NULL
  - google_tasks_id 있으면 → Tasks item delete + google_tasks_id NULL
  - sync_to_google = 0 저장
  - 이 시퀀스는 `pushOrbitToGoogle` 안에서 처리하거나 별도 `unlinkFromGoogle(taskId)` 메서드로

- 처음 sync는 batch. 이후는 sync_queue + sync_to_google 플래그 기반.

**검증:**
- 단위: `sync_to_google = 0`인 task는 push 안 됨, `1`이면 push됨
- 단위: toggle OFF → google delete API 호출됨 + 매핑 NULL
- 수동: 로컬 task를 체크박스로 sync on → Google 캘린더에 자동 등장하는지

---

## Task 5: Google → Orbit pull (양방향 완성)

**Files:**
- Modify: `todostick/src/main/google-sync.js`

로직:
- `pullGoogleToOrbit({ userId })`:
  - Calendar listEvents(syncToken) — incremental
  - 각 event:
    - extendedProperties.private.orbit_id가 있으면 → 기존 task 업데이트 (last-write-wins)
    - 없으면 → 새 task 만들고 google_event_id 매핑, **`sync_to_google = 1`로 생성** ⭐
    - status=cancelled면 → 로컬 task 삭제 (또는 mark deleted)
  - Tasks도 동일 패턴 (listTasks with showHidden/showCompleted)
  - syncToken을 google_sync_meta에 저장

- Google에서 들어온 신규 task는 항상 sync_to_google=1 — Google이 원본이므로 sync 의도 자명. 사용자가 PC에서 OFF로 토글 시 → Google 삭제 (Task 4 토글 OFF 로직과 동일).
- 폰에서 만든 일정이 PC에 들어오는지 검증 — Plan 4의 핵심 가치.

**검증:** 폰 Google 캘린더 앱으로 일정 추가 → PC Orbit이 30초~1분 내 표시 (sync_to_google=1로) 확인.

---

## Task 6: sync 워커 통합 + Google 연결 해제 UI

**Files:**
- Modify: `todostick/src/main/sync.js`
- Modify: `todostick/src/renderer/src/components/SettingsModal.jsx`
- Modify: `todostick/src/renderer/src/components/SyncStatusBadge.jsx`

- Plan 3의 30초 워커 안에 google-sync push/pull 추가
- Settings의 "계정" 섹션에 Google 연결 상태 + "연결 해제" 버튼 (clearTokens)

---

## Task 7: 단방향 ↔ 양방향 토글 (선택)

사용자가 "PC가 source of truth"로 두고 싶을 때, Google→Orbit pull을 끄는 옵션. Settings에 토글.

---

## Task 8: v1.9.0 (또는 v2.0.0) 출시

- version bump
- 패키지 + tag
- 사용자 검증 (가장 중요):
  1. PC에서 task 추가 → 폰 Google 캘린더에 표시 확인
  2. 폰 Google 캘린더에서 일정 추가 → PC Orbit에 표시 확인 (30초~1분)
  3. 양쪽 동시 편집 시 last-write-wins 동작 확인 (실험)

---

## 알려진 위험

1. **Google API 할당량**: 무료 티어 일일 100만 쿼리 — 1인용은 충분하지만 sync 빈도 주의
2. **Calendar↔Tasks 분리 문제**: Orbit 사용자가 task를 만들었는데 그것이 Calendar인지 Tasks인지 자동 분류 (start_time 유무로) — 가끔 직관과 어긋날 수 있음. UI에 명시 필요
3. **양방향 sync 충돌**: PC와 폰에서 동시에 같은 task를 다르게 편집 → 마지막 쓰기가 이김. 사용자 알림 없으면 silent loss
4. **삭제 vs cancelled**: Google Calendar는 event를 cancel(소프트)와 delete(하드)로 구분. Orbit은 단일 delete만. cancelled 들어오면 어떻게 처리할지 결정 필요
5. **반복 일정**: Orbit의 daily/weekly/monthly 반복은 Calendar의 RRULE과 매핑되지만 완전 호환 X. 첫 버전은 단일 일정만 sync, 반복은 후속
6. **타임존**: Orbit은 'HH:mm' 텍스트, Calendar는 RFC3339. 변환 필요 + DST 주의

---

## 진입점 (Plan 3 끝난 후)

1. Task 1 Google token 보관 — auth.js의 callback에서 provider_token 추출 위치 확인
2. Task 2 API wrapper (작은 단위)
3. Task 3 DB 스키마 마이그레이션
4. Task 4 단방향 push → 사용자 수동 검증
5. Task 5 양방향 pull → 사용자 수동 검증 (핵심)
6. Task 6~8 마무리
