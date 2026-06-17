# Orbit Changelog

`todostick`(v1.5.2까지) → `Orbit`(v1.6.0+)으로 리브랜드된 앱의 변경 이력.
구 `orbit` 브랜치(회의노트/스티커 초기 prototype)와는 분리된 main 라인.

## [Unreleased]

### 진행 중 — Plan 4: Google Calendar/Tasks 양방향 sync
- 브랜치: `feat/orbit-plan-4-google-sync` (Task 1 완료, Task 2~ 진행 예정)
- 목표 버전: v2.0.0 (Phase 1 비전 완성)
- 핵심: PC↔Supabase에 더해 폰 Google 캘린더/Tasks와도 sync. **선택적 sync(opt-in)** 도입 — `tasks.sync_to_google` 컬럼으로 레코드별 토글, OFF 전환 시 Google에서 삭제
- 상세: `docs/superpowers/plans/2026-05-20-orbit-plan-4-google-sync.md`

## [1.10.1] - 2026-06-17 — 버그 수정

### Fixed
- ✏️ **할일 모달 Enter 즉시저장 제거** — 모달 컨테이너 `onKeyDown`이 Enter를 가로채 메모(Tiptap) 줄바꿈까지 저장으로 처리하던 문제. 이제 **'저장' 버튼으로만 저장**(Esc 닫기는 유지). 설정의 단축키 안내에서도 'Enter 저장' 제거.
- 🔑 **구글 로그인 재시도/계정 전환 불가 수정** — ① 콜백 대기 중 로그인 버튼이 영구 비활성화되어 브라우저를 닫고 다시 눌러도 안 뜨던 문제 → 재클릭으로 재시도 가능('다시 시도' 라벨). ② OAuth `prompt`를 `consent` → `select_account consent`로 바꿔 매번 계정 선택창 표시(다른 Google 계정으로 전환 가능).

## [1.10.0] - 2026-06-17 — 로컬(오프라인) 프로필 로그인

### Added — 로컬 프로필 (Google 없이 사용)
- 👤 **로컬(오프라인) 프로필 로그인** — 로그인 화면 Google 버튼 아래에 로컬 프로필 섹션. 닉네임으로 **최대 3명** 생성, 클릭해 입장, ✕로 삭제. 계정/네트워크 없이 바로 사용.
- 🔒 **프로필별 데이터 격리** — 각 프로필은 합성 user_id `local:<id>`로 로컬 SQLite에서 격리. 새 프로필은 빈 워크스페이스로 시작(`claimOwnership` skip). **Supabase 동기화 없음**(이 PC 전용).
- 🔁 **세션 유지/전환** — 활성 로컬 프로필은 `settings`에 보관되어 재시작 시 자동 복원. 로그아웃 시 활성 해제 → 로그인 화면. UserMenu에 `로컬` 배지, 동기화 배지에 "로컬 전용" 표시.
- 🧱 신규 `local-profiles.js`(순수 로직 + 단위 테스트 9종) · IPC `local:list/create/delete/login` · `window.api.local.*` · main `resolveCurrentSession`(Supabase OR 로컬).

### Docs — 브랜치 정책
- 📌 **`master`=출시 / `dev`=작업** 정책을 `CLAUDE.md`(신규)와 `README`에 명문화. 흐름: `feat/* → PR → dev → PR → master → 태그 → release`.

## [1.9.0] - 2026-06-17 — GitHub 첫 공개 릴리스 (다크모드·자동 업데이트)

