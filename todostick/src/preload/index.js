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
    getRolloverCandidates: (toDate) => ipcRenderer.invoke('tasks:getRolloverCandidates', toDate),
    rolloverSelected: (sourceIds, toDate) => ipcRenderer.invoke('tasks:rolloverSelected', sourceIds, toDate),
    getCompleted: (filters) => ipcRenderer.invoke('tasks:getCompleted', filters),
    getPool: (poolKey) => ipcRenderer.invoke('tasks:getPool', poolKey),
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
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    get: (id) => ipcRenderer.invoke('notes:get', id),
    create: (input) => ipcRenderer.invoke('notes:create', input),
    update: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
    delete: (id) => ipcRenderer.invoke('notes:delete', id)
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
    toggle: (templateId, date, note) => ipcRenderer.invoke('habits:toggle', templateId, date, note),
    setPaused: (templateId, paused) => ipcRenderer.invoke('habits:setPaused', templateId, paused),
    setSkip: (templateId, date, skip) => ipcRenderer.invoke('habits:setSkip', templateId, date, skip),
    create: (input) => ipcRenderer.invoke('habits:create', input),
    update: (templateId, fields) => ipcRenderer.invoke('habits:update', templateId, fields),
    reorder: (orderedIds) => ipcRenderer.invoke('habits:reorder', orderedIds),
    getRecurring: () => ipcRenderer.invoke('habits:getRecurring'),
    setIsHabit: (templateId, isHabit) => ipcRenderer.invoke('habits:setIsHabit', templateId, isHabit),
    delete: (templateId) => ipcRenderer.invoke('habits:delete', templateId)
  },
  env: {
    info: () => ipcRenderer.invoke('env:info')
  },
  app: {
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled)
  },
  auth: {
    signInWithGoogle: () => ipcRenderer.invoke('auth:signInWithGoogle'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    onStateChanged: (cb) => ipcRenderer.on('auth:state-changed', cb),
    offStateChanged: (cb) => ipcRenderer.removeListener('auth:state-changed', cb)
  },
  local: {
    // 로컬(오프라인) 프로필 — Google 없이 닉네임으로 입장
    list: () => ipcRenderer.invoke('local:list'),
    create: (nickname) => ipcRenderer.invoke('local:create', nickname),
    delete: (id) => ipcRenderer.invoke('local:delete', id),
    login: (id) => ipcRenderer.invoke('local:login', id)
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    runNow: () => ipcRenderer.invoke('sync:runNow'),
    onStatusChanged: (cb) => ipcRenderer.on('sync:status-changed', cb),
    offStatusChanged: (cb) => ipcRenderer.removeListener('sync:status-changed', cb)
  },
  shell: {
    // 마크다운 메모 안의 링크 클릭 시 외부 브라우저로 열기 — http(s)만 허용 (main에서 한 번 더 가드)
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:getState'),
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (cb) => ipcRenderer.on('updater:status', cb),
    offStatus: (cb) => ipcRenderer.removeListener('updater:status', cb)
  }
})
