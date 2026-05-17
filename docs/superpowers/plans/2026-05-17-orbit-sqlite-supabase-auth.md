# Orbit Phase 1 — Plan 2: SQLite + Supabase + Google 인증 기반

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 데이터를 JSON → SQLite로 이전하고, Supabase Auth + Google OAuth로 로그인 가능한 상태를 만든다. sync는 Plan 3, Google API sync는 Plan 4. 이 plan 끝나면 로컬은 SQLite로 동작, 로그인 가능, 사용자 프로필이 Supabase에 생성됨. v1.7.0 출시.

**Architecture:** better-sqlite3로 로컬 DB. Supabase JS SDK로 인증. 마이그레이션은 첫 실행 시 자동 (todostick 폴더 → orbit 폴더 + JSON → SQLite). 인증 토큰은 Electron safeStorage로 OS 보안 저장소에 보관.

**Tech Stack:** better-sqlite3 (네이티브 모듈), @supabase/supabase-js, Electron safeStorage, .env 환경 변수.

**Branch:** `feat/orbit-phase-2-sqlite-auth`
**Base:** `master` (v1.6.0)
**Target Version:** v1.7.0

---

## Prerequisites

이 plan을 시작하기 전에 **사용자가 직접** 처리해야 하는 외부 셋업:

### Supabase 프로젝트 생성 (사용자 작업)

1. https://supabase.com 회원가입 (Google 계정 사용 가능)
2. New project 클릭
   - Name: `orbit-dev` (또는 원하는 이름)
   - DB password: 강력한 패스워드 (잊지 말기, 1Password 같은 곳에 저장)
   - Region: `Northeast Asia (Tokyo)` 또는 `Northeast Asia (Seoul)`
3. 프로젝트 생성 후 약 2분 대기
4. Settings → API 메뉴에서 다음 값 복사:
   - `Project URL` (예: `https://abcdefgh.supabase.co`)
   - `anon` `public` key (긴 JWT 문자열)
5. 위 두 값을 다음 작업자에게 전달 (Plan 작업 시 .env에 넣음)

### Google OAuth 클라이언트 생성 (사용자 작업)

1. https://console.cloud.google.com → 새 프로젝트 (예: `orbit`)
2. APIs & Services → OAuth consent screen
   - User type: External
   - App name: `Orbit`
   - User support email, developer contact: 본인 이메일
   - Scopes: 다음 단계에서 Supabase가 처리하므로 일단 기본만
   - Test users: 본인 Google 이메일 추가 (개발 중)
3. APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Web application
   - Name: `Orbit Supabase`
   - Authorized redirect URIs: 
     - `https://<프로젝트>.supabase.co/auth/v1/callback` (Supabase 콘솔의 Auth → URL Configuration에서 정확한 URL 확인)
4. 생성된 Client ID와 Client Secret을 Supabase 콘솔의 Authentication → Providers → Google 에 입력 후 Enable
5. Authentication → URL Configuration에서:
   - Site URL: `app://orbit` (Electron 프로토콜)
   - Redirect URLs: `app://orbit/auth/callback` 추가

### 전달받아야 할 값

작업자가 시작 전에 받아야 하는 값들:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- (Google client 셋업은 Supabase 측 설정이므로 코드에서 직접 사용 X)

---

## File Structure

이 plan에서 손대는 파일:

