<div align="center">

# ◎ Orbit

**개인과 팀의 일정·할일·프로젝트를 잇는 데스크톱 운영 OS**

일별/주별/월별·타임블록·습관 트래커·회고까지 한 곳에서. 항상 떠 있는 스티커 메모와 클라우드 동기화로, 흐름을 놓치지 않게.

![platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![version](https://img.shields.io/github/v/release/yogain416/Orbit)
![electron](https://img.shields.io/badge/Electron-29-47848F)

[⬇️ 최신 버전 다운로드](https://github.com/yogain416/Orbit/releases/latest) · [변경 이력](todostick/CHANGELOG.md)

</div>

---

## ✨ 주요 기능

- 🗓 **다양한 뷰** — 일별 · 주별 · 월별 · **타임블록**(시간대별 배치) 로 할일을 원하는 시야로 관리
- 🌱 **습관 트래커** — 잔디 히트맵, 매일/요일/매월/**주 N회** 목표형 습관, 휴식일(skip), 요일별 성공률 통계, 한 줄 회고
- 🔁 **반복 일정 관리** — 반복 규칙·다음 발생일을 시리즈 단위로 한곳에서 편집/중지/삭제
- 📌 **스티커 모드** — 항상 위에 떠 있는 미니 메모/할일 창 (마크다운 지원)
- 📝 **회고(PDS)** — See(돌아보기) · Look Back / Look Forward 월간 목표·통계
- ☁️ **클라우드 동기화** — Google 로그인 + Supabase 기반 다기기 동기화
- 🌙 **다크모드** — 라이트 / 다크 / 시스템(Windows 설정 연동)
- 🔄 **자동 업데이트** — 새 버전이 나오면 백그라운드로 받아 재시작 시 설치
- 🚀 **부팅 시 자동 실행** + 트레이 상주 + 전역 단축키

---

## ⬇️ 다운로드 & 설치 (일반 사용자)

1. **[Releases 페이지](https://github.com/yogain416/Orbit/releases/latest)** 로 이동
2. **`Orbit-Setup-x.y.z.exe`** 를 내려받아 실행
3. 설치 후 **Google 계정으로 로그인** 하면 데이터가 동기화됩니다

> **⚠️ "Windows의 PC 보호" 경고가 뜨면?**
> 아직 코드 서명 인증서가 없어서 SmartScreen이 경고를 띄웁니다(정상).
> **`추가 정보`** → **`실행`** 을 누르면 설치됩니다.

### 🔄 업데이트는 자동
한 번 설치하면 이후 새 버전은 **앱이 알아서 감지·다운로드**합니다.
다 받으면 **설정 ▸ 일반 ▸ 업데이트** 에서 *지금 재시작* 을 누르거나, 다음에 앱을 껐다 켜면 적용됩니다.

---

## 🛠 개발 (개발자)

### 사전 준비
- Node.js 18+ / npm
- Windows (better-sqlite3 네이티브 빌드 기준)

### 설정
```bash
cd todostick
npm install --legacy-peer-deps     # tiptap peer 충돌 회피
```

리포 루트(또는 `todostick/`)에 **`.env`** 파일을 만들고 키를 채웁니다:
```dotenv
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
# Google Calendar/Tasks 동기화(선택)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 실행
```bash
npm run dev        # 개발 모드 (userData → %APPDATA%/todostick-dev, 시드 자동 생성)
npm test           # vitest
```
> 개발 모드는 **별도 userData 폴더**를 써서 실제 사용자 데이터를 건드리지 않습니다(헤더에 `DEV` 배지 표시).

---

## 📦 빌드 & 릴리스

```bash
npm run build      # 렌더러/메인/프리로드 번들
npm run package    # 설치 파일만 로컬 생성 (release/)
```

### 새 버전 배포 (GitHub Releases + 자동 업데이트)
1. `todostick/package.json` 의 `version` 을 올린다 (예: `1.9.0` → `1.9.1`)
2. 토큰 설정 — gh CLI 로그인 상태면: `PowerShell> $env:GH_TOKEN = (gh auth token)`
3. `npm run release` — 빌드 후 **draft 릴리스**로 자동 업로드
4. GitHub에서 해당 릴리스를 **Publish** → 기존 사용자 앱이 자동 감지

> `latest.yml` · `*.exe` · `*.exe.blockmap` 세 파일이 릴리스에 올라가야 자동 업데이트가 동작합니다(`npm run release` 가 자동 처리).

---

## 🧱 기술 스택

| 영역 | 사용 |
|---|---|
| 셸 | Electron 29 + electron-vite + electron-builder (NSIS) |
| UI | React 18 + Tailwind CSS 3 + Tiptap(마크다운 에디터) |
| 로컬 DB | better-sqlite3 |
| 동기화/인증 | Supabase (Google OAuth) |
| 자동 업데이트 | electron-updater (GitHub Releases) |

---

## 🗂 리포지토리 구조 & 브랜치

```
TODO/
├── todostick/          # Orbit 앱 (Electron + React) — 실제 제품 코드
│   ├── src/main/        # 메인 프로세스 (DB, 인증, 동기화, 업데이트)
│   ├── src/preload/     # IPC 브리지
│   ├── src/renderer/    # React UI (views, components)
│   └── CHANGELOG.md     # 변경 이력
├── ORBIT_기획서.md
└── README.md
```

| 브랜치 | 용도 |
|---|---|
| `master` | 통합 / 기획 문서 베이스 |
| `feat/orbit-plan-4-google-sync` | 현재 개발 라인 (Google Calendar/Tasks 양방향 sync, 목표 v2.0.0) |

---

<div align="center">
<sub>© 2026 Orbit · All rights reserved.</sub>
</div>
