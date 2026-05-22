# Orbit Changelog

`todostick`(v1.5.2까지) → `Orbit`(v1.6.0+)으로 리브랜드된 앱의 변경 이력.
구 `orbit` 브랜치(회의노트/스티커 초기 prototype)와는 분리된 main 라인.

## [Unreleased]

### 진행 중 — Plan 4: Google Calendar/Tasks 양방향 sync
- 브랜치: `feat/orbit-plan-4-google-sync` (예정)
- 목표 버전: v1.9.0 (또는 v2.0.0)
- 핵심: PC↔Supabase에 더해 폰 Google 캘린더/Tasks와도 sync. **선택적 sync(opt-in)** 도입 — `tasks.sync_to_google` 컬럼으로 레코드별 토글, OFF 전환 시 Google에서 삭제
- 상세: `docs/superpowers/plans/2026-05-20-orbit-plan-4-google-sync.md`

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