| 파일 | 역할 | 변경 종류 |
|---|---|---|
| `todostick/package.json` | 의존성/버전 | 수정 (better-sqlite3, @supabase/supabase-js 추가, v1.7.0) |
| `todostick/.env.example` | 환경 변수 템플릿 | 신규 |
| `todostick/.gitignore` | git 제외 | 수정 (.env 제외) |
| `todostick/src/main/config.js` | 환경 변수 로딩 | 신규 |
| `todostick/src/main/sqlite.js` | SQLite 연결 + 스키마 | 신규 |
| `todostick/src/main/sqlite.test.js` | SQLite 단위 테스트 | 신규 |
| `todostick/src/main/migrate.js` | JSON → SQLite 마이그레이션 | 신규 |
| `todostick/src/main/migrate.test.js` | 마이그레이션 테스트 | 신규 |
| `todostick/src/main/userdata-migration.js` | todostick → orbit 폴더 복사 | 신규 |
| `todostick/src/main/userdata-migration.test.js` | 폴더 복사 테스트 | 신규 |
| `todostick/src/main/database.js` | DB 인터페이스 | 수정 (SQLite로 백엔드 교체) |
| `todostick/src/main/rollover.js` | 이월 로직 | 변경 없음 (순수 함수) |
| `todostick/src/main/supabase.js` | Supabase 클라이언트 | 신규 |
| `todostick/src/main/auth.js` | 인증 흐름 | 신규 |
| `todostick/src/main/auth.test.js` | 인증 로직 테스트 | 신규 |
| `todostick/src/main/secure-storage.js` | safeStorage wrapper | 신규 |
| `todostick/src/main/index.js` | 메인 프로세스 | 수정 (auth IPC, deep link 핸들러) |
| `todostick/src/preload/index.js` | API 노출 | 수정 (auth API 추가) |
| `todostick/src/renderer/src/views/LoginView.jsx` | 로그인 화면 | 신규 |
| `todostick/src/renderer/src/App.jsx` | 인증 상태 분기 | 수정 |
| `todostick/src/renderer/src/utils/auth.js` | renderer 측 auth 헬퍼 | 신규 |

각 모듈은 단일 책임:
- `sqlite.js`: DB 연결과 raw SQL만
- `migrate.js`: JSON → SQLite 변환 로직 (순수)
- `userdata-migration.js`: 폴더 복사 (순수)
- `supabase.js`: Supabase 클라이언트 인스턴스
- `auth.js`: OAuth 흐름 + 세션 관리
- `secure-storage.js`: 토큰 보안 저장
- `database.js`: 비즈니스 인터페이스 (renderer가 보는 API)

---

## Task 1: userData 폴더 마이그레이션 (todostick → orbit)

긴급도 최우선. v1.6.0 사용자가 데이터를 잃지 않게 한다.

**Files:**
- Create: `todostick/src/main/userdata-migration.js`
- Create: `todostick/src/main/userdata-migration.test.js`

- [ ] **Step 1: 실패 테스트 작성 (TDD red)**

Create `todostick/src/main/userdata-migration.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { migrateUserData } from './userdata-migration.js'

let tmp

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-test-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('migrateUserData', () => {
  it('기존 todostick 폴더가 있고 orbit 폴더가 비어있으면 todostick.json을 복사한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"tasks":[{"id":"a"}]}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(true)
    expect(existsSync(join(orbitDir, 'todostick.json'))).toBe(true)
    expect(readFileSync(join(orbitDir, 'todostick.json'), 'utf-8')).toBe('{"tasks":[{"id":"a"}]}')
  })

  it('orbit 폴더에 이미 todostick.json이 있으면 덮어쓰지 않는다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    mkdirSync(orbitDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"tasks":[{"id":"old"}]}')
    writeFileSync(join(orbitDir, 'todostick.json'), '{"tasks":[{"id":"new"}]}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('target-exists')
    expect(readFileSync(join(orbitDir, 'todostick.json'), 'utf-8')).toBe('{"tasks":[{"id":"new"}]}')
  })

  it('기존 todostick 폴더가 없으면 아무것도 안 한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('source-missing')
  })

  it('orbit 디렉토리가 없으면 생성한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(true)
    expect(existsSync(orbitDir)).toBe(true)
  })

  it('todostick.json 외 다른 파일은 복사하지 않는다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{}')
    writeFileSync(join(todostickDir, 'other.txt'), 'noise')

    migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(existsSync(join(orbitDir, 'other.txt'))).toBe(false)
  })

  it('마이그레이션 후 원본은 그대로 둔다 (안전)', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"v":1}')

    migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(existsSync(join(todostickDir, 'todostick.json'))).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: "Failed to load url ./userdata-migration.js" 에러로 6개 FAIL.

- [ ] **Step 3: 구현**

Create `todostick/src/main/userdata-migration.js`:

```js
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const DB_FILENAME = 'todostick.json'