### Added — 다크모드 + 자동 업데이트
- 🌙 **다크모드** — 설정 ▸ 일반 탭에서 **라이트 / 다크 / 시스템** 선택. '시스템'은 Windows 다크모드 설정을 따라가고, 메인·스티커 창과 재시작 후에도 유지(localStorage 공유, `storage` 이벤트로 창 간 동기화). 전 화면·컴포넌트에 slate 다크 팔레트 적용 + 네이티브 위젯(`color-scheme`) 다크 처리.
- 🔄 **자동 업데이트** (electron-updater + GitHub Releases) — 앱 시작 직후 새 버전을 백그라운드로 확인·자동 다운로드. 설정 ▸ 일반 ▸ **업데이트** 에 현재 버전·진행률 표시 + **지금 재시작**으로 즉시 설치, 또는 다음 종료 시 자동 설치. dev 빌드 제외. 메인에 `updater.js`(상태 브로드캐스트) + IPC `updater:getState/check/quitAndInstall`, `package.json`에 `publish`(github) + `npm run release` 스크립트.
- ⏰ **일정 시간 정시 스냅** — 시작/종료 시간 입력을 항상 `:00분`으로 맞추고(`step=3600`), 시작 시간을 처음 정하면 종료를 **+1시간**으로 자동 설정.
- 📌 **스티커 회고 탭 툴바 제거** — 스티커의 See(회고) 탭 마크다운은 툴바 없이 작성(메모 탭은 툴바 유지).

### Added — 반복 일정 관리 (습관 탭 세그먼트)
- 🔁 **습관 탭에 `[습관 | 반복 일정 | 전체]` 세그먼트** 추가. 습관이 아닌 **일반 반복 일정**도 시리즈 단위로 한곳에서 관리.
- 각 반복 일정 행: 제목 · 반복 규칙(매일/매주 요일/매월 N일/주 N회) · **다음 발생일** · 완료 횟수 표시.
- 행 `⋯` 메뉴: **편집(규칙 변경)** · **🌱 습관으로 전환** · **중지/재개** · **시리즈 삭제**.
- DB `getRecurringTemplates`(다음 발생일 400일 스캔) + `setTemplateIsHabit`(is_habit 토글, 인스턴스 전파). IPC `habits:getRecurring`/`habits:setIsHabit`.
- 편집 모달은 비습관일 때 '주 N회' 모드를 숨김(`allowGoal` prop).

### Added — 습관 트래커 대개편 (편집·skip·주N회·통계·정렬·완료메모)
- ✏️ **트래커 안에서 습관 추가/편집** — 헤더 `+ 습관 추가` 버튼 + 카드 `⋯` ▸ 편집. 이름/색(6색)/반복(매일·요일·매주·매월·**주 N회**) 설정. DB `createHabit`/`updateHabit`(title·color 인스턴스 전파).
- 🎯 **주 N회 목표형 습관** — 고정 요일 없이 "주 3회"처럼 빈도로 추적. `tasks.weekly_goal` 컬럼(로컬 전용, **스키마 v4→v5**). 자동 인스턴스 미생성(`shouldRepeatOnDate`가 skip) → miss 빨간칸 없음. 카드에 `🎯 이번주 N/M` 진척, 잔디는 아무 날이나 클릭해 채움.
- 🛌 **휴식일(skip) 토글** — 잔디 셀 **우클릭**으로 해당 날을 회색 휴식 처리(streak 안 깨짐). `skipped_dates` 재사용, DB `setHabitSkip`.
- 📊 **요일별 성공률 통계** — 카드 `⋯` ▸ 요일별 통계. 최근 12주 월~일 달성률 막대그래프.
- ↕️ **카드 드래그 정렬** — 활성 습관 카드 드래그로 순서 변경. DB `reorderHabits`(order_index).
- 📝 **오늘 한 줄 회고** — 카드 `📝` 버튼으로 오늘 완료에 `completion_note` 첨부(`toggleHabitOnDate(note)`).
- 🗂 **중지된 습관 접이식 섹션** — 중지 습관은 "중지된 습관 N개 ▾"로 분리.

### Fixed — 습관 중지/날짜 엣지케이스
- 🩹 **재개 시 중지 구간이 빨간 miss로 소급되던 버그** 수정 — 재개하면 중지 기간(`end_date+1~어제`)을 `skipped_dates`로 채워 **회색 skip**으로 보존, 통계 불계산.
- 🌏 **타임존 불일치** 수정 — 습관 매트릭스/중지 날짜를 UTC(`toISOString`)가 아닌 **로컬 기준**(`todayStrLocal`)으로 통일. KST 오전 0~9시 하루 어긋남 해소.
- 매트릭스 status를 **완료(done) 최우선**으로 재정렬 — 중지/목표형에서도 완료 잔디가 항상 유지됨.
- 🔒 sync: push 시 로컬 전용 `weekly_goal` 컬럼을 제거해 Supabase 업서트 에러 방지.

