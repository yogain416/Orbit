// ⚠️ setup-paths가 가장 먼저 평가되어야 함 (database.js 평가 전에 setPath 호출 필요)
import { isDev } from './setup-paths.js'
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut } from 'electron'
import { migrateUserData } from './userdata-migration.js'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import db, { setCurrentUserId, claimOwnership, performInitialSync, getRawDb } from './database.js'
import { getAuth } from './auth.js'
import { getSupabaseClient } from './supabase.js'
import { createSyncEngine } from './sync.js'

// Supabase 콘솔의 Redirect URLs에 등록된 스킴. spec/auth.js의 REDIRECT_URL과 호스트가 일치해야 한다.
const AUTH_PROTOCOL_SCHEME = 'app'

let mainWindow = null
let stickerWindow = null
let tray = null
let reminderTimers = []

// ── Plan 3 (sync engine): 워커 + 현재 user id 추적 ────────────
// engine은 lazy-init — auth 세션이 처음 잡힐 때 만들어진다.
let _syncEngine = null
let _currentUid = null

function getOrCreateSyncEngine() {
  if (_syncEngine) return _syncEngine
  _syncEngine = createSyncEngine({
    getClient: () => getSupabaseClient(),
    getDb: () => getRawDb(),
    getUserId: () => _currentUid
  })
  // status 변경 시 모든 창에 broadcast — SyncStatusBadge가 구독.
  _syncEngine.onChange((status) => {
    mainWindow?.webContents.send('sync:status-changed', status)
    stickerWindow?.webContents.send('sync:status-changed', status)
  })
  return _syncEngine
}

// 인증된 user에 sync 시작 — claim + initial sync + start 워커.
// 멱등 — 여러 번 호출되어도 안전.
async function startSyncForUser(uid) {
  if (!uid) return
  if (_currentUid === uid && _syncEngine) return // 이미 동일 user로 동작 중
  _currentUid = uid
  setCurrentUserId(uid)
  try {
    claimOwnership(uid)
    performInitialSync(uid)
  } catch (e) {
    console.error('[sync] initial sync prep failed:', e)
  }
  const engine = getOrCreateSyncEngine()
  engine.start()
}

function stopSync() {
  _syncEngine?.stop()
  _currentUid = null
  setCurrentUserId(null)
}

// mutation 직후 즉시 push 트리거 — 큐 쌓임 + 30s polling 기다리지 않고 보냄.
// 단, runOnce 동시 실행을 막기 위해 짧은 debounce.
let _flushTimer = null
function triggerSyncFlush() {
  if (!_syncEngine || !_currentUid) return
  if (_flushTimer) return
  _flushTimer = setTimeout(() => {
    _flushTimer = null
    _syncEngine?.runOnce().catch(() => {})
  }, 300)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 820,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: isDev ? 'Orbit [DEV]' : 'Orbit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createStickerWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const saved = db.getSetting('stickerPosition')
  const rawX = saved?.x ?? sw - 300
  const rawY = saved?.y ?? sh - 380
  const x = Math.max(0, Math.min(rawX, sw - 280))
  const y = Math.max(0, Math.min(rawY, sh - 100))

  stickerWindow = new BrowserWindow({
    width: 280,
    height: 360,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    stickerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#sticker`)
  } else {
    stickerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'sticker' })
  }

  stickerWindow.on('moved', () => {
    const [x, y] = stickerWindow.getPosition()
    db.setSetting('stickerPosition', { x, y })
  })

  stickerWindow.on('closed', () => {
    stickerWindow = null
    updateTrayMenu()
  })
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return
  const contextMenu = Menu.buildFromTemplate([
    { label: '메인 창 열기', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    {
      label: stickerWindow ? '스티커 숨기기' : '스티커 열기',
      click: async () => {
        if (stickerWindow) {
          stickerWindow.close()
        } else {
          // 인증 없으면 스티커는 데이터 노출 위험이라 띄우지 않는다.
          const session = await getAuth().getSession().catch(() => null)
          if (!session) {
            mainWindow?.show()
            mainWindow?.focus()
            return
          }
          createStickerWindow()
          updateTrayMenu()
        }
      }
    },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit() } }
  ])
  tray.setContextMenu(contextMenu)
}

