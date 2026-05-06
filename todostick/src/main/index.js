import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, Notification, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import db from './database.js'

let mainWindow = null
let stickerWindow = null
let tray = null
let reminderTimers = []

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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
      sandbox: false
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
  if (!tray) return
  const contextMenu = Menu.buildFromTemplate([
    { label: '메인 창 열기', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    {
      label: stickerWindow ? '스티커 숨기기' : '스티커 열기',
      click: () => {
        if (stickerWindow) {
          stickerWindow.close()
        } else {
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
  tray.setToolTip('TodoStick')
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.todostick')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createMainWindow()
  createStickerWindow()
  createTray()
  registerShortcuts()
  scheduleReminders()
  scheduleMidnightRefresh()

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
  return result
})
ipcMain.handle('tasks:update', (_, id, fields) => {
  const result = db.updateTask(id, fields)
  if (fields.remind_at !== undefined) scheduleReminders()
  return result
})
ipcMain.handle('tasks:delete', (_, id) => db.deleteTask(id))
ipcMain.handle('tasks:toggle', (_, id, note) => db.toggleTask(id, note))

// IPC: 미완료 이월
ipcMain.handle('tasks:getOverdue', (_, date) => db.getOverdueTasks(date))
ipcMain.handle('tasks:rollover', (_, toDate) => {
  const result = db.rolloverTasks(toDate)
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
  return result
})
ipcMain.handle('tasks:rolloverSelected', (_, taskIds, toDate) => {
  const result = db.rolloverSelectedTasks(taskIds, toDate)
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
  return result
})

// IPC: 순서 변경
ipcMain.handle('tasks:reorder', (_, date, orderedIds) => db.reorderTasks(date, orderedIds))

// IPC: 반복 할일 이후 모두 삭제
ipcMain.handle('tasks:deleteAndFuture', (_, id, fromDate) => db.deleteTaskAndFuture(id, fromDate))

// IPC: 완료 기록 조회
ipcMain.handle('tasks:getCompleted', (_, filters) => db.getCompletedTasks(filters))

// IPC: 카테고리 관리
ipcMain.handle('categories:get', () => db.getCategories())
ipcMain.handle('categories:set', (_, categories) => db.setCategories(categories))

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
ipcMain.handle('see:set', (_, date, text) => { db.setSeeMemo(date, text); return true })

// IPC: PDS — Look Back / Look Forward
ipcMain.handle('review:getStats', (_, months) => db.getMonthlyStats(months))
ipcMain.handle('review:getGoal', (_, ym) => db.getMonthlyGoal(ym))
ipcMain.handle('review:setGoal', (_, ym, text) => { db.setMonthlyGoal(ym, text); return true })

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
