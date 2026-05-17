# Orbit Phase 1 — Plan 1: 이월 버그 수정 + Orbit 리브랜딩

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어제 미완료 할일이 오늘 자동으로 이월되도록 고치고, TodoStick → Orbit 리브랜딩 + Vitest 셋업하여 v1.6.0 출시.

**Architecture:** 기존 `autoRolloverInProgress`(is_in_progress만)를 `autoRolloverOverdue`(모든 미완료)로 확장. DayView가 오늘 화면 진입 시 자동 실행하므로 사용자가 별도 액션 없이 어제 미완료를 오늘 목록에서 본다. 배너는 멱등성 덕분에 중복 없이 비어 표시되며 사용자가 추가 선택 액션 불필요.

**Tech Stack:** Electron + React (기존), Vitest (테스트 신규 도입), better-sqlite3 미사용 (Phase 2부터).

**Branch:** `feat/orbit-phase-1-cleanup` (현재 위치)
**Base:** master (v1.5.2)
**Target Version:** v1.6.0

---

## File Structure

이 plan에서 손대는 파일:

| 파일 | 역할 | 변경 종류 |
|---|---|---|
| `todostick/package.json` | 의존성/메타 | 수정 (vitest 추가, version bump, branding) |
| `todostick/vitest.config.js` | 테스트 설정 | 신규 |
| `todostick/src/main/database.test.js` | DB 함수 테스트 | 신규 |
| `todostick/src/main/database.js` | 비즈니스 로직 | 수정 (autoRolloverOverdue 추가) |
| `todostick/src/preload/index.js` | IPC 노출 | 수정 (autoRolloverOverdue 노출) |
| `todostick/src/main/index.js` | IPC 핸들러 + 윈도 메타 | 수정 (IPC 추가, 타이틀/트레이 Orbit) |
| `todostick/src/renderer/src/App.jsx` | 메인 UI | 수정 (헤더 "TodoStick" → "Orbit", autoRollover 호출처 변경) |
| `todostick/src/renderer/src/views/DayView.jsx` | 일별 뷰 | 수정 (autoRollover 호출 함수명 변경) |
| `todostick/index.html` | HTML 타이틀 | 수정 |

각 파일은 단일 책임을 유지: 비즈니스 로직(database), IPC 경계(preload+main), UI(jsx), 메타(package).

---

## Task 1: Vitest 셋업

**Files:**
- Modify: `todostick/package.json`
- Create: `todostick/vitest.config.js`

- [ ] **Step 1: Vitest devDependency 추가**

`todostick/package.json` 의 `devDependencies` 객체에 vitest 추가하고 scripts에 test 추가:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "gen-icon": "node scripts/generate-icon.mjs",
    "package": "npm run build && electron-builder"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "electron": "^29.1.4",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.1.0",
    "postcss": "^8.4.38",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwindcss": "^3.4.3",
    "vite": "^5.2.8",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

```bash
cd todostick && npm install
```

Expected: vitest 1.6.x 설치됨, package-lock.json 갱신, 에러 없음

- [ ] **Step 3: Vitest 설정 파일 생성**

Create `todostick/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    globals: false
  }
})
```

- [ ] **Step 4: 빈 테스트로 셋업 검증**