function createTray() {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon)
  tray.setToolTip(isDev ? 'Orbit [DEV]' : 'Orbit')
  updateTrayMenu()
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

// 전역 단축키
const DEFAULT_SHORTCUTS = {
  openMain: 'Ctrl+Shift+T',
  toggleSticker: 'Ctrl+Shift+S'
}

function toElectronKey(display) {
  return display.replace('Ctrl', 'CommandOrControl')
}

function registerShortcuts() {
  globalShortcut.unregisterAll()
  const saved = db.getSetting('shortcuts') || {}
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...saved }

  try {
    globalShortcut.register(toElectronKey(shortcuts.openMain), () => {
      mainWindow?.show(); mainWindow?.focus()
    })
  } catch {}

  try {
    globalShortcut.register(toElectronKey(shortcuts.toggleSticker), () => {
      if (stickerWindow) { stickerWindow.close() } else { createStickerWindow() }
    })
  } catch {}
}

// 알림 스케줄러
function scheduleReminders() {
  reminderTimers.forEach(clearTimeout)
  reminderTimers = []

  const today = new Date().toISOString().slice(0, 10)
  const tasks = db.getTodayReminders(today)
  const now = new Date()

  tasks.forEach((task) => {
    if (!task.remind_at) return
    const [hours, minutes] = task.remind_at.split(':').map(Number)
    const reminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
    const delay = reminderTime - now
    if (delay <= 0) return

    const timer = setTimeout(() => {
      mainWindow?.webContents.send('reminder:notify', { title: task.title, remind_at: task.remind_at })
    }, delay)
    reminderTimers.push(timer)
  })
}

function scheduleMidnightRefresh() {
  const now = new Date()
  const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
  setTimeout(() => {
    scheduleReminders()
    scheduleMidnightRefresh()
  }, msToMidnight + 500)
}

// ── OAuth deep link 처리 ────────────────────────────────────
// Windows/Linux는 single-instance + second-instance argv로, macOS는 open-url 이벤트로 callback URL이 들어온다.

function extractAuthCallbackUrl(argv) {
  if (!argv) return null
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith(`${AUTH_PROTOCOL_SCHEME}://`) && arg.includes('/auth/callback')) {
      return arg
    }
  }
  return null
}

async function handleDeepLink(url) {
  if (!url) return
  try {
    const result = await getAuth().handleAuthCallback(url)
    mainWindow?.webContents.send('auth:state-changed', { session: result?.session ?? null })
    mainWindow?.show()
    mainWindow?.focus()
    refreshUserWindows()
  } catch (e) {
    console.error('[auth] callback failed:', e)
    mainWindow?.webContents.send('auth:state-changed', { session: null, error: String(e?.message || e) })
  }
}

// 인증 상태에 따라 사용자 데이터를 보여주는 창(현재는 스티커)을 토글하고
// sync 워커도 시작/중단한다.
async function refreshUserWindows() {
  try {
    const session = await getAuth().getSession()
    const uid = session?.user?.id || null

    if (uid) {
      await startSyncForUser(uid)
    } else {
      stopSync()
    }

    if (session && !stickerWindow) {
      createStickerWindow()
    } else if (!session && stickerWindow) {
      stickerWindow.close()
    }
    updateTrayMenu()
  } catch (e) {
    console.error('[auth] refreshUserWindows failed:', e)
  }
}

// custom protocol 등록 — 개발 모드에선 electron 실행 파일과 인자를 명시해야 한다.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL_SCHEME, process.execPath, [join(process.cwd(), process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL_SCHEME)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    // 이미 실행 중인 인스턴스로 OAuth callback이 들어옴 (Windows/Linux)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    const url = extractAuthCallbackUrl(argv)
    if (url) handleDeepLink(url)
  })
}

