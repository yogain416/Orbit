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

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createStickerWindow() {
  stickerWindow = new BrowserWindow({
    width: 280,
    height: 320,
    x: 1600,
    y: 800,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const stickerUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}#/sticker`
    : join(__dirname, '../renderer/index.html#/sticker')

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
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('TodoStick')

  const contextMenu = Menu.buildFromTemplate([
    { label: '메인 창 열기', click: () => mainWindow?.show() },
    { label: '스티커 팝업 열기', click: () => { if (!stickerWindow) createStickerWindow() } },
    { type: 'separator' },
    { label: '종료', click: () => { app.exit() } }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
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