### Added — 습관 중지/삭제 + 부팅 시 자동 실행
- 🌱 **습관 트래커 카드별 `⋯` 메뉴** 추가 — `⏸ 중지` / `▶ 재개` / `🗑 삭제`.
  - **중지**: 템플릿에 `end_date`(중지일)를 찍어 이후 날짜는 'off'로 표시 + 미래 인스턴스 생성 중단. 잔디·스트릭 기록은 그대로 보존하고 카드에 `⏸ 중지됨` 배지 표시. '오늘 아직 안 한 습관' 목록에서도 제외. **재개**하면 `end_date`를 비워 추적 복원.
  - **삭제**: 템플릿 + 모든 인스턴스(과거/미래) 완전 제거(되돌릴 수 없음, 확인 다이얼로그). 잠깐 쉴 땐 중지를 권장하는 안내 포함.
  - API: `window.api.habits.{setPaused,delete}`, DB `setHabitPaused`/`deleteHabit`. sync_queue 적재로 다기기 반영.
  - `repeat.js#shouldRepeatOnDate`가 `end_date` 이후를 false로 처리(일반 반복 템플릿은 `end_date`가 항상 null이라 영향 없음).
- 🚀 **컴퓨터 부팅 시 자동 실행** — `app.setLoginItemSettings({ openAtLogin })`. 기본 ON, 설정 ▸ **일반** 탭 토글로 끄기 가능(dev 빌드 제외). 설정값은 `settings.autoLaunch`에 보관.

### Added — 메모 노트 N개 관리
- 📒 **단일 메모 → 노트 N개**로 확장. 스티커 메모 탭에 노트 선택 드롭다운 + 새로/이름변경/삭제 버튼.
- 새 노트는 항상 가장 위(order_index 최소-1)에 추가 — 최근 작업한 순서로 자연 정렬.
- 마지막 노트 삭제 시 빈 "새 메모" 1개 자동 생성 — 메모 탭이 항상 사용 가능 상태 유지.
- 노트 본문은 RichMemoEditor(Tiptap + Markdown) 그대로 사용 — 노션 스타일 라이브 마크다운.
- **레거시 마이그레이션**: 기존 `settings.memo` 값(단일 메모)이 있으면 첫 노트로 자동 시드(`notes_seeded_from_memo_v1` 플래그로 멱등). 원본 `settings.memo`는 보존 — 호환성 안전망.
- API: `window.api.notes.{list,get,create,update,delete}`. user 격리(`user_id` 컬럼) 지원하지만 sync_queue에는 적재 안 함 — **로컬-only**(현 버전은 PC 한 대에서만 보임).

### Changed — 이월 UX 선택형 (v1.8.4 자동 이월 되돌림)
- 📥 **자동 이월 → 사용자 선택형 모달**. 오늘 첫 진입 시 미완료 후보 목록이 모달로 뜸 — 체크박스 + 전체 선택 + "N개 이월하기"/"건너뛰기".
- 기본 전체 체크 → 빠르게 "이월하기"만 누르면 기존과 동일 동선. 선택 안 한 항목은 `rolled_at` 미마킹 → 다음에 다시 후보로 노출(놓치지 않음).
- 모달 닫음(이월/건너뛰기) 시 `localStorage.rolloverPromptDismissedOn`에 오늘 날짜 저장 → 같은 날 재오픈 시 모달 재출현 안 함.
- API 정리: `getRolloverCandidates(toDate)` + `rolloverSelectedTasks(sourceIds, toDate)`로 분리. 자동 이월(`autoRolloverOverdue`) 완전 제거.

### Added — 마크다운 링크 외부 브라우저
- 🔗 `MarkdownView`/`RichMemoEditor` 안의 링크 클릭 → `shell:openExternal` IPC로 OS 기본 브라우저에서 열림. http/https만 허용(가드).

