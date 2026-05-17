# Orbit Phase 1 — Plan 2 sub-plan: database.js JSON → SQLite 포팅

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `todostick/src/main/database.js`를 JSON 기반에서 SQLite 기반으로 포팅한다. IPC 인터페이스(메서드 시그니처, 반환 모양)는 그대로 유지하여 renderer/preload 코드는 변경 불필요. 앱 시작 시 자동 마이그레이션(JSON→SQLite, todostick→orbit 폴더).

**Architecture:**
- 기존 `database.js`의 `read()/write()` JSON I/O를 SQLite prepared statement로 교체
- 모듈 스코프 단일 `db` 인스턴스 (Electron main process는 single owner)
- 비즈니스 로직(반복 인스턴스 생성, 정렬, 멱등 이월)은 그대로 보존
- boolean ↔ INTEGER(0/1) 변환 일관성 유지 (renderer는 boolean 받음)
- 배열 필드(`repeat_days`, `skipped_dates`)는 SQLite에 JSON 문자열로 저장, 읽을 때 parse

**Branch:** `feat/orbit-phase-2-foundation` (현재 위치, 4 commits ahead of master)
**Base:** master (v1.6.1)
**Target Version:** v1.7.0-rc1 (rc = release candidate, 클라우드 sync 전 단계)

---

## 사전 조건

- ✅ `feat/orbit-phase-2-foundation` 브랜치에 `sqlite.js`, `migrate.js`, `config.js`, `userdata-migration.js` 모두 작성됨 (각각 테스트 통과)
- ✅ `.env` 에 SUPABASE_URL/ANON_KEY 설정됨
- ⚠️ Node v25 native 빌드 이슈 — Node v22 LTS 권장 (별도 처리)

---

## File Structure

| 파일 | 변경 종류 |
|---|---|
| `todostick/src/main/database.js` | **전면 교체** (JSON → SQLite) |
| `todostick/src/main/database.json.js.bak` | 백업 (이전 JSON 버전 보존) |
| `todostick/src/main/database.test.js` | 테스트 확장 (CRUD/조회/이월/습관/설정 시나리오) |
| `todostick/src/main/index.js` | 수정 (앱 시작 시 마이그레이션 + DB 오픈 흐름) |

⚠️ `preload/index.js`, `renderer/**` 은 변경 없음 (IPC API 시그니처 동일).

---

## Task A: Database 백업 + 시작 흐름 정리

**Goal:** 안전망. 현재 database.js를 보존 + 앱 시작 흐름 정리.

- [ ] **Step 1: 현재 database.js 백업**

```bash
cp /d/TODO/todostick/src/main/database.js /d/TODO/todostick/src/main/database.json.js.bak
```

- [ ] **Step 2: 백업 add + commit**

```bash
cd /d/TODO && git add todostick/src/main/database.json.js.bak
cd /d/TODO && git commit -m "chore: database.js JSON 버전 백업 (SQLite 교체 전)"
```

---

## Task B: SQLite-backed database.js 작성 (TDD)

**Goal:** 새 `database.js`가 기존 IPC와 동일한 인터페이스를 SQLite로 구현.

**핵심 결정:**
- `db` 인스턴스는 모듈 스코프 lazy 초기화 (`getDb()` 헬퍼)
- 모든 boolean 필드는 SQLite에서 0/1로 저장, 읽을 때 `!!row.field` 로 boolean 변환
- 배열 필드는 SQLite에 JSON 문자열로 저장, 읽을 때 `JSON.parse()`
- 트랜잭션 — 다중 write 작업은 `db.transaction(() => {...})()`로 감싸기
- 반복 인스턴스 생성(`generateRepeatInstances`)은 별도 헬퍼 모듈 `repeat.js`로 분리 (테스트 가능성 향상)

### Sub-task B-1: repeat.js 순수 함수 분리 + 테스트

- [ ] Step 1: 실패 테스트 작성 (`todostick/src/main/repeat.test.js`)

다음 케이스 커버:
  - daily 반복: 매일 인스턴스
  - daily + repeat_days [1,2,3,4,5]: 평일만
  - weekly 반복: 같은 요일만
  - monthly 반복: 같은 날짜만
  - skipped_dates 제외
  - 이미 인스턴스 있는 날은 중복 생성 안 함

(11~14개 테스트 케이스)

- [ ] Step 2: `todostick/src/main/repeat.js` 구현

```js
export function shouldRepeatOnDate(template, date) { /* ... */ }
export function buildRepeatInstancesForDate(tasks, date, generateId) { /* returns new instance(s) */ }
```

순수 함수: tasks 배열 + date 받아 새 인스턴스 배열 반환. DB I/O 없음.

- [ ] Step 3: 테스트 PASS 확인 + commit

### Sub-task B-2: SQLite tasks CRUD 메서드

- [ ] Step 1: 실패 테스트 (`todostick/src/main/database.test.js` 확장)

기존 yesterdayOf 테스트 위에 새 describe 블록 추가:

