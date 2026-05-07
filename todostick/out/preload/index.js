"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  tasks: {
    getByDate: (date) => electron.ipcRenderer.invoke("tasks:getByDate", date),
    getByMonth: (year, month) => electron.ipcRenderer.invoke("tasks:getByMonth", year, month),
    getByWeek: (start, end) => electron.ipcRenderer.invoke("tasks:getByWeek", start, end),
    create: (task) => electron.ipcRenderer.invoke("tasks:create", task),
    update: (id, fields) => electron.ipcRenderer.invoke("tasks:update", id, fields),
    delete: (id) => electron.ipcRenderer.invoke("tasks:delete", id),
    toggle: (id, note) => electron.ipcRenderer.invoke("tasks:toggle", id, note),
    setInProgress: (id, value) => electron.ipcRenderer.invoke("tasks:setInProgress", id, value),
    autoRolloverInProgress: (toDate) => electron.ipcRenderer.invoke("tasks:autoRolloverInProgress", toDate),
    getCompleted: (filters) => electron.ipcRenderer.invoke("tasks:getCompleted", filters),
    getPool: (poolKey) => electron.ipcRenderer.invoke("tasks:getPool", poolKey),
    getOverdue: (date) => electron.ipcRenderer.invoke("tasks:getOverdue", date),
    rollover: (toDate) => electron.ipcRenderer.invoke("tasks:rollover", toDate),
    rolloverSelected: (taskIds, toDate) => electron.ipcRenderer.invoke("tasks:rolloverSelected", taskIds, toDate),
    reorder: (date, orderedIds) => electron.ipcRenderer.invoke("tasks:reorder", date, orderedIds),
    deleteAndFuture: (id, fromDate) => electron.ipcRenderer.invoke("tasks:deleteAndFuture", id, fromDate),
    notifyChanged: () => electron.ipcRenderer.send("tasks:changed"),
    onRefresh: (cb) => electron.ipcRenderer.on("tasks:refresh", cb),
    offRefresh: (cb) => electron.ipcRenderer.removeListener("tasks:refresh", cb)
  },
  reminders: {
    onNotify: (cb) => electron.ipcRenderer.on("reminder:notify", cb),
    offNotify: (cb) => electron.ipcRenderer.removeListener("reminder:notify", cb),
    test: () => electron.ipcRenderer.invoke("reminder:test")
  },
  categories: {
    get: () => electron.ipcRenderer.invoke("categories:get"),
    set: (cats) => electron.ipcRenderer.invoke("categories:set", cats)
  },
  shortcuts: {
    get: () => electron.ipcRenderer.invoke("shortcuts:get"),
    set: (shortcuts) => electron.ipcRenderer.invoke("shortcuts:set", shortcuts)
  },
  memo: {
    get: () => electron.ipcRenderer.invoke("memo:get"),
    set: (text) => electron.ipcRenderer.invoke("memo:set", text)
  },
  window: {
    startDrag: () => electron.ipcRenderer.send("window:startDrag"),
    openMain: () => electron.ipcRenderer.send("window:openMain"),
    close: () => electron.ipcRenderer.send("window:close"),
    setSize: (w, h) => electron.ipcRenderer.send("window:setSize", w, h),
    setIgnoreMouseEvents: (ignore) => electron.ipcRenderer.send("window:setIgnoreMouseEvents", ignore)
  },
  see: {
    get: (date) => electron.ipcRenderer.invoke("see:get", date),
    set: (date, text) => electron.ipcRenderer.invoke("see:set", date, text)
  },
  review: {
    getStats: (months) => electron.ipcRenderer.invoke("review:getStats", months),
    getGoal: (ym) => electron.ipcRenderer.invoke("review:getGoal", ym),
    setGoal: (ym, text) => electron.ipcRenderer.invoke("review:setGoal", ym, text)
  },
  habits: {
    getMatrix: (fromDate, toDate) => electron.ipcRenderer.invoke("habits:getMatrix", fromDate, toDate),
    toggle: (templateId, date) => electron.ipcRenderer.invoke("habits:toggle", templateId, date)
  },
  env: {
    info: () => electron.ipcRenderer.invoke("env:info")
  }
});