### Schema — v3 → v4
- 신규 테이블 `notes(id, user_id, title, content, order_index, created_at, updated_at)` + 인덱스 2종(`idx_notes_user`, `idx_notes_order`).
- `applyMigrations`는 `CREATE TABLE IF NOT EXISTS`로 v3 → v4 무중단. `schema_version`이 4로 자동 갱신.

### DX
- 🛠️ **dev 빌드에서 Supabase sync 비활성화** — release와 같은 Google 계정으로 dev 로그인 시 테스트 데이터가 클라우드 통해 prod로 새는 사고 방지. 로컬 SQLite는 그대로 user 격리.
- 🛠️ production 빌드에서도 F12 / Ctrl+Shift+I로 DevTools 토글 (renderer 직접 진단용).

## [1.8.4] — 2026-05-25

### Changed — 이월(rollover) UX 단순화
- 🧹 **수동 이월 배너/체크박스 UI 제거** — 노란색 "⏰ 자동 이월되지 않은 항목" 배너, 항목별 체크박스, "선택한 N개 오늘로 이월" 버튼, "오늘 배너 닫음" 영속 상태(`rolloverBannerDismissed:YYYY-MM-DD`) 모두 삭제. 사용자가 매일 한 번 더 결정해야 했던 부담 해소.
- 📥 **자동 이월 + 토스트 1회 알림으로 통합** — 오늘 진입 시 어제 미완 항목을 자동으로 이월하고 `"📥 어제에서 N개 이월됨"` 토스트를 4초간 표시. 별도 조작 불필요.
- ⏮ **TaskCard 상세에 "어제에서 이월됨" 마크 추가** — `rollover_source_id`가 있는 task는 펼친 상세 메타 칩 영역에 `⏮ 어제에서 이월됨` 표시. 어떤 항목이 이월된 건지 한눈에 식별.

### Removed
- `database.js`: `getOverdueTasks()`, `rolloverTasks()`, `rolloverSelectedTasks()` API 삭제 — 자동 이월(`autoRolloverOverdue`)만 유지.
- `DayView.jsx`: 수동 이월 관련 상태(`overdueTasks`, `rolloverDone`, `bannerDismissed`, `selectedRolloverIds`), 핸들러(`loadOverdue`, `handleRollover`, `handleRolloverSelected`, `toggleRolloverSelect`) 전부 제거.

### Added — TaskCard 상세 메타 칩
- 펼친 상세 상단에 메타정보 칩 묶음 신규 추가: 📅 날짜(다일이면 범위), 🕒 시간, 🔁 반복 종류(매일/매주/매월/매년), 🔔 알림, ⏮ 이월 여부.
- 메모가 없는 task에는 "+ 메모 추가" 버튼 노출 — 클릭 시 TaskModal 진입.

## [1.8.3] — 2026-05-23

### Added — 노션 스타일 라이브 마크다운 에디터
- ✨ **TaskModal의 메모/완료 메모 입력**이 노션과 유사한 라이브 마크다운으로 동작 — Tiptap StarterKit + TaskList + Markdown 직렬화.
  - `# ` + space → 즉시 H1, `## ` → H2, `### ` → H3
  - `**굵게**`, `*기울임*`, `~~취소선~~`
  - `- ` → 글머리, `1. ` → 번호 리스트
  - `- [ ] ` → 체크박스 task, `- [x] ` → 완료
  - `> ` → 인용, `\`\`\`` → 코드 블록, `---` → 구분선
- 저장 형식은 그대로 **markdown 문자열** — 기존 task.memo 호환, 동기화 영향 없음.
- 표시(DayView 아코디언, RecordsView)는 readonly `MarkdownView`로 렌더 — 편집과 표시 일관된 모양.

## [1.8.2] — 2026-05-23

### Fixed
- 🔤 **Pretendard 폰트 로컬 번들링** — CDN(`jsdelivr`) `@import`에 의존하던 구조 제거. 네트워크 지연/차단 시 시스템 폰트로 fallback되며 글자 모양이 깨지던 문제 해결. `src/renderer/public/fonts/PretendardVariable.woff2`를 같이 번들 → 오프라인에서도 동일하게 보임 (`font-display: block`)