export function migrateUserData({ oldDir, newDir }) {
  if (!existsSync(oldDir)) {
    return { migrated: false, reason: 'source-missing' }
  }

  const oldFile = join(oldDir, DB_FILENAME)
  if (!existsSync(oldFile)) {
    return { migrated: false, reason: 'source-missing' }
  }

  if (!existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true })
  }

  const newFile = join(newDir, DB_FILENAME)
  if (existsSync(newFile)) {
    return { migrated: false, reason: 'target-exists' }
  }

  copyFileSync(oldFile, newFile)
  return { migrated: true, from: oldFile, to: newFile }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: 17/17 PASS (이전 11개 + 신규 6개).

- [ ] **Step 5: main/index.js에 마이그레이션 호출 추가**

`todostick/src/main/index.js` 상단 import 영역에 추가:

```js
import { migrateUserData } from './userdata-migration.js'
```

`app.whenReady().then(() => { ... })` 블록의 첫 줄(`electronApp.setAppUserModelId(...)` 호출 전)에 다음 추가:

```js
  // todostick → orbit 폴더 마이그레이션 (1.6.0 이전 사용자 데이터 보존)
  try {
    const userDataPath = app.getPath('userData')
    const parentDir = userDataPath.split(/[/\\]/).slice(0, -1).join('/')
    const oldDir = `${parentDir}/todostick`
    const result = migrateUserData({ oldDir, newDir: userDataPath })
    if (result.migrated) {
      console.log('[migration] todostick → orbit:', result.to)
    }
  } catch (e) {
    console.error('[migration] failed:', e)
  }
```

- [ ] **Step 6: 커밋**

```bash
git checkout -b feat/orbit-phase-2-sqlite-auth master
git add todostick/src/main/userdata-migration.js todostick/src/main/userdata-migration.test.js todostick/src/main/index.js
git commit -m "feat(migration): todostick → orbit userData 폴더 자동 복사"
```

---

## Task 2: 타임존 일관성 수정 (final reviewer follow-up)

`getOverdueTasks`와 `rolloverTasks`도 UTC 기반으로 통일해 rollover.js와 일치시킨다.

**Files:**
- Modify: `todostick/src/main/database.js`
- Modify: `todostick/src/main/rollover.js` (yesterdayOf를 export)
- Modify: `todostick/src/main/database.test.js` (테스트 추가)

- [ ] **Step 1: rollover.js의 yesterdayOf를 export로 변경**

`todostick/src/main/rollover.js` 의 `yesterdayOf` 함수에 `export` 키워드 추가:

```js
export function yesterdayOf(toDate) {
  const d = new Date(toDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: database.js에서 import**

`todostick/src/main/database.js` 의 기존 import 줄을 다음으로 교체:

```js
import { autoRolloverOverdue as computeAutoRolloverOverdue, yesterdayOf } from './rollover.js'
```

- [ ] **Step 3: getOverdueTasks를 UTC 기반으로 교체**

`todostick/src/main/database.js` 의 `getOverdueTasks(date)` 메서드(약 line ~333)에서 다음 부분을 찾는다:

```js
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    const yesterday = d.toISOString().slice(0, 10)
```

다음으로 교체:

```js
    const yesterday = yesterdayOf(date)
```

(`new Date`/`setDate` 두 줄 삭제, `yesterdayOf` 호출 한 줄로)

- [ ] **Step 4: rolloverTasks를 UTC 기반으로 교체**

같은 파일의 `rolloverTasks(toDate)` 메서드에서 같은 패턴 (`new Date(toDate)` + `setDate(-1)` + `toISOString().slice(0, 10)`) 을 동일하게 `yesterdayOf(toDate)` 호출로 교체.

- [ ] **Step 5: database.test.js에 회귀 테스트 추가 (yesterdayOf만 별도 단위 테스트)**

`todostick/src/main/database.test.js` 상단 import에 추가:

```js
import { yesterdayOf } from './rollover.js'
```

같은 파일의 describe 블록 위/아래(중복 없도록 별도 describe)에 추가:

```js
describe('yesterdayOf', () => {
  it('전일 날짜를 YYYY-MM-DD로 반환', () => {
    expect(yesterdayOf('2026-05-17')).toBe('2026-05-16')
  })

  it('월 경계를 정확히 처리', () => {
    expect(yesterdayOf('2026-06-01')).toBe('2026-05-31')
  })

  it('연 경계를 정확히 처리', () => {
    expect(yesterdayOf('2027-01-01')).toBe('2026-12-31')
  })

  it('윤년 2월 경계', () => {
    expect(yesterdayOf('2028-03-01')).toBe('2028-02-29')
  })
})
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: 21/21 PASS (이전 17개 + 신규 4개).

