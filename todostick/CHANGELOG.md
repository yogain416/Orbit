# TodoStick Changelog

브랜치 `todostick` 의 변경 이력. Orbit 앱은 `orbit` 브랜치의 자체 CHANGELOG 참조.

## [Unreleased]

### Added
- 🌱 **dev/prod 데이터 분리** — `npm run dev` 시 `%APPDATA%/todostick-dev/`, prod는 기존 `%APPDATA%/todostick/`
- 🧪 **dev 모드 시드 데이터 자동 생성** — 빈 dev DB일 때 샘플 할 일/습관/카테고리 자동 삽입
- 🟡 **DEV 배지** — 헤더에 노란색 "DEV" 라벨 + 트레이/창 제목 `[DEV]` 표시 (hover 시 DB 경로 툴팁)
- IPC: `env:info` (isDev + dbPath 반환)

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