### Added — 메모 마크다운
- 📝 **task 메모 / 완료 메모에 마크다운 지원** — react-markdown + remark-gfm. `# 제목`, `**굵게**`, `- 리스트`, `- [x] 체크박스`, `| 표 |`, `\`코드\``, `> 인용`, `[링크](url)` 모두 사용 가능. 링크는 외부 브라우저에서 열림(http/s만 허용, 화이트리스트 가드).
- 👁 **TaskModal에 편집 ↔ 미리보기 토글** — 메모/완료 메모 입력 중 우상단 버튼으로 즉시 렌더 결과 확인.
- 표시되는 곳: DayView 아코디언, RecordsView 완료 기록, 클릭으로 펼침.

### Polish — 타이포그래피 위계
- ✨ **Pretendard Variable의 정밀 weight 활용** — Tailwind fontWeight 토큰을 한글 가독성에 맞게 재정의(normal 500, medium 600, semibold 680, bold 780, extrabold 860). 본문 기본 weight도 450 → 500으로 추가 상향. 한글이 영문보다 가늘게 보이는 특성을 보정 → 글자가 또렷해짐.
- 📐 **자간 정돈** — 본문 `letter-spacing: -0.005em`, 헤딩 `-0.02em`. 한글 자간이 살짝 조여져 뭉치지 않음.
- 🔢 **숫자 정렬** — `font-variant-numeric: tabular-nums` 전역 적용. 날짜·시간·진행률 숫자 폭이 통일되어 정렬이 깔끔.
- 🏷️ **큰 타이틀 격상** — 페이지 헤더(Day/Week/Month/Time Block/Habit/Review/Login)의 핵심 타이틀을 `font-bold` → `font-extrabold tracking-tight`로 강화. 위계가 더 분명해짐.
- 📝 **task 텍스트 강화** — 모든 view에서 task title 무게/명도를 통일·격상. DayView·StickerPopup 메인 list는 `font-semibold` + `text-slate-800/gray-800`, WeekView·MonthView·MorePopover의 컴팩트 task chip은 본문 상속(450)에서 `font-medium`(550)으로 명시. **task가 라벨·메타 텍스트보다 위에 위치**하도록 위계 역전 해소 — "할일이 잘 안 보인다" 개선.

### DX
- 🛠️ production 빌드에서도 **F12 / Ctrl+Shift+I**로 DevTools 토글 가능 — 사용자가 빌드된 앱에서 직접 렌더러 이슈를 진단할 수 있게 함

## [1.8.1] — 2026-05-22

### Polish
- 정렬 / 격리 / 폰트 / 타임블록 4종 폴리시 (commit `0cdad9f`)

## [1.8.0] — 2026-05-21 — Sync Engine

### Added — Plan 3 완료
- ☁️ **Local SQLite ↔ Supabase 양방향 sync**
  - `sync_queue` 로컬 테이블 — 모든 mutation 큐잉, 30초 주기 워커가 push
  - last-write-wins (updated_at 기준) 충돌 해결
  - 백그라운드 push + pull, exponential backoff (1s → 30분 상한)
  - 오프라인 모드 자동 회복 — 인터넷 복구 시 큐 자동 flush
- 🔐 **멀티 계정 격리** — 모든 데이터 테이블에 `user_id` 컬럼 추가
  - 로컬 SQLite도 user_id 필터링 → 로그아웃 후 다른 계정 로그인 시 데이터 섞이지 않음
  - Supabase RLS (`auth.uid() = user_id`)와 일관
- 🟢 **`SyncStatusBadge`** 헤더 UI — 동기화 상태(🟢 동기화됨 / 🔵 진행 중 / 🟡 오프라인 / 🔴 에러) 표시
- 로그인 직후 초기 sync — 기존 로컬 데이터를 Supabase로 batch upsert (멱등)

### Schema
- SQLite v2 → v3 마이그레이션 (`user_id` 컬럼 + `sync_queue` 테이블 + `sync_meta`)
- Supabase: `tasks`, `categories`, `monthly_goals`, `see_memos` + RLS + `updated_at` 트리거

