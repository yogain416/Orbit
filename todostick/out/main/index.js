"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const node = require("lowdb/node");
const dbPath = path.join(electron.app.getPath("userData"), "todostick.json");
const db = node.JSONFileSyncPreset(dbPath, { tasks: [] });
function read() {
  db.read();
  return db.data;
}
function write() {
  db.write();
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
const db$1 = {
  getTasksByDate(date) {
    const { tasks } = read();
    return tasks.filter((t) => t.date === date).sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));
  },
  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const { tasks } = read();
    return tasks.filter((t) => t.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index);
  },
  getTasksByRange(startDate, endDate) {
    const { tasks } = read();
    return tasks.filter((t) => t.date >= startDate && t.date <= endDate).sort((a, b) => a.date.localeCompare(b.date) || a.order_index - b.order_index);
  },
  createTask({ title, memo = "", date, repeat_type = "none", order_index = 0 }) {
    const { tasks } = read();
    const task = {
      id: generateId(),
      title,
      memo,
      date,
      is_completed: false,
      repeat_type,
      order_index,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    tasks.push(task);
    write();
    return task;
  },
  updateTask(id, fields) {
    const { tasks } = read();
    const task = tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, fields, { updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    write();
    return task;
  },
  toggleTask(id) {
    const { tasks } = read();
    const task = tasks.find((t) => t.id === id);
    if (!task) return null;
    task.is_completed = !task.is_completed;
    task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    write();
    return task;
  },
  deleteTask(id) {
    const data = read();
    data.tasks = data.tasks.filter((t) => t.id !== id);
    write();
    return { id };
  }
};
let mainWindow = null;
let stickerWindow = null;
let tray = null;
function createMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (utils.is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });
  mainWindow.on("close", (e) => {
    if (!electron.app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createStickerWindow() {
  const { width: sw, height: sh } = electron.screen.getPrimaryDisplay().workAreaSize;
  const x = sw - 300;
  const y = sh - 380;
  stickerWindow = new electron.BrowserWindow({
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
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    stickerWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#sticker`);
  } else {
    stickerWindow.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "sticker" });
  }
  stickerWindow.on("closed", () => {
    stickerWindow = null;
  });
}
function createTray() {
  const iconPath = path.join(__dirname, "../../resources/icon.png");
  const icon = electron.nativeImage.createFromPath(iconPath);
  tray = new electron.Tray(icon);
  tray.setToolTip("TodoStick");
  const updateMenu = () => {
    const contextMenu = electron.Menu.buildFromTemplate([
      { label: "메인 창 열기", click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      } },
      {
        label: stickerWindow ? "스티커 숨기기" : "스티커 팝업 열기",
        click: () => {
          if (stickerWindow) {
            stickerWindow.close();
          } else {
            createStickerWindow();
          }
          updateMenu();
        }
      },
      { type: "separator" },
      { label: "종료", click: () => {
        electron.app.isQuitting = true;
        electron.app.quit();
      } }
    ]);
    tray.setContextMenu(contextMenu);
  };
  updateMenu();
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.todostick");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createMainWindow();
  createStickerWindow();
  createTray();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform === "darwin") electron.app.quit();
});
electron.ipcMain.handle("tasks:getByDate", (_, date) => db$1.getTasksByDate(date));
electron.ipcMain.handle("tasks:getByMonth", (_, year, month) => db$1.getTasksByMonth(year, month));
electron.ipcMain.handle("tasks:getByWeek", (_, startDate, endDate) => db$1.getTasksByRange(startDate, endDate));
electron.ipcMain.handle("tasks:create", (_, task) => db$1.createTask(task));
electron.ipcMain.handle("tasks:update", (_, id, fields) => db$1.updateTask(id, fields));
electron.ipcMain.handle("tasks:delete", (_, id) => db$1.deleteTask(id));
electron.ipcMain.handle("tasks:toggle", (_, id) => db$1.toggleTask(id));
electron.ipcMain.on("tasks:changed", () => {
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
});
electron.ipcMain.on("window:startDrag", (event) => {
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  if (win) win.setMovable(true);
});
electron.ipcMain.on("window:openMain", () => {
  mainWindow?.show();
  mainWindow?.focus();
});
electron.ipcMain.on("window:close", (event) => {
  electron.BrowserWindow.fromWebContents(event.sender)?.close();
});
