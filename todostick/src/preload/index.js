import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  tasks: {
    getByDate: (date) => ipcRenderer.invoke('tasks:getByDate', date),
    getByMonth: (year, month) => ipcRenderer.invoke('tasks:getByMonth', year, month),
    getByWeek: (start, end) => ipcRenderer.invoke('tasks:getByWeek', start, end),
    create: (task) => ipcRenderer.invoke('tasks:create', task),
    update: (id, fields) => ipcRenderer.invoke('tasks:update', id, fields),
    delete: (id) => ipcRenderer.invoke('tasks:delete', id),
    toggle: (id) => ipcRenderer.invoke('tasks:toggle', id),
    notifyChanged: () => ipcRenderer.send('tasks:changed'),
    onRefresh: (cb) => ipcRenderer.on('tasks:refresh', cb),
    offRefresh: (cb) => ipcRenderer.removeListener('tasks:refresh', cb)
  }
})