### 신규 파일
- `src/main/sync.js` + `sync.test.js` — sync 워커 (DI 가능한 팩토리, Supabase mock 테스트)
- `src/renderer/src/components/SyncStatusBadge.jsx`
- `docs/supabase/2026-05-2X-sync-tables.sql`

## [1.7.4] — 2026-05-19

### Added
- DB에 `rolled_at` 컬럼 도입 — 이월 시점 추적 + 잔여 4건 일회성 cleanup

## [1.7.3] — 2026-05-18

### Fixed
- 🐛 rollover 폭주 hotfix — 자동 이월이 무한 반복되던 케이스 차단
- 일회성 데이터 cleanup 스크립트

## [1.7.2] — 2026-05-18

### Security
- 🔒 인증 없는 상태에서 스티커 창 데이터가 노출되던 문제 차단

## [1.7.1] — 2026-05-17

### Fixed
- 🐛 `.env`가 packaged 앱에 포함되지 않아 prod에서 OAuth 실패하던 문제 — `extraResources`로 .env를 빌드에 포함

## [1.7.0] — 2026-05-17 — 인증 토대

### Added — Plan 2 완료
- 🔐 **Google OAuth 로그인** (Supabase 경유, PKCE flow + deep link callback)
- 🗄️ **SQLite 백엔드** 전면 교체 (JSON 파일 → better-sqlite3)
  - JSON → SQLite 자동 마이그레이션 함수
  - 스키마 정의 + `openDatabase` + applyMigrations
- 🔑 secure-storage — Electron `safeStorage` 기반 파일 백엔드 저장소
- 👤 헤더 우측 사용자 칩 + 로그아웃 드롭다운
- 환경변수 로딩 모듈 (`dotenv` 기반)
- 반복 인스턴스 생성 로직 순수 함수로 분리

### Fixed
- 🐛 어제 이전 미완료 task도 자동 이월 — 주말/휴가로 인한 chain 끊김 방지
- 🐛 tray destroy 후 호출되는 race condition (`isDestroyed` 가드)
- 🐛 Electron 20.x 내장 Node용 ws transport 주입 (Supabase realtime 회피)

## [1.6.1] — 2026-05-14

### Added
- userData 자동 마이그레이션 + 타임존 통일

## [1.5.2] — 2026-05-12

### Added
- 🗑️ **WeekView · MonthView · MorePopover 에서 할일 삭제 지원**
  - WeekView/MonthView day cell 칩 — **우클릭** → confirm 다이얼로그 → 삭제
  - WeekView 사이드바 요일별 task — hover 시 ✕ 버튼 노출
  - MonthView 사이드바 일정 task(`MonthScheduledTask`) — hover 시 ✕ 버튼 노출
  - "+N개 더보기" 팝오버(`MorePopover`) — 각 항목 hover 시 ✕ 노출
  - 반복 일정의 경우 "이 날만 삭제" 처리 (DB가 `skipped_dates`에 자동 추가) — 이후 모두/전체 삭제 옵션은 DayView에서 유지
  - `TaskChip` 컴포넌트에 `onContextMenu` prop 추가

## [1.5.1] — 2026-05-12

### Added
- 📌 **스티커 메모에 진행중(▶) / 별표(★) 토글** — DayView와 동일한 UX
  - `StickerTask`에 두 버튼 추가 (완료된 task에는 숨김)
  - 진행중: 파란 배경 + ring, 별표: 진한 노란 배경 + ring (기본 스티커 배경과 구분)
  - 백엔드 정렬이 이미 진행중→별표 우선이라 스티커에서도 자동 상단 고정

### Performance
- ⚡ **DB 인메모리 캐시** — `database.js`의 `read()` 결과를 모듈 전역 캐시로 보관
  - 매 호출마다 풀-파일 `readFileSync` + `JSON.parse` + lazy migration 루프 제거
  - 토글/별표/진행중 같은 빈번한 작업의 디스크 부하 감소
  - `write()` 시 캐시 갱신 + 동기 flush로 영속성 유지