- [ ] **Step 7: 커밋**

```bash
git add todostick/src/main/rollover.js todostick/src/main/database.js todostick/src/main/database.test.js
git commit -m "fix(timezone): getOverdueTasks/rolloverTasks도 UTC 기반으로 통일"
```

---

## Task 3: better-sqlite3 설치 + 환경 변수 설정

**Files:**
- Modify: `todostick/package.json`
- Create: `todostick/.env.example`
- Modify: `todostick/.gitignore`

- [ ] **Step 1: 의존성 추가**

`todostick/package.json` 의 `dependencies` 객체에 추가:

```json
"dependencies": {
  "@electron-toolkit/utils": "^4.0.0",
  "better-sqlite3": "^11.7.0",
  "@supabase/supabase-js": "^2.46.0",
  "dotenv": "^16.4.5"
}
```

- [ ] **Step 2: 설치 + native 모듈 빌드**

```bash
cd /d/TODO/todostick && npm install
cd /d/TODO/todostick && npx electron-rebuild
```

Expected: better-sqlite3가 Electron 버전에 맞게 native build됨.

- [ ] **Step 3: .env.example 생성**

Create `todostick/.env.example`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: .gitignore에 .env 추가**

`todostick/.gitignore` 의 적절한 위치에 추가 (이미 있으면 skip):

```
.env
.env.local
```

확인:
```bash
grep -n "^\.env" /d/TODO/todostick/.gitignore
```

- [ ] **Step 5: 실제 .env 파일 생성 (수동, git 추가 X)**

작업자에게 실제 SUPABASE_URL과 SUPABASE_ANON_KEY를 받아 `todostick/.env` 에 직접 생성:

```
SUPABASE_URL=<실제 URL>
SUPABASE_ANON_KEY=<실제 키>
```

⚠️ git add 하지 말 것. .gitignore에 있어야 함.

- [ ] **Step 6: 커밋**

```bash
git add todostick/package.json todostick/package-lock.json todostick/.env.example todostick/.gitignore
git commit -m "feat(deps): better-sqlite3 + Supabase SDK + dotenv 추가"
```

---

## Task 4: config 모듈 (환경 변수 로딩)

**Files:**
- Create: `todostick/src/main/config.js`

- [ ] **Step 1: 구현**

Create `todostick/src/main/config.js`:

```js
import dotenv from 'dotenv'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

// 개발: 리포 루트의 .env. 프로덕션: app 경로의 .env (또는 환경변수)
function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return

  const candidates = []
  if (process.cwd()) candidates.push(join(process.cwd(), '.env'))
  if (app?.getAppPath) candidates.push(join(app.getAppPath(), '.env'))
  if (app?.getPath) candidates.push(join(app.getPath('userData'), '.env'))

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path })
      break
    }
  }
}

loadEnv()

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
}

export function assertConfigured() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.')
  }
}
```

- [ ] **Step 2: 빠른 sanity check**

```bash
cd /d/TODO/todostick && node -e "import('./src/main/config.js').then(m => console.log('URL set:', !!m.config.supabaseUrl, 'KEY set:', !!m.config.supabaseAnonKey))"
```

Expected: `URL set: true KEY set: true` (실제 .env에 값이 있어야)

- [ ] **Step 3: 커밋**

```bash
git add todostick/src/main/config.js
git commit -m "feat(config): 환경변수 로딩 모듈"
```

