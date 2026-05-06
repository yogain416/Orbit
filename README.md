# TODO Workspace (monorepo)

여러 데스크톱 앱과 기획 문서를 한 git 리포지토리에서 브랜치별로 관리합니다.

## 폴더 구조

```
TODO/
├── todostick/          # TodoStick 앱 (Electron + React)
├── 기획서.md            # TodoStick 기획서
├── ORBIT_기획서.md      # Orbit 기획서
└── (orbit 브랜치에 orbit/ 폴더)
```

## 브랜치 정책

| 브랜치 | 용도 | CHANGELOG |
|---|---|---|
| `master` | 통합 / 기획 문서 베이스 | — |
| `todostick` | TodoStick 앱 개발 | [`todostick/CHANGELOG.md`](todostick/CHANGELOG.md) |
| `orbit` | Orbit 앱 개발 | `orbit/CHANGELOG.md` (해당 브랜치 참조) |

**원칙:**
- 각 앱의 변경 이력은 **해당 앱 폴더의 `CHANGELOG.md`** 에 기록 → 브랜치별로 자동 분리됨
- 커밋 메시지에는 어느 앱 변경인지 prefix 없이도 파일 경로로 구분됨 (`todostick/...` vs `orbit/...`)
- 두 앱이 모두 영향받는 변경은 `master` 머지 시점에 통합

## 개발 환경 분리

### TodoStick
- `npm run dev` → `%APPDATA%/todostick-dev/` (시드 데이터 자동, DEV 배지)
- 프로덕션 빌드 → `%APPDATA%/todostick/` (기존 사용자 데이터 그대로)
- 자세한 내용: [`todostick/CHANGELOG.md`](todostick/CHANGELOG.md)

### Orbit
- `orbit` 브랜치 체크아웃 후 별도 README 참조

## 원격

- GitHub: [DDOIT-OFFICIAL/todostick](https://github.com/DDOIT-OFFICIAL/todostick) (private)