- ⚡ **반복 인스턴스 존재 확인 O(T·N) → O(T)** — `generateRepeatInstances` 최적화
  - 같은 date의 `parent_id`를 1회 스캔으로 Set화 → 템플릿별 `tasks.some()` 풀스캔 제거
  - MonthView 진입(31일 × 템플릿마다 풀스캔)에서 가장 큰 효과
- ⚡ **DayView `TaskCard` `React.memo` + 핸들러 `useCallback`**
  - 카드 1개 토글 시 나머지 카드 re-render 차단
  - 드래그 핸들러는 `draggedIdRef` / `tasksRef`로 의존성 최소화
- ⚡ **WeekView 사이드바 컴포넌트 `memo` + `loadTasks`/`loadPool` `useCallback`**
  - `days` 배열 `useMemo([start])`로 안정화

## [1.5.0] — 2026-05-11

### Added
- 📅 **다일 이벤트** — `end_date` 필드로 시작~종료 기간 지정 가능
  - TaskModal에 종료일 입력 (반복 일정일 때 자동 숨김)
  - DB: `getTasksByDate/Month/Range`가 기간 내 모든 날짜에 매칭
- 🗓️ **MonthView GCal 모드** — 사이드바 닫으면 자동 활성화
  - 셀당 칩 4개 + "+N개 더" 클릭 시 팝오버
  - 카테고리 색·시간·별표·완료 상태별 칩 디자인 5종
  - 정렬: 다일 이벤트 → ★ → 시간 있음 → 일반 → 완료
  - 셀 클릭 시 DayView로 이동 + 호버 안내 (`↗ 자세히`)
  - 좁은 화면(<800px)에서는 compact 모드로 자동 fallback
- 🔗 **다일 이벤트 가로 막대** — GCal 모드에서 시작~종료 모든 셀에 카테고리 색 막대
  - 시작/끝 셀은 둥근 모서리, 중간은 사각 (셀 사이 연결)
  - 모든 셀에 제목 표시 (truncate)
- 📋 **MorePopover 컴포넌트** — 셀별 전체 일정 모달
  - 월별/주별 공통 재사용
  - 칩 클릭 → 편집 모달, 추가 버튼 → 새 일정
- ⚡ **호버 즉시 풀 제목 표시** — 다크 풍선 tooltip
  - Electron native `title` 불안정 우회 (CSS-only)
  - 모든 칩(MonthView/WeekView/MorePopover) 공통 적용
- 📋 **WeekView "+N개 더보기"** — MonthView와 동일 패턴
  - 카드당 max 5개 + 인디고 박스 버튼
  - 카드 안 칩 클릭 → 편집 모달 직접 진입
- 🔕 **이월 배너 — 하루 한 번 정책**
  - localStorage(`rolloverBannerDismissed:YYYY-MM-DD`)에 dismiss 상태 저장
  - [✕] 닫기 또는 이월 완료 시 그날은 다시 안 뜸, 다음 날 자동 리셋

### Fixed
- 🐛 **이월 중복 표시 버그** — `getOverdueTasks`에 멱등성 추가 (이미 이월된 원본 제외)
- 🐛 **다일 이벤트 이월 폭발** — 자동/수동 이월 모두에서 다일 이벤트 제외 (이미 미래 셀에 표시 중이므로 이중 표시 방지)
- 🐛 **다일 이벤트 "기한 초과" 오표시** — 종료일 기준으로 판정 (시작일 기준 → end_date 우선)
- 🐛 **다일 이벤트 일부 셀 누락** — MonthView 매핑이 시작일에만 적용되던 문제 → 시작~종료 모든 날짜 셀에 매핑

### Changed
- DB `createTask` 시그니처에 `end_date` 추가 (반복/풀 키엔 무시)
- TaskChip + sortChips 공통 컴포넌트로 추출 (`components/MorePopover.jsx`)
- MonthView GCal 모드 셀 min-height 110px → 140px (4개 칩 + 더보기 모두 표시)
- 주별 행 `flex-shrink-0` (viewport 압박 시 줄어들지 않게 → 자동 세로 스크롤)

## [1.4.0] — 2026-05-10

### Added
- ⭐ **우선순위 별표** — `is_starred` 필드, 오늘 핵심 task 상단 고정 + 노란 배경 강조

