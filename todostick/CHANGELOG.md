# TodoStick Changelog

브랜치 `todostick` 의 변경 이력. Orbit 앱은 `orbit` 브랜치의 자체 CHANGELOG 참조.

## [Unreleased]

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
