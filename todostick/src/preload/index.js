import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  tasks: {
    getByDate: (date) => ipcRenderer.invoke('tasks:getByDate', date),
    getByMonth: (year, month) => ipcRenderer.invoke('tasks:getByMonth', year, month),
    getByWeek: (start, end) => ipcRenderer.invoke('tasks:getByWeek', start, end),
    create: (task) => ipcRenderer.invoke('tasks:create', task),
    update: (id, fields) => ipcRenderer.invoke('tasks:update', id, fields),
    delete: (id) => ipcRenderer.invoke('tasks:delete', id),
    toggle: (id, note) => ipcRenderer.invoke('tasks:toggle', id, note),
    getCompleted: (filters) => ipcRenderer.invoke('tasks:getCompleted', filters),
    getOverdue: (date) => ipcRenderer.invoke('tasks:getOverdue', date),
    rollover: (toDate) => ipcRenderer.invoke('tasks:rollover', toDate),
    reorder: (date, orderedIds) => ipcRenderer.invoke('tasks:reorder', date, orderedIds),
    deleteAndFuture: (id, fromDate) => ipcRenderer.invoke('tasks:deleteAndFuture', id, fromDate),
    notifyChanged: () => ipcRenderer.send('tasks:changed'),
    onRefresh: (cb) => ipcRenderer.on('tasks:refresh', cb),
    offRefresh: (cb) => ipcRenderer.removeListener('tasks:refresh', cb)
  },
  shortcuts: {
    get: () => ipcRenderer.invoke('shortcuts:get'),
    set: (shortcuts) => ipcRenderer.invoke('shortcuts:set', shortcuts)
  },
  window: {
    startDrag: () => ipcRenderer.send('window:startDrag'),
    openMain: () => ipcRenderer.send('window:openMain'),
    close: () => ipcRenderer.send('window:close'),
    setSize: (w, h) => ipcRenderer.send('window:setSize', w, h),
    setIgnoreMouseEvents: (ignore) => ipcRenderer.send('window:setIgnoreMouseEvents', ignore)
  }
})