## [1.3.0] — 2026-05-07

### Added
- 🌱 **dev/prod 데이터 분리** — `npm run dev` 시 `%APPDATA%/todostick-dev/`, prod는 기존 `%APPDATA%/todostick/`
- 🧪 **dev 모드 시드 데이터 자동 생성** — 빈 dev DB일 때 샘플 할 일/습관/카테고리 자동 삽입
- 🟡 **DEV 배지** — 헤더에 노란색 "DEV" 라벨 + 트레이/창 제목 `[DEV]` 표시 (hover 시 DB 경로 툴팁)
- IPC: `env:info` (isDev + dbPath 반환)
- 📅 **주별 뷰 — 요일 카드 접기/펴기**
  - 카드 우측 상단 ▾/▸ 토글, 기본 펴짐, 오늘은 항상 펴짐 (토글 비활성)
  - 접힌 카드는 "3건 (2 완료)" 요약 표시
  - localStorage `weekview:collapsed-days`에 상태 유지
- 📆 **월별 뷰 — 주별 행 접기/펴기**
  - 기본은 모두 접힘(빽빽함 해소), 오늘 포함 주는 자동 펴짐
  - 접힌 주는 7일 미니 도트 + 날짜만 / 펴진 주는 풀 사이즈 그리드
  - 헤더에 주차/날짜 범위/완료율 표시
  - localStorage `monthview:expanded-weeks:YYYY-MM`에 월별로 상태 유지
- 🔁 **진행중 상태(`is_in_progress`)** + 매일 자동 복사
- 🇰🇷 **한국 공휴일(2025-2027) 색상** — 토 파랑, 일·공휴일 빨강
- `utils/storage.js` — `usePersistedState` 훅 (localStorage 자동 저장)

## [1.2.0] — 2026-05-06

### Added
- 🌱 **습관 트래커**
  - `is_habit` 필드 (반복 일정 중 일부를 습관으로 마킹)
  - TaskModal에 "🌱 습관으로 추적" 체크박스 (반복 옵션 켰을 때만 노출)
  - HabitView: 12주 × 7일 GitHub 잔디 히트맵, 현재/최장 스트릭, 월 달성률
  - 오늘 미완 습관 빠른 체크 카드
  - 잔디 셀 클릭 → 직접 토글 (인스턴스 없으면 자동 생성)
- 📊 **PDS 리뷰뷰** — Look Back 6개월 막대 통계 + Look Forward 3개월 월간 목표
- ⏱ **타임블록뷰** — 6~23시 타임라인, 드래그로 블록 생성/이동/리사이즈
- 📝 **스티커 3탭화** — 오늘 / 회고(See: good/bad/next) / 메모

### Fixed
- 미배정 칩 드래그&드롭 시간 배정 안 되던 버그 (`parseInt(taskId)` → 문자열 ID 사용)
- 드롭 위치에 1시간 블록 미리보기 (점선 테두리 + 시간 라벨)
- 23:00 이후 드롭 시 시작 시간 clamp

### Changed
- DB: `getMonthlyStats`, `getMonthlyGoal`, `getSeeMemo` 추가
- `start_time`/`end_time` 필드 추가 (타임블록뷰용)

## [1.1.1] — 이전

### Fixed
- 스티커 스크롤 버그 (`setIgnoreMouseEvents`가 스크롤 이벤트 차단)
- 아이콘 zlib 실압축 (262KB → 1.2KB → 27KB 256x256)

### Added
- 이월 기능: 어제 일정만 + 선택적 이월 (`rolloverSelectedTasks`)
- 커스텀 카테고리, 인앱 알림 토스트

## [1.1.0]

### Added
- 반복 일정 (`daily`/`weekly`/`monthly` + 요일 선택)
- 카테고리 + 색상 태그
- 알림 시간
- 완료 메모

## [1.0.0]

### Added
- TodoStick 초기 셋업 (Electron + React + Vite)
- 일별 / 주별 / 월별 뷰
- 트레이 + 항상 위 스티커 팝업
- 단축키 (`Ctrl+N` 추가, `T` 오늘로)