```js
describe('database (SQLite-backed)', () => {
  // beforeEach: tmp dir + openDatabase + createDatabaseInstance(db)
  // 테스트:
  // - createTask 비반복
  // - createTask 반복 (template + instance 동시 생성)
  // - updateTask 단일 필드 변경
  // - toggleTask
  // - setInProgress
  // - setStarred
  // - deleteTask (반복 인스턴스 시 skipped_dates 추가)
  // - deleteTaskAndFuture (template + 미래 instances 삭제)
})
```

- [ ] Step 2: 새 `database.js` 작성 (이 task의 가장 큰 부분)

```js
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { openDatabase } from './sqlite.js'
import { migrateJsonToSqlite } from './migrate.js'
import { migrateUserData } from './userdata-migration.js'
import { autoRolloverOverdue as computeAutoRolloverOverdue, yesterdayOf } from './rollover.js'
import { buildRepeatInstancesForDate, shouldRepeatOnDate } from './repeat.js'

let _db = null

function dbPath() {
  return join(app.getPath('userData'), 'orbit.db')
}

function jsonPath() {
  return join(app.getPath('userData'), 'todostick.json')
}

function getDb() {
  if (_db) return _db
  _db = openDatabase(dbPath())
  // 첫 오픈 시 JSON 마이그레이션 (한 번만)
  try { migrateJsonToSqlite(jsonPath(), _db) } catch (e) { console.error('[migrate]', e) }
  return _db
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// boolean 1/0 변환 헬퍼 + 배열 JSON 헬퍼
function rowToTask(row) {
  if (!row) return null
  return {
    ...row,
    is_completed: !!row.is_completed,
    is_in_progress: !!row.is_in_progress,
    is_starred: !!row.is_starred,
    is_habit: !!row.is_habit,
    is_template: !!row.is_template,
    repeat_days: row.repeat_days ? JSON.parse(row.repeat_days) : null,
    skipped_dates: row.skipped_dates ? JSON.parse(row.skipped_dates) : []
  }
}

// (모든 메서드 SQLite 기반으로 구현 — 아래 구조 참조)

export default {
  // ── 조회 ──
  getTasksByDate(date) { /* generateRepeatInstances + SELECT WHERE date=? + sort */ },
  getTasksByMonth(year, month) { /* */ },
  getTasksByRange(startDate, endDate) { /* */ },
  getOverdueTasks(date) { /* yesterdayOf + WHERE ... AND NOT in rolledSources */ },
  getTodayReminders(date) { /* */ },
  getCompletedTasks(filters) { /* */ },
  getPoolTasks(poolKey) { /* */ },

  // ── 쓰기 ──
  createTask(input) { /* template + instance 동시 생성 (반복) 또는 단일 (비반복) */ },
  updateTask(id, fields) { /* 동적 UPDATE + is_habit 전파 + 반복 제거 시 cleanup */ },
  toggleTask(id, note) { /* */ },
  setInProgress(id, value) { /* */ },
  setStarred(id, value) { /* */ },
  deleteTask(id) { /* skipped_dates 추가 */ },
  deleteTaskAndFuture(id, fromDate) { /* template + 미래 instances 삭제 */ },
  reorderTasks(date, orderedIds) { /* UPDATE order_index */ },

  // ── 이월 ──
  autoRolloverOverdue(toDate) {
    const db = getDb()
    const tasks = db.prepare('SELECT * FROM tasks').all().map(rowToTask)
    const newTasks = computeAutoRolloverOverdue(tasks, toDate)
    if (newTasks.length === 0) return []
    const insert = db.prepare(/* INSERT INTO tasks ... */)
    db.transaction(() => { for (const t of newTasks) insert.run(...) })()
    return newTasks
  },
  rolloverTasks(toDate) { /* */ },
  rolloverSelectedTasks(taskIds, toDate) { /* */ },

  // ── 습관 ──
  getHabitMatrix(fromDate, toDate) { /* */ },
  toggleHabitOnDate(templateId, date) { /* */ },

  // ── 카테고리/설정/회고/목표 ──
  getCategories() { /* */ },
  setCategories(cats) { /* DELETE + INSERT */ },
  getSetting(key) { /* */ },
  setSetting(key, value) { /* */ },
  getSeeMemo(date) { /* */ },
  setSeeMemo(date, obj) { /* */ },
  getMonthlyStats(months) { /* */ },
  getMonthlyGoal(ym) { /* */ },
  setMonthlyGoal(ym, text) { /* */ },

  // ── 메타 ──
  getDbPath() { return dbPath() },
  seedIfEmpty() { /* dev 모드 시드 데이터 (SQLite 비어있을 때) */ }
}
```

⚠️ 각 메서드는 200~400자 분량의 실제 SQL 구현이 필요. 본 plan에서는 메서드 인터페이스만 명시. **구현 단계에서는 기존 `database.json.js.bak`의 비즈니스 로직을 정확히 참조**하여 동일한 동작 보장.

