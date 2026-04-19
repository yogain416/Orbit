import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import db from './database.js'

let mainWindow = null
let stickerWindow = null
let tray = null

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

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // X버튼 클릭 → 트레이로 최소화 (종료 안함)
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
  // 마지막 저장 위치 불러오기 (없으면 우측 하단 기본값)
  const { width: sw, height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize
  const x = sw - 300
  const y = sh - 380

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

  stickerWindow.on('closed', () => {
    stickerWindow = null
  })
}

function createTray() {
  // 16×16 PNG 아이콘 (nativeImage로 빈 이미지 대신 색상 있는 아이콘 생성)
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const row = Math.floor(i / size)
    const col = i % size
    const inCircle = Math.pow(col - 7.5, 2) + Math.pow(row - 7.5, 2) < 49
    buf[i * 4] = inCircle ? 99 : 0
    buf[i * 4 + 1] = inCircle ? 102 : 0
    buf[i * 4 + 2] = inCircle ? 241 : 0
    buf[i * 4 + 3] = inCircle ? 255 : 0
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size })

  tray = new Tray(icon)
  tray.setToolTip('TodoStick')

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: '메인 창 열기', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      {
        label: stickerWindow ? '스티커 숨기기' : '스티커 팝업 열기',
        click: () => {
          if (stickerWindow) {
            stickerWindow.close()
          } else {
            createStickerWindow()
          }
          updateMenu()
        }
      },
      { type: 'separator' },
      { label: '종료', click: () => { app.isQuitting = true; app.quit() } }
    ])
    tray.setContextMenu(contextMenu)
  }

  updateMenu()
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.todostick')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createMainWindow()
  createStickerWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// 모든 창이 닫혀도 트레이가 있으면 앱 유지
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit()
  // Windows: 트레이로 계속 실행
})

// IPC: 할일 CRUD
ipcMain.handle('tasks:getByDate', (_, date) => db.getTasksByDate(date))
ipcMain.handle('tasks:getByMonth', (_, year, month) => db.getTasksByMonth(year, month))
ipcMain.handle('tasks:getByWeek', (_, startDate, endDate) => db.getTasksByRange(startDate, endDate))
ipcMain.handle('tasks:create', (_, task) => db.createTask(task))
ipcMain.handle('tasks:update', (_, id, fields) => db.updateTask(id, fields))
ipcMain.handle('tasks:delete', (_, id) => db.deleteTask(id))
ipcMain.handle('tasks:toggle', (_, id) => db.toggleTask(id))

// IPC: 스티커 ↔ 메인 창 실시간 동기화
ipcMain.on('tasks:changed', () => {
  mainWindow?.webContents.send('tasks:refresh')
  stickerWindow?.webContents.send('tasks:refresh')
})

// IPC: 스티커 창 드래그 이동
ipcMain.on('window:startDrag', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setMovable(true)
  // Electron 내장 드래그는 CSS -webkit-app-region으로 처리 (아래 참고)
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
