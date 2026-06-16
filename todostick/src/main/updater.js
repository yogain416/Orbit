// ── 자동 업데이트 (electron-updater + GitHub Releases) ──────────────
// 흐름: 앱 시작 후 잠깐 뒤에 GitHub Releases를 조회 → 새 버전이 있으면
// 백그라운드로 자동 다운로드 → 받으면 렌더러에 알림(상태 배지/설정 화면) →
// 사용자가 '지금 재시작'을 누르거나 다음 종료 시 설치된다.
//
// dev 빌드에서는 동작하지 않는다(electron-updater는 패키징된 앱에서만 의미가 있고,
// dev에서 호출하면 "update check is only available in packaged" 에러를 던진다).
import pkg from 'electron-updater'
const { autoUpdater } = pkg

// 렌더러로 보내는 업데이트 상태 단계.
// idle | checking | available | not-available | downloading | downloaded | error
let _state = { status: 'idle', info: null, progress: null, error: null }
let _send = () => {}
let _isDev = false
let _wired = false

function setState(patch) {
  _state = { ..._state, ...patch }
  try {
    _send('updater:status', _state)
  } catch {
    // 창이 닫혔거나 아직 준비 전 — 무시
  }
}

export function getUpdaterState() {
  return _state
}

// index.js에서 주입: 렌더러 전송 함수 + dev 여부.
export function initUpdater({ send, isDev }) {
  _send = typeof send === 'function' ? send : () => {}
  _isDev = !!isDev

  if (_isDev) {
    setState({ status: 'idle', info: { devMode: true } })
    return
  }

  // electron-builder가 dev-app-update.yml 없이도 GitHub publish 설정을 읽도록
  // autoUpdater 기본값을 사용한다. 다운로드는 자동, 설치는 사용자 트리거.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  if (!_wired) {
    _wired = true
    autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: null }))
    autoUpdater.on('update-available', (info) =>
      setState({ status: 'available', info, progress: null, error: null })
    )
    autoUpdater.on('update-not-available', (info) =>
      setState({ status: 'not-available', info, error: null })
    )
    autoUpdater.on('download-progress', (p) =>
      setState({ status: 'downloading', progress: { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond } })
    )
    autoUpdater.on('update-downloaded', (info) =>
      setState({ status: 'downloaded', info, progress: null, error: null })
    )
    autoUpdater.on('error', (err) =>
      setState({ status: 'error', error: String(err?.message || err) })
    )
  }

  // 시작 직후 조용히 한 번 확인 (네트워크/창 준비 여유로 살짝 지연).
  setTimeout(() => {
    checkForUpdates().catch(() => {})
  }, 4000)
}

// 수동/자동 업데이트 확인. dev에서는 no-op.
export async function checkForUpdates() {
  if (_isDev) {
    setState({ status: 'idle', info: { devMode: true } })
    return _state
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setState({ status: 'error', error: String(err?.message || err) })
  }
  return _state
}

// 다운로드 완료 후 즉시 재시작·설치.
export function quitAndInstall() {
  if (_isDev || _state.status !== 'downloaded') return false
  // isSilent=false(설치 UI 표시), forceRunAfter=true(설치 후 앱 재실행)
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}