- [ ] Step 3: 모든 테스트 PASS 확인 + commit (`feat(db): SQLite-backed database 구현`)

---

## Task C: 앱 시작 흐름 마이그레이션 통합

- [ ] Step 1: `main/index.js`의 `app.whenReady().then(() => {...})` 블록 수정

기존 마이그레이션 호출:
```js
migrateUserData({ oldDir, newDir: userDataPath })
```

다음으로 확장:

```js
// 1. todostick → orbit 폴더 마이그레이션
const userDataPath = app.getPath('userData')
const parentDir = userDataPath.split(/[/\\]/).slice(0, -1).join('/')
migrateUserData({ oldDir: `${parentDir}/todostick`, newDir: userDataPath })

// 2. DB 초기화는 database.js의 getDb() lazy init에서 처리
//    (첫 호출 시 SQLite 오픈 + JSON 마이그레이션)
```

- [ ] Step 2: dev 모드 seedIfEmpty 호출 검증

기존 `if (isDev) { db.seedIfEmpty() }` 로직은 그대로. SQLite에서도 빈 DB 감지 + 시드.

- [ ] Step 3: build + commit (`feat(db): 앱 시작 흐름 SQLite 통합`)

---

## Task D: 수동 통합 테스트

- [ ] Step 1: dev 모드 실행

```bash
cd /d/TODO/todostick && npm run dev
```

- [ ] Step 2: 시각 확인 (사용자)

기존 v1.6.1 .exe와 동일하게 동작해야:
- 일별 뷰에 task 표시
- 새 task 추가
- 완료 토글
- 진행중/별표 토글
- 반복 task 생성 (daily, weekly, monthly)
- 어제 미완료 자동 이월
- 습관 매트릭스 (잔디)
- 회고/월간 목표
- 스티커 창
- 카테고리 관리

각 항목 통과 시 ✓ 표시. 실패 시 디버깅 task 추가.

- [ ] Step 3: 데이터 위치 확인

`%APPDATA%\orbit\orbit.db` 파일 존재 확인.

기존 `%APPDATA%\orbit\todostick.json` 은 그대로 유지 (백업 역할).

---

## Task E: 빌드 + 머지 + 태그

- [ ] Step 1: 전체 테스트

```bash
cd /d/TODO/todostick && npm test
```

Expected: 모든 테스트 PASS.

- [ ] Step 2: 프로덕션 빌드

```bash
cd /d/TODO/todostick && npm run build
```

- [ ] Step 3: package.json 버전 bump

`"version": "1.6.1"` → `"version": "1.7.0-rc1"` (-rc1 = release candidate. 클라우드 sync 들어오면 1.7.0 정식)

commit: `chore: bump version to 1.7.0-rc1`

- [ ] Step 4: dev → master 머지

```bash
git checkout dev && git merge --no-ff feat/orbit-phase-2-foundation
git push origin dev
git checkout master && git merge --no-ff dev
git tag v1.7.0-rc1 -m "Orbit v1.7.0-rc1 — SQLite 백엔드 도입"
git push origin master --tags
```

- [ ] Step 5: 패키지 빌드

```bash
cd /d/TODO/todostick && npm run package
```

`Orbit Setup 1.7.0-rc1.exe` 생성.

- [ ] Step 6: feat 브랜치 정리

```bash
git branch -d feat/orbit-phase-2-foundation
git push origin --delete feat/orbit-phase-2-foundation
```

---

## 알려진 위험

1. **Node v25 native 빌드** — 사용자가 v22로 다운그레이드하기 전엔 패키지 빌드 실패 가능. 사전 처리 필요.
2. **마이그레이션 1회성** — `json_migrated` meta key로 멱등 처리되지만, SQLite 파일을 사용자가 직접 지우면 재마이그레이션 안 됨 (json_migrated 플래그가 새 DB엔 없어서 재마이그레이션 됨, 멱등). 사실 멱등 OK.
3. **반복 인스턴스 자동 생성 부하** — 1년치 미리 생성 vs 조회 시 lazy 생성. 기존 코드는 lazy. SQLite에서도 lazy 유지 (성능 측면).
4. **트랜잭션 누락** — 다중 write 작업은 모두 `db.transaction()` 으로 감싸야 함. 누락 시 부분 실패 가능. 코드 리뷰에서 체크.

---

## Task 7 sub-plan 이후 — Plan 2 잔여

Task 7(=본 sub-plan)이 끝나도 Plan 2는 미완. 다음 sub-plan들 필요:

| 다음 sub-plan | 범위 |
|---|---|
| `2026-05-XX-orbit-supabase-client.md` | Supabase 클라이언트 + Auth 흐름 (Google OAuth, deep link) + token 보안 저장 |
| `2026-05-XX-orbit-login-ui.md` | LoginView.jsx + App.jsx 인증 분기 + 프로필 자동 생성 |

이 둘이 끝나면 v1.7.0 정식 출시.