// macOS deep link
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.whenReady().then(() => {
  // v1.6.0 todostick → orbit 폴더 마이그레이션 (이전 사용자 데이터 보존)
  try {
    const userDataPath = app.getPath('userData')
    const parentDir = userDataPath.split(/[/\\]/).slice(0, -1).join('/')
    const oldDir = `${parentDir}/todostick`
    const result = migrateUserData({ oldDir, newDir: userDataPath })
    if (result.migrated) {
      console.log('[migration] todostick → orbit:', result.to)
    }
  } catch (e) {
    console.error('[migration] failed:', e)
  }

  electronApp.setAppUserModelId(isDev ? 'com.orbit.dev' : 'com.orbit')

  // dev 모드 + 빈 DB일 때 시드 데이터 자동 생성
  if (isDev) {
    const seeded = db.seedIfEmpty()
    if (seeded) console.log('[DEV] 시드 데이터 생성됨 →', db.getDbPath())
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createMainWindow()
  createTray()
  // 스티커는 인증된 세션이 있을 때만 띄운다. 처음 실행 시 secure-storage에
  // 세션이 남아있으면 자동 복원되므로 await로 한 번 확인 후 결정.
  refreshUserWindows()
  registerShortcuts()
  scheduleReminders()
  scheduleMidnightRefresh()

  // 처음 실행 시 argv에 callback URL이 들어있으면 처리 (예: 로그아웃 상태에서 외부 링크 클릭)
  const initialUrl = extractAuthCallbackUrl(process.argv)
  if (initialUrl) {
    mainWindow?.webContents.once('did-finish-load', () => handleDeepLink(initialUrl))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// IPC: 할일 CRUD
ipcMain.handle('tasks:getByDate', (_, date) => db.getTasksByDate(date))
ipcMain.handle('tasks:getByMonth', (_, year, month) => db.getTasksByMonth(year, month))
ipcMain.handle('tasks:getByWeek', (_, startDate, endDate) => db.getTasksByRange(startDate, endDate))
ipcMain.handle('tasks:create', (_, task) => {
  const result = db.createTask(task)
  if (task.remind_at) scheduleReminders()
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:update', (_, id, fields) => {
  const result = db.updateTask(id, fields)
  if (fields.remind_at !== undefined) scheduleReminders()
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:delete', (_, id) => {
  const result = db.deleteTask(id)
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:toggle', (_, id, note) => {
  const result = db.toggleTask(id, note)
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:setInProgress', (_, id, value) => {
  const result = db.setInProgress(id, value)
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:setStarred', (_, id, value) => {
  const result = db.setStarred(id, value)
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:autoRolloverOverdue', (_, toDate) => {
  const result = db.autoRolloverOverdue(toDate)
  if (result.length > 0) {
    mainWindow?.webContents.send('tasks:refresh')
    stickerWindow?.webContents.send('tasks:refresh')
    triggerSyncFlush()
  }
  return result
})

// IPC: 미완료 이월
ipcMain.handle('tasks:getOverdue', (_, date) => db.getOverdueTasks(date))
ipcMain.handle('tasks:rollover', (_, toDate) => {
  const result = db.rolloverTasks(toDate)
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
  triggerSyncFlush()
  return result
})
ipcMain.handle('tasks:rolloverSelected', (_, taskIds, toDate) => {
  const result = db.rolloverSelectedTasks(taskIds, toDate)
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
  triggerSyncFlush()
  return result
})

// IPC: 순서 변경
ipcMain.handle('tasks:reorder', (_, date, orderedIds) => {
  const result = db.reorderTasks(date, orderedIds)
  triggerSyncFlush()
  return result
})

// IPC: 반복 할일 이후 모두 삭제
ipcMain.handle('tasks:deleteAndFuture', (_, id, fromDate) => {
  const result = db.deleteTaskAndFuture(id, fromDate)
  triggerSyncFlush()
  return result
})

// IPC: 완료 기록 조회
ipcMain.handle('tasks:getCompleted', (_, filters) => db.getCompletedTasks(filters))

// IPC: 카테고리 관리
ipcMain.handle('categories:get', () => db.getCategories())
ipcMain.handle('categories:set', (_, categories) => {
  const result = db.setCategories(categories)
  triggerSyncFlush()
  return result
})

// IPC: 플래너 풀
ipcMain.handle('tasks:getPool', (_, poolKey) => db.getPoolTasks(poolKey))

// IPC: 메모장
ipcMain.handle('memo:get', () => db.getSetting('memo') || '')
ipcMain.handle('memo:set', (_, text) => { db.setSetting('memo', text); return true })

// IPC: 알림 테스트 (개발용)
ipcMain.handle('reminder:test', () => {
  mainWindow?.webContents.send('reminder:notify', { title: '테스트 알림 🎉', remind_at: '지금' })
})

// IPC: 스티커 ↔ 메인 창 실시간 동기화
ipcMain.on('tasks:changed', () => {
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
})

// IPC: 스티커 창 드래그 이동
ipcMain.on('window:startDrag', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setMovable(true)
})

// IPC: 메인 창 열기
ipcMain.on('window:openMain', () => {
  mainWindow?.show()
  mainWindow?.focus()
})

// IPC: 창 닫기
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// IPC: 단축키 설정
ipcMain.handle('shortcuts:get', () => {
  const saved = db.getSetting('shortcuts') || {}
  return { ...DEFAULT_SHORTCUTS, ...saved }
})
ipcMain.handle('shortcuts:set', (_, shortcuts) => {
  db.setSetting('shortcuts', shortcuts)
  registerShortcuts()
  return true
})

// IPC: PDS — See 회고
ipcMain.handle('see:get', (_, date) => db.getSeeMemo(date))
ipcMain.handle('see:set', (_, date, text) => {
  db.setSeeMemo(date, text)
  triggerSyncFlush()
  return true
})

// IPC: PDS — Look Back / Look Forward
ipcMain.handle('review:getStats', (_, months) => db.getMonthlyStats(months))
ipcMain.handle('review:getGoal', (_, ym) => db.getMonthlyGoal(ym))
ipcMain.handle('review:setGoal', (_, ym, text) => {
  db.setMonthlyGoal(ym, text)
  triggerSyncFlush()
  return true
})

// IPC: 환경 정보 (dev/prod 구분)
ipcMain.handle('env:info', () => ({ isDev, dbPath: db.getDbPath() }))

// IPC: 습관 트래커
ipcMain.handle('habits:getMatrix', (_, fromDate, toDate) => db.getHabitMatrix(fromDate, toDate))
ipcMain.handle('habits:toggle', (_, templateId, date) => {
  const result = db.toggleHabitOnDate(templateId, date)
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
  triggerSyncFlush()
  return result
})

// IPC: 창 크기 조절 (스티커 접기/펼치기)
ipcMain.on('window:setSize', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setSize(width, height)
})

// IPC: 마우스 이벤트 통과 (스티커 영역 밖 클릭 허용)
ipcMain.on('window:setIgnoreMouseEvents', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true })
})

// IPC: 인증
ipcMain.handle('auth:signInWithGoogle', async () => {
  return await getAuth().signInWithGoogle()
})
ipcMain.handle('auth:getSession', async () => {
  return await getAuth().getSession()
})
ipcMain.handle('auth:getUser', async () => {
  return await getAuth().getUser()
})
ipcMain.handle('auth:signOut', async () => {
  await getAuth().signOut()
  stopSync()
  mainWindow?.webContents.send('auth:state-changed', { session: null })
  refreshUserWindows()
  return true
})

// IPC: 동기화 상태 + 수동 실행
ipcMain.handle('sync:status', () => {
  if (!_syncEngine) return { queueLength: 0, lastSyncedAt: null, lastError: null, running: false }
  return _syncEngine.getStatus()
})
ipcMain.handle('sync:runNow', async () => {
  if (!_syncEngine) return { skipped: true, reason: 'no_engine' }
  return await _syncEngine.runOnce()
})
