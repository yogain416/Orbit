import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { JSONFileSyncPreset } from "lowdb/node";
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require2 = __cjs_mod__.createRequire(import.meta.url);
const dbPath = join(app.getPath("userData"), "todostick.json");
const db = JSONFileSyncPreset(dbPath, { tasks: [] });
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
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
function createStickerWindow() {
  const { width: sw, height: sh } = require2("electron").screen.getPrimaryDisplay().workAreaSize;
  const x = sw - 300;
  const y = sh - 380;
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
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    stickerWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#sticker`);
  } else {
    stickerWindow.loadFile(join(__dirname, "../renderer/index.html"), { hash: "sticker" });
  }
  stickerWindow.on("closed", () => {
    stickerWindow = null;
  });
}
function createTray() {
  const iconPath = join(__dirname, "../../resources/icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip("TodoStick");
  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
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
        app.isQuitting = true;
        app.quit();
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
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.todostick");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  createMainWindow();
  createStickerWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform === "darwin") app.quit();
});
ipcMain.handle("tasks:getByDate", (_, date) => db$1.getTasksByDate(date));
ipcMain.handle("tasks:getByMonth", (_, year, month) => db$1.getTasksByMonth(year, month));
ipcMain.handle("tasks:getByWeek", (_, startDate, endDate) => db$1.getTasksByRange(startDate, endDate));
ipcMain.handle("tasks:create", (_, task) => db$1.createTask(task));
ipcMain.handle("tasks:update", (_, id, fields) => db$1.updateTask(id, fields));
ipcMain.handle("tasks:delete", (_, id) => db$1.deleteTask(id));
ipcMain.handle("tasks:toggle", (_, id) => db$1.toggleTask(id));
ipcMain.on("tasks:changed", () => {
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
});
ipcMain.on("window:startDrag", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setMovable(true);
});
ipcMain.on("window:openMain", () => {
  mainWindow?.show();
  mainWindow?.focus();
});
ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