---

## Task 5: SQLite 스키마 + 초기화

**Files:**
- Create: `todostick/src/main/sqlite.js`
- Create: `todostick/src/main/sqlite.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Create `todostick/src/main/sqlite.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase } from './sqlite.js'

let tmp
let db

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-sqlite-'))
  db = openDatabase(join(tmp, 'orbit.db'))
})

afterEach(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('빈 DB에서 스키마 적용', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
    expect(tables).toContain('tasks')
    expect(tables).toContain('categories')
    expect(tables).toContain('settings')
    expect(tables).toContain('see_memos')
    expect(tables).toContain('monthly_goals')
    expect(tables).toContain('meta')
  })

  it('tasks 테이블에 필수 컬럼 존재', () => {
    const cols = db.prepare('PRAGMA table_info(tasks)').all().map(r => r.name)
    const required = ['id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress',
      'is_starred', 'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category',
      'is_habit', 'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates',
      'rollover_source_id', 'completion_note', 'completed_at', 'created_at', 'updated_at']
    for (const col of required) {
      expect(cols).toContain(col)
    }
  })

  it('schema_version meta 키가 설정됨', () => {
    const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()
    expect(row).toBeTruthy()
    expect(Number(row.value)).toBeGreaterThan(0)
  })

  it('재오픈 시 데이터 보존', () => {
    db.prepare('INSERT INTO tasks (id, title, date) VALUES (?, ?, ?)').run('id1', '회의', '2026-05-17')
    db.close()
    db = openDatabase(join(tmp, 'orbit.db'))
    const row = db.prepare('SELECT title FROM tasks WHERE id=?').get('id1')
    expect(row.title).toBe('회의')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: sqlite.js 모듈 없음 에러로 4 FAIL.

- [ ] **Step 3: 구현**

Create `todostick/src/main/sqlite.js`:

```js
import Database from 'better-sqlite3'

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  date TEXT NOT NULL,
  end_date TEXT,
  is_completed INTEGER DEFAULT 0,
  is_in_progress INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  repeat_type TEXT DEFAULT 'none',
  repeat_days TEXT,
  order_index INTEGER DEFAULT 0,
  remind_at TEXT,
  color TEXT,
  category TEXT,
  is_habit INTEGER DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  is_template INTEGER DEFAULT 0,
  parent_id TEXT,
  skipped_dates TEXT,
  rollover_source_id TEXT,
  completion_note TEXT,
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS see_memos (
  date TEXT PRIMARY KEY,
  good TEXT DEFAULT '',
  bad TEXT DEFAULT '',
  next TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_goals (
  ym TEXT PRIMARY KEY,
  text TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

export function openDatabase(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  const stmt = db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
  stmt.run('schema_version', String(SCHEMA_VERSION))
  return db
}

export { SCHEMA_VERSION }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: 25/25 PASS (이전 21 + 신규 4).

⚠️ better-sqlite3는 native module이라 vitest가 못 import할 수도 있음. 그 경우 vitest.config.js의 `test` 설정에 `pool: 'forks'`나 `deps.optimizer.ssr.exclude: ['better-sqlite3']` 추가 필요. 만약 발생하면 BLOCKED 보고.

- [ ] **Step 5: 커밋**

```bash
git add todostick/src/main/sqlite.js todostick/src/main/sqlite.test.js
git commit -m "feat(sqlite): 스키마 정의 + openDatabase 구현"
```

---

## Task 6: JSON → SQLite 마이그레이션 함수

**Files:**
- Create: `todostick/src/main/migrate.js`
- Create: `todostick/src/main/migrate.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Create `todostick/src/main/migrate.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase } from './sqlite.js'
import { migrateJsonToSqlite } from './migrate.js'

let tmp, db, jsonPath

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-migrate-'))
  db = openDatabase(join(tmp, 'orbit.db'))
  jsonPath = join(tmp, 'todostick.json')
})

afterEach(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('migrateJsonToSqlite', () => {
  it('빈 JSON은 0 task로 마이그레이션', () => {
    writeFileSync(jsonPath, JSON.stringify({ tasks: [], settings: {} }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.tasks).toBe(0)
  })

  it('tasks 배열의 항목들을 SQLite tasks 테이블에 insert', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [
        { id: 'a', title: '회의', date: '2026-05-17', is_completed: false, created_at: '2026-05-17T00:00:00Z', updated_at: '2026-05-17T00:00:00Z' },
        { id: 'b', title: '코드 리뷰', date: '2026-05-17', is_completed: true, created_at: '2026-05-17T00:00:00Z', updated_at: '2026-05-17T00:00:00Z' }
      ],
      settings: {}
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.tasks).toBe(2)
    const rows = db.prepare('SELECT id, title, is_completed FROM tasks ORDER BY id').all()
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBe('회의')
    expect(rows[1].is_completed).toBe(1)
  })

  it('settings.categories를 categories 테이블로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { categories: [{ id: 'work', label: '업무', color: 'blue' }] }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.categories).toBe(1)
    const cat = db.prepare('SELECT * FROM categories WHERE id=?').get('work')
    expect(cat.label).toBe('업무')
  })

  it('settings의 see:YYYY-MM-DD 키를 see_memos 테이블로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { 'see:2026-05-17': { good: 'g', bad: 'b', next: 'n' } }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.seeMemos).toBe(1)
    const memo = db.prepare('SELECT * FROM see_memos WHERE date=?').get('2026-05-17')
    expect(memo.good).toBe('g')
  })

  it('settings의 goal:YYYY-MM 키를 monthly_goals로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { 'goal:2026-05': '월간 목표' }
    }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.goals).toBe(1)
    const goal = db.prepare('SELECT * FROM monthly_goals WHERE ym=?').get('2026-05')
    expect(goal.text).toBe('월간 목표')
  })

  it('나머지 settings는 settings 테이블에 그대로', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [],
      settings: { memo: 'free memo', shortcuts: { openMain: 'Ctrl+Shift+T' } }
    }))
    migrateJsonToSqlite(jsonPath, db)
    expect(db.prepare("SELECT value FROM settings WHERE key='memo'").get().value).toBe('free memo')
    expect(JSON.parse(db.prepare("SELECT value FROM settings WHERE key='shortcuts'").get().value).openMain).toBe('Ctrl+Shift+T')
  })

  it('repeat_days, skipped_dates 같은 배열은 JSON 문자열로 저장', () => {
    writeFileSync(jsonPath, JSON.stringify({
      tasks: [{ id: 'a', title: 't', date: '2026-05-17', repeat_days: [1, 2, 3], skipped_dates: ['2026-05-10'], created_at: 'x', updated_at: 'x' }],
      settings: {}
    }))
    migrateJsonToSqlite(jsonPath, db)
    const row = db.prepare('SELECT repeat_days, skipped_dates FROM tasks WHERE id=?').get('a')
    expect(JSON.parse(row.repeat_days)).toEqual([1, 2, 3])
    expect(JSON.parse(row.skipped_dates)).toEqual(['2026-05-10'])
  })

  it('JSON 파일이 없으면 0 보고', () => {
    const result = migrateJsonToSqlite('/non/existent.json', db)
    expect(result.tasks).toBe(0)
    expect(result.skipped).toBe(true)
  })

  it('이미 SQLite에 데이터가 있으면 skip', () => {
    db.prepare("INSERT INTO meta (key, value) VALUES ('json_migrated', '1')").run()
    writeFileSync(jsonPath, JSON.stringify({ tasks: [{ id: 'a', title: 't', date: '2026-05-17', created_at: 'x', updated_at: 'x' }], settings: {} }))
    const result = migrateJsonToSqlite(jsonPath, db)
    expect(result.skipped).toBe(true)
    expect(db.prepare('SELECT count(*) as c FROM tasks').get().c).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: 모듈 없음 에러로 9 FAIL.

- [ ] **Step 3: 구현**

Create `todostick/src/main/migrate.js`:

```js
import { existsSync, readFileSync } from 'fs'

const TASK_COLS = [
  'id', 'title', 'memo', 'date', 'end_date', 'is_completed', 'is_in_progress', 'is_starred',
  'repeat_type', 'repeat_days', 'order_index', 'remind_at', 'color', 'category', 'is_habit',
  'start_time', 'end_time', 'is_template', 'parent_id', 'skipped_dates', 'rollover_source_id',
  'completion_note', 'completed_at', 'created_at', 'updated_at'
]

const BOOL_COLS = new Set(['is_completed', 'is_in_progress', 'is_starred', 'is_habit', 'is_template'])
const ARRAY_COLS = new Set(['repeat_days', 'skipped_dates'])

function normalizeTaskValue(col, value) {
  if (value === undefined) return null
  if (BOOL_COLS.has(col)) return value ? 1 : 0
  if (ARRAY_COLS.has(col)) return value ? JSON.stringify(value) : null
  return value
}

export function migrateJsonToSqlite(jsonPath, db) {
  const already = db.prepare("SELECT value FROM meta WHERE key='json_migrated'").get()
  if (already) {
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 }
  }

  if (!existsSync(jsonPath)) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('json_migrated', '1')").run()
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 }
  }

  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const tasks = raw.tasks || []
  const settings = raw.settings || {}

  const insertTask = db.prepare(`INSERT INTO tasks (${TASK_COLS.join(', ')}) VALUES (${TASK_COLS.map(() => '?').join(', ')})`)
  const insertCategory = db.prepare('INSERT OR REPLACE INTO categories (id, label, color) VALUES (?, ?, ?)')
  const insertSeeMemo = db.prepare('INSERT OR REPLACE INTO see_memos (date, good, bad, next, updated_at) VALUES (?, ?, ?, ?, ?)')
  const insertGoal = db.prepare('INSERT OR REPLACE INTO monthly_goals (ym, text, updated_at) VALUES (?, ?, ?)')
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  const now = new Date().toISOString()
  let categoriesCount = 0
  let seeCount = 0
  let goalCount = 0

  db.transaction(() => {
    for (const t of tasks) {
      insertTask.run(...TASK_COLS.map((col) => normalizeTaskValue(col, t[col])))
    }
    for (const cat of (settings.categories || [])) {
      insertCategory.run(cat.id, cat.label, cat.color || null)
      categoriesCount++
    }
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'categories') continue
      if (key.startsWith('see:')) {
        const date = key.slice(4)
        const obj = typeof value === 'string' ? { good: value, bad: '', next: '' } : value
        insertSeeMemo.run(date, obj.good || '', obj.bad || '', obj.next || '', now)
        seeCount++
      } else if (key.startsWith('goal:')) {
        const ym = key.slice(5)
        insertGoal.run(ym, String(value), now)
        goalCount++
      } else {
        const v = typeof value === 'string' ? value : JSON.stringify(value)
        insertSetting.run(key, v)
      }
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('json_migrated', '1')").run()
  })()

  return { skipped: false, tasks: tasks.length, categories: categoriesCount, seeMemos: seeCount, goals: goalCount }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /d/TODO/todostick && npm test