Create `todostick/src/main/database.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: 테스트 실행 확인**

```bash
cd todostick && npm test
```

Expected: 1 passed, 0 failed. Vitest CLI 정상 동작 확인.

- [ ] **Step 6: 커밋**

```bash
git add todostick/package.json todostick/package-lock.json todostick/vitest.config.js todostick/src/main/database.test.js
git commit -m "test: Vitest 셋업 (Phase 1 plan 1 준비)"
```

---

## Task 2: 이월 버그 — 실패 테스트 작성 (TDD Red)

**Files:**
- Modify: `todostick/src/main/database.test.js`

이 테스트는 "어제 미완료 task(in_progress 플래그 없음)가 오늘 자동 이월된다"를 검증한다. 현재 `autoRolloverInProgress`는 `is_in_progress` 필터 때문에 이 케이스를 처리하지 못해 실패해야 한다.

- [ ] **Step 1: database.js의 read/write를 in-memory로 우회할 수 있는 모듈 구조 확인**

기존 `todostick/src/main/database.js`는 `app.getPath('userData')` 의존이라 직접 import하면 Electron 없이 실행 안 됨. 테스트를 위해 비즈니스 로직을 순수 함수로 분리해야 함.

다음 task(Task 3)에서 분리할 예정. 이 task는 **분리 후의 함수 시그니처를 가정한 테스트**를 먼저 작성:

`todostick/src/main/database.test.js` 전체를 다음으로 교체:

```js
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd todostick && npm test
```

Expected: "Failed to resolve import './rollover.js'" 또는 "autoRolloverOverdue is not a function" 에러로 전 케이스 FAIL. 이게 정상.

- [ ] **Step 3: 커밋**

```bash
git add todostick/src/main/database.test.js
git commit -m "test(rollover): autoRolloverOverdue 실패 테스트 (TDD red)"
```

---

## Task 3: 이월 로직 추출 + 구현 (TDD Green)

**Files:**
- Create: `todostick/src/main/rollover.js`
- Modify: `todostick/src/main/database.js`

비즈니스 로직을 순수 함수로 분리하여 테스트 가능하게 한다. database.js는 read/write/캐시만 담당.

- [ ] **Step 1: 순수 함수 파일 생성**

Create `todostick/src/main/rollover.js`:

```js
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function yesterdayOf(toDate) {
  const d = new Date(toDate + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function autoRolloverOverdue(tasks, toDate) {
  const yesterday = yesterdayOf(toDate)

  const candidates = tasks.filter((t) =>
    t.date === yesterday &&
    !t.is_completed &&
    !t.is_template &&
    !t.parent_id &&
    !t.end_date
  )
  if (candidates.length === 0) return []

  const existingSources = new Set(
    tasks
      .filter((t) => t.date === toDate && t.rollover_source_id)
      .map((t) => t.rollover_source_id)
  )
  const toCopy = candidates.filter((t) => !existingSources.has(t.id))
  if (toCopy.length === 0) return []

  const maxOrder = tasks.filter((t) => t.date === toDate).length
  const now = new Date().toISOString()

  return toCopy.map((t, i) => ({
    id: generateId(),
    title: t.title,
    memo: t.memo,
    date: toDate,
    is_completed: false,
    is_in_progress: !!t.is_in_progress,
    repeat_type: 'none',
    order_index: maxOrder + i,
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
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

```bash
cd todostick && npm test
```

Expected: autoRolloverOverdue 11개 케이스 모두 PASS.

- [ ] **Step 3: database.js에서 새 함수 사용**

`todostick/src/main/database.js` 상단(import 영역)에 추가:

```js
import { autoRolloverOverdue as computeAutoRolloverOverdue } from './rollover.js'
```

같은 파일의 기존 `autoRolloverInProgress` (line 609 부근) 메서드를 다음으로 교체:

```js
  autoRolloverOverdue(toDate) {
    const data = read()
    const newTasks = computeAutoRolloverOverdue(data.tasks, toDate)
    if (newTasks.length === 0) return []
    data.tasks.push(...newTasks)
    write(data)
    return newTasks
  },
```

(기존 `autoRolloverInProgress` 메서드 자체를 삭제. 새 이름으로 대체.)

- [ ] **Step 4: 커밋**

```bash
git add todostick/src/main/rollover.js todostick/src/main/database.js
git commit -m "feat(rollover): 모든 어제 미완료 자동 이월 (is_in_progress 제약 제거)"
```

---

## Task 4: IPC + preload 갱신

**Files:**
- Modify: `todostick/src/main/index.js`
- Modify: `todostick/src/preload/index.js`

- [ ] **Step 1: main/index.js의 IPC 핸들러 이름 변경**

`todostick/src/main/index.js`의 line 233~240의 핸들러를 다음으로 교체:

```js
ipcMain.handle('tasks:autoRolloverOverdue', (_, toDate) => {
  const result = db.autoRolloverOverdue(toDate)
  if (result.length > 0) {
    mainWindow?.webContents.send('tasks:refresh')
    stickerWindow?.webContents.send('tasks:refresh')
  }
  return result
})
```

(기존 `tasks:autoRolloverInProgress` 채널 자체를 삭제.)

- [ ] **Step 2: preload/index.js의 API 갱신**

`todostick/src/preload/index.js`의 line 14을 다음으로 교체:

```js
    autoRolloverOverdue: (toDate) => ipcRenderer.invoke('tasks:autoRolloverOverdue', toDate),
```

(기존 `autoRolloverInProgress` API 자체를 삭제.)

- [ ] **Step 3: 커밋**

```bash
git add todostick/src/main/index.js todostick/src/preload/index.js
git commit -m "feat(ipc): autoRolloverOverdue 채널 + API 노출"
```

---

## Task 5: DayView 갱신

**Files:**
- Modify: `todostick/src/renderer/src/views/DayView.jsx`

- [ ] **Step 1: 호출처 함수명 변경**

`todostick/src/renderer/src/views/DayView.jsx` line 48을 다음으로 교체:

```jsx
        const created = await window.api.tasks.autoRolloverOverdue(dateStr)
```

(기존 `autoRolloverInProgress` 호출을 그대로 새 이름으로 교체. 동작 의미 자체가 "어제 미완료 자동 이월"로 바뀜.)

- [ ] **Step 2: 배너 텍스트 갱신 (이제 빈 배너 안 뜨지만 안전망으로 유지)**

같은 파일의 line 269 부근 배너 헤더 텍스트를 다음으로 교체 (자동 이월이 작동하므로 평소엔 안 보이지만, 동기화 실패 등 엣지 케이스에 사용):

```jsx
            <span className="text-xs text-amber-700 font-medium">⏰ 자동 이월되지 않은 항목</span>
```

- [ ] **Step 3: 커밋**

```bash
git add todostick/src/renderer/src/views/DayView.jsx
git commit -m "feat(dayview): 어제 미완료 자동 이월 호출 + 배너 문구 갱신"
```

---

## Task 6: 수동 검증 — 이월 버그 해결 확인

**Files:** 없음 (실행 검증)

- [ ] **Step 1: 빌드**

```bash
cd todostick && npm run build
```

Expected: out/ 에 빌드 성공, 에러 없음.

- [ ] **Step 2: dev 모드로 실행 + 시드 데이터 확인**

```bash
cd todostick && npm run dev
```

dev DB는 `app.getPath('userData')` 기준. 빈 DB면 자동 시드 (database.js line 109)로 어제 미완료 task `🧪 [DEV] 어제 못 끝낸 일`이 생성됨.

- [ ] **Step 3: 일별 뷰 확인**

앱 실행 → "일별" 뷰가 기본. 헤더에 오늘 날짜 표시 확인. 화면을 보고:

- 시드 데이터의 `🧪 [DEV] 어제 못 끝낸 일`이 오늘 목록에 떠 있는지 확인
- 떠 있으면: 이월 자동화 작동 ✅
- 안 떠 있으면: 로그 확인 (DevTools 콘솔), DB 파일 직접 확인 (`%APPDATA%/todostick/todostick.json`)

- [ ] **Step 4: 멱등성 확인 — 앱 재실행해도 중복 이월 안 됨**

앱 종료 후 다시 실행. 어제 미완료 task가 오늘 목록에 **1개만** 있어야 함 (2개로 늘어나면 멱등성 깨짐, rollover.js의 `existingSources` 로직 버그).

- [ ] **Step 5: 결과 기록**

검증 결과를 한 줄로 다음 commit message에 포함:
- "verified: 어제 미완료 자동 이월 작동, 멱등성 OK"
- 또는 실패한 경우 어떤 증상인지 기록.

검증만 한 경우 commit은 없음 (코드 변경 없음). 실패 시 디버깅 task 추가 필요.

---

## Task 7: Orbit 리브랜딩 (1) — 메타데이터

**Files:**
- Modify: `todostick/package.json`

- [ ] **Step 1: package.json 메타 변경**

다음 항목 교체:

```json
{
  "name": "orbit",
  "version": "1.6.0",
  "description": "Orbit — 개인과 팀의 일정·할일·프로젝트를 잇는 운영 OS"
}
```

같은 파일의 `build` 섹션:

```json
  "build": {
    "appId": "com.orbit.app",
    "productName": "Orbit",
    "copyright": "Copyright © 2026",
    "directories": { ... 그대로 },
    "files": [ ... 그대로 ],
    "win": { ... 그대로 },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Orbit"
    }
  }
```

(`appId`, `productName`, `shortcutName` 3곳. 나머지 win/icon 등은 변경 없음.)

- [ ] **Step 2: 커밋**

```bash
git add todostick/package.json
git commit -m "feat(brand): package.json — TodoStick → Orbit, v1.6.0"
```

---

## Task 8: Orbit 리브랜딩 (2) — 윈도/트레이/HTML 타이틀

**Files:**
- Modify: `todostick/src/main/index.js`
- Modify: `todostick/index.html` (또는 `todostick/src/renderer/index.html`)

- [ ] **Step 1: 메인 윈도 타이틀**

`todostick/src/main/index.js` line 21 교체:

```js
    title: isDev ? 'Orbit [DEV]' : 'Orbit',
```

- [ ] **Step 2: AppUserModelId**

같은 파일 line 183 교체:

```js
  electronApp.setAppUserModelId(isDev ? 'com.orbit.dev' : 'com.orbit')
```

- [ ] **Step 3: Tray tooltip**

같은 파일 line 117 교체:

```js
  tray.setToolTip(isDev ? 'Orbit [DEV]' : 'Orbit')
```

- [ ] **Step 4: HTML 타이틀**

`todostick/index.html` 의 `<title>` 또는 `todostick/src/renderer/index.html` 찾아서 `Orbit`으로 교체:

```html
<title>Orbit</title>
```

(파일 위치는 `find todostick -name "index.html" -not -path "*node_modules*"` 로 확인)

- [ ] **Step 5: 커밋**

```bash
git add todostick/src/main/index.js todostick/index.html todostick/src/renderer/index.html 2>/dev/null
git commit -m "feat(brand): 윈도 타이틀/트레이/HTML — Orbit"
```

---

## Task 9: Orbit 리브랜딩 (3) — 헤더 로고

**Files:**
- Modify: `todostick/src/renderer/src/App.jsx`

- [ ] **Step 1: 헤더 로고 텍스트 + 아이콘**

`todostick/src/renderer/src/App.jsx` line 88~99의 로고 블록을 다음으로 교체:

```jsx
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-lg text-indigo-500">◎</span>
          <span className="font-bold text-indigo-600 text-base tracking-tight">Orbit</span>
          {envInfo.isDev && (
            <span
              title={`개발 모드 — DB: ${envInfo.dbPath}`}
              className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-300 cursor-help"
            >
              DEV
            </span>
          )}
        </div>
```

(`📌 TodoStick` → `◎ Orbit`)

- [ ] **Step 2: 커밋**

```bash
git add todostick/src/renderer/src/App.jsx
git commit -m "feat(brand): App 헤더 로고 — Orbit"
```

---

## Task 10: 수동 검증 — 리브랜딩 확인

**Files:** 없음

- [ ] **Step 1: 빌드 + 실행**

```bash
cd todostick && npm run build && npm run dev
```

- [ ] **Step 2: 확인 항목**

다음이 모두 "Orbit"으로 표시되는지 시각 확인:
- 윈도 타이틀바: `Orbit [DEV]`
- 헤더 로고: `◎ Orbit`
- 트레이 hover tooltip: `Orbit [DEV]`
- 작업 표시줄/Alt+Tab 표시명: `Orbit`

- [ ] **Step 3: 기존 기능 회귀 검증**

다음 기능들이 그대로 작동하는지 확인:
- 일별 뷰에서 할일 추가/완료/삭제
- 주별/월별 뷰 전환
- 스티커 창 표시 (트레이 메뉴)
- 습관 트래커
- 리뷰 화면

문제 있으면 디버깅 task 추가.

---

## Task 11: 빌드 + 태그 + 머지

**Files:** 없음

- [ ] **Step 1: 전체 테스트 재실행**

```bash
cd todostick && npm test
```

Expected: 모두 PASS.

- [ ] **Step 2: 프로덕션 빌드**

```bash
cd todostick && npm run build
```

Expected: out/ 산출물 정상 생성, warning만 (error 없음).

- [ ] **Step 3: dev → 머지**

```bash
git checkout dev
git merge --no-ff feat/orbit-phase-1-cleanup -m "merge: Orbit Phase 1 — 이월 자동화 + 리브랜딩"
git push origin dev
```

(`--no-ff`로 머지 커밋 남겨서 feature 단위 흔적 보존)

- [ ] **Step 4: master로 머지 + 태그**

```bash
git checkout master
git merge --no-ff dev -m "release: v1.6.0 — Orbit 리브랜딩 + 이월 버그 수정"
git tag v1.6.0 -m "Orbit v1.6.0"
git push origin master --tags
```

- [ ] **Step 5: 패키지 빌드 (설치 파일)**

```bash
cd todostick && npm run package
```

Expected: `todostick/release/` 에 `Orbit Setup 1.6.0.exe` 생성.

- [ ] **Step 6: feat 브랜치 정리**

```bash
git branch -d feat/orbit-phase-1-cleanup
git push origin --delete feat/orbit-phase-1-cleanup
```

(local + remote 정리. dev에 머지됐으니 -d로 안전 삭제 가능)

---

## 검증 체크리스트 (전체)

머지 + 태그 전에 최종 확인:

- [ ] `npm test` 모두 PASS (Task 3에서 11개)
- [ ] `npm run build` 에러 없음
- [ ] 이월 자동화: 어제 미완료가 오늘 목록에 자동으로 뜸
- [ ] 멱등성: 앱 재실행 시 중복 이월 안 됨
- [ ] 윈도 타이틀이 `Orbit`
- [ ] 헤더 로고가 `◎ Orbit`
- [ ] 트레이 tooltip이 `Orbit`
- [ ] 기존 기능 (일별/주별/월별/스티커/습관/리뷰) 정상 동작
- [ ] 시드 데이터 dev 모드 정상 (DEV 배지 표시)
- [ ] `release/Orbit Setup 1.6.0.exe` 생성됨

---

## 알아둘 점

1. **icon 파일 교체는 별도**: `resources/icon.png`은 그대로 유지. 새 Orbit 아이콘 만들면 별도 commit으로 추가.
2. **사용자 데이터 경로**: `app.getPath('userData')`가 OS별로 다름. Windows는 `%APPDATA%/orbit` 으로 바뀜 (productName 변경 영향). **기존 todostick 사용자가 업그레이드하면 데이터를 못 찾는 문제 발생 가능.** Phase 1 출시 전에 마이그레이션 스크립트(데이터 폴더 복사) 검토 필요 — Task 12 추가 후보.
3. **로컬 SQLite/Supabase는 Plan 2부터**: 이 plan은 v1.5.2 구조 그대로 유지.
4. **Phase 1 spec과의 관계**: 본 plan은 spec의 "이월 버그 수정"(7장) + "브랜딩"(1.1) 만 다룸. 나머지는 Plan 2~4.

---

## 알려진 미해결 사항 (Plan 1 이후 처리)

- `app.getPath('userData')` 경로 변경에 따른 기존 사용자 데이터 마이그레이션 — Plan 2 시작 시 같이 처리 권장
- 새 Orbit 아이콘 디자인 — 별도 작업
