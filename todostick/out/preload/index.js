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
    toggle: (id) => electron.ipcRenderer.invoke("tasks:toggle", id),
    notifyChanged: () => electron.ipcRenderer.send("tasks:changed"),
    onRefresh: (cb) => electron.ipcRenderer.on("tasks:refresh", cb),
    offRefresh: (cb) => electron.ipcRenderer.removeListener("tasks:refresh", cb)
  },
  window: {
    startDrag: () => electron.ipcRenderer.send("window:startDrag"),
    openMain: () => electron.ipcRenderer.send("window:openMain"),
    close: () => electron.ipcRenderer.send("window:close")
  }
});
