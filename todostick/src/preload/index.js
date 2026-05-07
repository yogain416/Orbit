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
    setInProgress: (id, value) => ipcRenderer.invoke('tasks:setInProgress', id, value),
    setStarred: (id, value) => ipcRenderer.invoke('tasks:setStarred', id, value),
    autoRolloverInProgress: (toDate) => ipcRenderer.invoke('tasks:autoRolloverInProgress', toDate),
    getCompleted: (filters) => ipcRenderer.invoke('tasks:getCompleted', filters),
    getPool: (poolKey) => ipcRenderer.invoke('tasks:getPool', poolKey),
    getOverdue: (date) => ipcRenderer.invoke('tasks:getOverdue', date),
    rollover: (toDate) => ipcRenderer.invoke('tasks:rollover', toDate),
    rolloverSelected: (taskIds, toDate) => ipcRenderer.invoke('tasks:rolloverSelected', taskIds, toDate),
    reorder: (date, orderedIds) => ipcRenderer.invoke('tasks:reorder', date, orderedIds),
    deleteAndFuture: (id, fromDate) => ipcRenderer.invoke('tasks:deleteAndFuture', id, fromDate),
    notifyChanged: () => ipcRenderer.send('tasks:changed'),
    onRefresh: (cb) => ipcRenderer.on('tasks:refresh', cb),
    offRefresh: (cb) => ipcRenderer.removeListener('tasks:refresh', cb)
  },
  reminders: {
    onNotify: (cb) => ipcRenderer.on('reminder:notify', cb),
    offNotify: (cb) => ipcRenderer.removeListener('reminder:notify', cb),
    test: () => ipcRenderer.invoke('reminder:test'),
  },
  categories: {
    get: () => ipcRenderer.invoke('categories:get'),
    set: (cats) => ipcRenderer.invoke('categories:set', cats),
  },
  shortcuts: {
    get: () => ipcRenderer.invoke('shortcuts:get'),
    set: (shortcuts) => ipcRenderer.invoke('shortcuts:set', shortcuts)
  },
  memo: {
    get: () => ipcRenderer.invoke('memo:get'),
    set: (text) => ipcRenderer.invoke('memo:set', text)
  },
  window: {
    startDrag: () => ipcRenderer.send('window:startDrag'),
    openMain: () => ipcRenderer.send('window:openMain'),
    close: () => ipcRenderer.send('window:close'),
    setSize: (w, h) => ipcRenderer.send('window:setSize', w, h),
    setIgnoreMouseEvents: (ignore) => ipcRenderer.send('window:setIgnoreMouseEvents', ignore)
  },
  see: {
    get: (date) => ipcRenderer.invoke('see:get', date),
    set: (date, text) => ipcRenderer.invoke('see:set', date, text)
  },
  review: {
    getStats: (months) => ipcRenderer.invoke('review:getStats', months),
    getGoal: (ym) => ipcRenderer.invoke('review:getGoal', ym),
    setGoal: (ym, text) => ipcRenderer.invoke('review:setGoal', ym, text)
  },
  habits: {
    getMatrix: (fromDate, toDate) => ipcRenderer.invoke('habits:getMatrix', fromDate, toDate),
    toggle: (templateId, date) => ipcRenderer.invoke('habits:toggle', templateId, date)
  },
  env: {
    info: () => ipcRenderer.invoke('env:info')
  }
})