```

Expected: 34/34 PASS.

- [ ] **Step 5: 커밋**

```bash
git add todostick/src/main/migrate.js todostick/src/main/migrate.test.js
git commit -m "feat(migrate): JSON → SQLite 마이그레이션 함수"
```

---

## Task 7: database.js를 SQLite 백엔드로 교체

**Files:**
- Modify: `todostick/src/main/database.js`

기존 JSON read/write 기반 메서드들을 SQLite prepared statement로 교체. 인터페이스(메서드 시그니처, 반환 모양)는 그대로 유지하여 renderer 변경 최소화.

⚠️ **이 task는 매우 큼.** 메서드 수가 많아 한 번에 다 교체. 자세한 코드는 다음 sub-step에 명시.

- [ ] **Step 1: 백업용 커밋**

현재 database.js를 별도 파일로 보존:

```bash
cp /d/TODO/todostick/src/main/database.js /d/TODO/todostick/src/main/database.json.js.bak
git add todostick/src/main/database.json.js.bak
git commit -m "chore: database.js JSON 버전 백업 (SQLite 교체 전)"
```

- [ ] **Step 2: 새 database.js 작성**

`todostick/src/main/database.js` 전체를 다음으로 교체:

(⚠️ 이 step의 전체 코드는 매우 길어 별도 자세한 명세가 필요. 사용자/작업자 확인 후 진행)

**핵심 변경 지침:**
- `read()/write()` 함수 제거
- 대신 `openDatabase(dbPath())` 로 SQLite 연결, 모듈 스코프 `db` 변수
- 앱 시작 시 `migrateUserData()` (Task 1) + `migrateJsonToSqlite()` (Task 6) 호출 (이미 main/index.js에서)
- 각 메서드를 SQL prepared statement로 변환:
  - `getTasksByDate(date)` → `db.prepare('SELECT * FROM tasks WHERE date=? AND is_template=0 ORDER BY ...').all(date)`
  - `createTask(input)` → `db.prepare('INSERT INTO tasks (...) VALUES (...)').run(...)`
  - `updateTask(id, fields)` → 동적 UPDATE 쿼리
  - 반복 인스턴스 생성 로직(`generateRepeatInstances`)은 그대로 유지 (트랜잭션 안에서)
  - rollover.js에서 가져오는 부분은 그대로 (autoRolloverOverdue)
  - 팀 관련 메서드는 이미 production에 없으므로 제외
- 반환 시 SQLite의 0/1 → boolean 변환 (`is_completed: !!row.is_completed`)
- 배열 필드(`repeat_days`, `skipped_dates`)는 JSON parse

⚠️ **분량이 매우 크다.** 이 task를 작은 sub-task로 추가 분해 필요 — 다음 옵션:
- Option A: 한 subagent에게 통째 위임 (실패 위험 ↑)
- Option B: 메서드 그룹별로 (CRUD, query, rollover, settings, see, review) 별도 sub-task

**작업자 권장**: Option B로 추가 분해. 또는 이 plan 실행 시작 시점에 plan을 다시 분해하여 별도 sub-plan으로 만들기.

---

## ⚠️ 진행 가이드

Task 7은 매우 크므로 본 plan 작성을 여기서 일단 중단합니다.

다음 가이드:
1. **Task 7을 별도 sub-plan으로 분리**: `2026-05-XX-orbit-sqlite-database-port.md` 같은 이름으로 메서드 그룹별 detailed plan 작성
2. Plan 2의 Task 8 이후 (Supabase 클라이언트, Auth, LoginView 등)는 SQLite 포팅이 끝난 후 별도 plan으로

본 plan을 여기까지(Task 1~6)만 실행해서 v1.7.0-rc1 같은 중간 릴리스를 만들 수도 있음. 결정은 사용자가.

---

## Task 8 이후 — 미작성 (sub-plan 필요)

다음 항목들은 본 plan에 명시되지 않음. Task 7 완료 후 또는 별도 plan에서 처리:

- Supabase 클라이언트 생성 (`supabase.js`)
- 인증 흐름 (`auth.js`, `secure-storage.js`)
- Login UI (`LoginView.jsx`)
- 인증 IPC + preload
- App.jsx 인증 분기 (로그인 안 됐으면 LoginView, 됐으면 메인)
- 프로필 자동 생성 (Supabase profiles 테이블)
- v1.7.0 출시 빌드

---

## 알려진 제약

1. **Task 7의 분량 위험**: SQLite 포팅은 한 task로 다루기엔 너무 큼. 본 plan에선 placeholder로 두고, 실제 실행 시 추가 분해 필요.
2. **사용자 외부 셋업 필요**: Supabase 프로젝트 생성, Google OAuth 클라이언트 생성은 코드로 자동화 불가 — 사용자가 직접.
3. **better-sqlite3 native module**: Electron 버전과 정확히 매칭 필요. `electron-rebuild` 단계 누락 시 런타임 에러.
4. **Auth 흐름의 deep link**: Electron 앱이 OAuth redirect를 받으려면 custom protocol(`app://orbit`) 등록 + main process에서 처리 — Task 8 이후에서 다룸.
