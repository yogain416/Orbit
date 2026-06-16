# Orbit — 작업 지침 (CLAUDE.md)

Electron + React + Tailwind 데스크톱 앱. 제품 코드는 `todostick/`. 자세한 소개는 [README.md](README.md).

## 브랜치 정책 ⚠️ (반드시 준수)
- **`master` = 출시(release)** — 항상 배포 가능 상태. **직접 커밋/푸시 금지.** `dev`에서만 PR로 병합. 버전 태그·GitHub Release는 여기서.
- **`dev` = 작업(development)** — 모든 개발은 여기 또는 `dev`에서 딴 `feat/*` 브랜치에서. **새 작업은 항상 `dev` 기준으로 시작.**
- 흐름: `feat/x` → PR → `dev` → (출시 시) PR → `master` → 태그 → `npm run release`
- 작업 시작 전 현재 브랜치 확인. `master`면 `dev`로 전환(또는 `feat/*` 분기) 후 진행.

## 명령어 (cwd = `todostick/`)
- 설치: `npm install --legacy-peer-deps` (tiptap peer 충돌 회피)
- 개발: `npm run dev` — userData를 `%APPDATA%/todostick-dev`로 분리(헤더 DEV 배지), Supabase sync OFF
- 빌드 검증: `npm run build`
- 테스트: `npm test` (vitest). main 모듈은 `*.test.js`로 단위 테스트하는 관례.
- 릴리스: `$env:GH_TOKEN = (gh auth token); npm run release` → draft 업로드 → GitHub에서 Publish

## 아키텍처 요점
- **메인↔렌더러**: `src/preload/index.js`의 `window.api.*` 브리지 + `ipcMain.handle`. 두 창(메인 + `#sticker`)에 broadcast.
- **데이터 격리**: 로컬 SQLite(better-sqlite3). 모든 행은 `user_id`로 격리(`setCurrentUserId`). `settings` 테이블만 PC-글로벌.
- **인증 3종**: Google(Supabase OAuth, 동기화 O) / dev(sync OFF) / **로컬 프로필**(`local:<id>`, 최대 3명, sync OFF, `local-profiles.js`).
- **자동 업데이트**: `updater.js`(electron-updater + GitHub Releases). dev 제외.
- **테마**: `renderer/src/utils/theme.js` — localStorage 공유로 두 창·재시작 유지. Tailwind `darkMode: 'class'`.

## 다크모드 팔레트(일관성)
bg-white→`dark:bg-slate-800` · 페이지 bg→`dark:bg-slate-900` · 인셋→`dark:bg-slate-700` · 텍스트 900→`dark:text-slate-100`/600→`dark:text-slate-300` · border→`dark:border-slate-700` · 입력 `dark:bg-slate-700 dark:border-slate-600`. 솔리드 indigo 버튼·검정 오버레이는 유지.
