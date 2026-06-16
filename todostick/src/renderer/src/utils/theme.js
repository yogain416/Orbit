// 다크모드 테마 관리 — 메인 창과 스티커 창이 같은 origin이라 localStorage를 공유한다.
// 따라서 IPC 없이 localStorage 한 곳에 저장하면 두 창 모두에서 읽히고, 재시작에도 유지된다.
//
// 저장값(THEME_KEY): 'light' | 'dark' | 'system'
//   - 'system'은 OS(Windows)의 다크모드 설정(prefers-color-scheme)을 그대로 따른다.
// 적용: <html>(documentElement)에 .dark 클래스를 토글 → Tailwind darkMode:'class'가 반응.

export const THEME_KEY = 'orbit-theme'
export const THEME_OPTIONS = ['light', 'dark', 'system']

const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

// 저장된 사용자 선택(기본 'system').
export function getStoredTheme() {
  const v = localStorage.getItem(THEME_KEY)
  return THEME_OPTIONS.includes(v) ? v : 'system'
}

// 선택값을 실제 light/dark로 해석 (system이면 OS 설정 반영).
export function resolveTheme(pref = getStoredTheme()) {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return mq().matches ? 'dark' : 'light'
}

// <html>에 .dark 토글.
export function applyTheme(pref = getStoredTheme()) {
  const resolved = resolveTheme(pref)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

// 선택값 저장 + 즉시 적용. (storage 이벤트로 다른 창에도 전파됨)
export function setTheme(pref) {
  localStorage.setItem(THEME_KEY, pref)
  applyTheme(pref)
}

// 앱 부팅 시 1회 호출 — 초기 적용 + OS 변경/다른 창 변경 구독.
export function initTheme() {
  applyTheme()
  // OS 다크모드 변경 시 'system' 선택이면 따라간다.
  try {
    mq().addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system')
    })
  } catch {
    // 구형 Safari 등 — addEventListener 미지원 시 무시
  }
  // 다른 창(메인↔스티커)에서 테마를 바꾸면 이 창에도 즉시 반영.
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) applyTheme()
  })
}
