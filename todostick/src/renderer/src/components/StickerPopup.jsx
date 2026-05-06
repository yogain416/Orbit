import { useState, useEffect, useCallback, useRef } from 'react'
import { getTodayStr } from '../utils/date'

const STICKER_W = 280
const STICKER_H_FULL = 360
const STICKER_H_COLLAPSED = 46

const STICKER_COLOR_DOT = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
}

const TABS = [
  { id: 'today', label: '오늘' },
  { id: 'see', label: '회고' },
  { id: 'memo', label: '메모' },
]

const TAB_TITLES = {
  today: '오늘 할 일',
  see: '오늘의 회고',
  memo: '메모장',
}

export default function StickerPopup() {
  const [tasks, setTasks] = useState([])
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState(null)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [showCompleted, setShowCompleted] = useState(true)
  const [completionNoteTask, setCompletionNoteTask] = useState(null)
  const [activeTab, setActiveTab] = useState('today')
  const [memoText, setMemoText] = useState('')
  const [seeGood, setSeeGood] = useState('')
  const [seeBad, setSeeBad] = useState('')
  const [seeNext, setSeeNext] = useState('')
  const seeRef = useRef({ good: '', bad: '', next: '' })
  const today = getTodayStr()

  const load = useCallback(async () => {
    const data = await window.api.tasks.getByDate(today)
    setTasks(data)
  }, [today])

  const loadMemo = useCallback(async () => {
    const text = await window.api.memo.get()
    setMemoText(text || '')
  }, [])

  const loadSee = useCallback(async () => {
    const obj = await window.api.see.get(today)
    const g = obj?.good || '', b = obj?.bad || '', n = obj?.next || ''
    setSeeGood(g); setSeeBad(b); setSeeNext(n)
    seeRef.current = { good: g, bad: b, next: n }
  }, [today])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (activeTab === 'memo') loadMemo()
    if (activeTab === 'see') loadSee()
  }, [activeTab, loadMemo, loadSee])

  useEffect(() => {
    const handler = () => load()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  useEffect(() => {
    const now = new Date()
    const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
    const timer = setTimeout(() => load(), msToMidnight + 100)
    return () => clearTimeout(timer)
  }, [load])

  // 스티커 영역 밖 클릭이 다른 앱으로 통과되도록 처리
  // mouseenter/mouseleave는 Alt+Tab 전환 시 mouseleave가 누락되어 클릭 차단 버그 발생
  // mousemove + elementFromPoint 방식으로 실시간 판별
  useEffect(() => {
    const onMouseMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isInteractive = !!el?.closest('button, input, textarea, a, [role="button"], [data-drag], [data-scroll]')
      window.api.window.setIgnoreMouseEvents(!isInteractive)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.api.window.setIgnoreMouseEvents(true)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    window.api.window.setSize(STICKER_W, next ? STICKER_H_COLLAPSED : STICKER_H_FULL)
    if (next) setShowQuickAdd(false)
  }

  const handlePlusClick = () => {
    if (collapsed) {
      setCollapsed(false)
      setActiveTab('today')
      window.api.window.setSize(STICKER_W, STICKER_H_FULL)
      setShowQuickAdd(true)
      setQuickTitle('')
    } else if (activeTab !== 'today') {
      setActiveTab('today')
      setShowQuickAdd(true)
      setQuickTitle('')
    } else {
      setShowQuickAdd((v) => !v)
      setQuickTitle('')
    }
  }

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setShowQuickAdd(false)
    setQuickTitle('')
  }

  const handleToggle = (task) => {
    if (!task.is_completed) {
      setCompletionNoteTask(task)
    } else {
      doToggle(task.id, null)
    }
  }

  const doToggle = async (id, note) => {
    await window.api.tasks.toggle(id, note)
    window.api.tasks.notifyChanged()
    load()
  }

  const handleDelete = async (task) => {
    const snapshot = { ...task }
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    load()
    setToast({
      msg: `"${task.title.slice(0, 12)}${task.title.length > 12 ? '...' : ''}" 삭제됨`,
      undo: async () => {
        await window.api.tasks.create({
          title: snapshot.title, memo: snapshot.memo,
          date: snapshot.date, repeat_type: snapshot.repeat_type, order_index: snapshot.order_index
        })
        window.api.tasks.notifyChanged()
        load()
        setToast(null)
      }
    })
    setTimeout(() => setToast(null), 5000)
  }

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return
    await window.api.tasks.create({ title: quickTitle.trim(), date: today, repeat_type: 'none', order_index: tasks.length })
    window.api.tasks.notifyChanged()
    setQuickTitle('')
    setShowQuickAdd(false)
    load()
  }

  const handleQuickKeyDown = (e) => {
    if (e.key === 'Enter') handleQuickAdd()
    if (e.key === 'Escape') { setShowQuickAdd(false); setQuickTitle('') }
  }

  const handleMemoBlur = async () => {
    await window.api.memo.set(memoText)
  }

  const handleSeeSave = async () => {
    await window.api.see.set(today, seeRef.current)
  }

  const completed = tasks.filter((t) => t.is_completed).length
  const total = tasks.length
  const allDone = total > 0 && completed === total
  const displayTasks = showCompleted ? tasks : tasks.filter((t) => !t.is_completed)

  return (
    <div className={`flex flex-col h-screen select-none overflow-hidden rounded-xl ${collapsed ? 'bg-transparent' : 'bg-yellow-50'}`}>
      {/* 헤더 (드래그 영역) */}
      <div
        data-drag
        style={{ WebkitAppRegion: 'drag' }}
        className={`flex items-center justify-between px-3 py-2 bg-yellow-400 cursor-grab flex-shrink-0 ${collapsed ? 'rounded-xl' : 'rounded-t-xl'}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📌</span>
          <span className="text-xs font-bold text-yellow-900">{TAB_TITLES[activeTab]}</span>
          {activeTab === 'today' && total > 0 && (
            <span className="text-xs text-yellow-800 font-medium">{completed}/{total}</span>
          )}
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={handlePlusClick}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300 font-bold"
            title="할일 추가"
          >
            +
          </button>
          {!collapsed && activeTab === 'today' && total > 0 && (
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
              title={showCompleted ? '완료 숨기기' : '완료 보이기'}
            >
              {showCompleted ? '👁' : '🙈'}
            </button>
          )}
          <button
            onClick={toggleCollapse}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
            title={collapsed ? '펼치기' : '접기'}
          >
            {collapsed ? '▼' : '▲'}
          </button>
          <button
            onClick={() => window.api.window.openMain()}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
            title="메인 창 열기"
          >
            ↗
          </button>
          <button
            onClick={() => window.api.window.close()}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
            title="닫기 (트레이 우클릭으로 다시 열기)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 탭 바 */}
      {!collapsed && (
        <div className="flex bg-yellow-300 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 text-xs py-1 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-yellow-50 text-yellow-900'
                  : 'text-yellow-800 hover:bg-yellow-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 빠른 추가 입력 */}
      {!collapsed && showQuickAdd && (
        <div className="bg-yellow-100 px-2 py-1.5 flex gap-1.5 flex-shrink-0">
          <input
            autoFocus
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={handleQuickKeyDown}
            placeholder="할 일 입력 후 Enter"
            className="flex-1 text-xs border border-yellow-300 rounded px-2 py-1 bg-white outline-none focus:border-yellow-500"
          />
          <button
            onClick={handleQuickAdd}
            className="text-xs bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600"
          >
            추가
          </button>
        </div>
      )}

      {/* 컨텐츠 영역 */}
      {!collapsed && (
        <>
          {/* 오늘 탭 */}
          {activeTab === 'today' && (
            <>
              <div data-scroll className="flex-1 overflow-y-auto bg-yellow-50 px-2 py-2 flex flex-col gap-1.5">
                {total === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                    <span className="text-2xl">🎉</span>
                    <p className="text-xs">오늘은 할 일이 없어요!</p>
                    <button
                      onClick={() => setShowQuickAdd(true)}
                      className="text-xs text-yellow-700 bg-yellow-200 hover:bg-yellow-300 px-3 py-1 rounded-full"
                    >
                      + 할일 추가
                    </button>
                  </div>
                ) : allDone ? (
                  <div className="flex flex-col items-center justify-center h-full gap-1">
                    <span className="text-2xl">✅</span>
                    <p className="text-xs text-green-600 font-medium">모두 완료!</p>
                  </div>
                ) : (
                  displayTasks.map((task) => (
                    <StickerTask key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
                  ))
                )}
              </div>
              {total > 0 && !allDone && (
                <div className="bg-yellow-50 px-2 pb-2 flex-shrink-0">
                  <div className="h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 transition-all duration-300"
                      style={{ width: `${(completed / total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* 회고 탭 (See) */}
          {activeTab === 'see' && (
            <div data-scroll className="flex-1 bg-yellow-50 px-2 pt-2 pb-1 flex flex-col gap-1.5 overflow-y-auto">
              <p className="text-xs text-yellow-700 font-semibold flex-shrink-0">📝 Plan → Do → See</p>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-yellow-800 font-medium">✅ 잘된 점</label>
                <textarea
                  data-scroll
                  value={seeGood}
                  onChange={(e) => { setSeeGood(e.target.value); seeRef.current.good = e.target.value }}
                  onBlur={handleSeeSave}
                  rows={2}
                  placeholder="오늘 잘한 것들..."
                  className="resize-none text-xs bg-white border border-yellow-200 rounded px-2 py-1 outline-none text-gray-700 leading-relaxed"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-amber-700 font-medium">😅 아쉬운 점</label>
                <textarea
                  data-scroll
                  value={seeBad}
                  onChange={(e) => { setSeeBad(e.target.value); seeRef.current.bad = e.target.value }}
                  onBlur={handleSeeSave}
                  rows={2}
                  placeholder="오늘 아쉬웠던 것들..."
                  className="resize-none text-xs bg-white border border-yellow-200 rounded px-2 py-1 outline-none text-gray-700 leading-relaxed"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-indigo-700 font-medium">🔜 내일 개선할 것</label>
                <textarea
                  data-scroll
                  value={seeNext}
                  onChange={(e) => { setSeeNext(e.target.value); seeRef.current.next = e.target.value }}
                  onBlur={handleSeeSave}
                  rows={2}
                  placeholder="내일 개선할 점..."
                  className="resize-none text-xs bg-white border border-yellow-200 rounded px-2 py-1 outline-none text-gray-700 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* 메모 탭 */}
          {activeTab === 'memo' && (
            <div className="flex-1 bg-yellow-50 px-2 pt-2 pb-1 flex flex-col">
              <textarea
                data-scroll
                value={memoText}
                onChange={(e) => setMemoText(e.target.value)}
                onBlur={handleMemoBlur}
                placeholder="자유롭게 메모하세요..."
                className="flex-1 resize-none text-xs bg-yellow-50 outline-none text-gray-700 placeholder-gray-400 leading-relaxed"
              />
            </div>
          )}

          {/* Undo 토스트 */}
          {toast && (
            <div className="bg-gray-800 text-white text-xs px-2 py-1.5 flex items-center justify-between gap-2 flex-shrink-0">
              <span className="truncate">{toast.msg}</span>
              <button onClick={toast.undo} className="text-yellow-300 hover:text-yellow-200 flex-shrink-0">취소</button>
            </div>
          )}
        </>
      )}

      {/* 완료 메모 팝업 */}
      {completionNoteTask && (
        <StickerCompletionNote
          task={completionNoteTask}
          onConfirm={(note) => { doToggle(completionNoteTask.id, note); setCompletionNoteTask(null) }}
          onClose={() => setCompletionNoteTask(null)}
        />
      )}
    </div>
  )
}

function StickerCompletionNote({ task, onConfirm, onClose }) {
  const [note, setNote] = useState('')

  return (
    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-xl">
      <div className="bg-white rounded-xl shadow-xl mx-2 w-full" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 pt-3 pb-2">
          <p className="text-xs font-bold text-slate-700 mb-0.5">🎉 완료!</p>
          <p className="text-xs text-slate-500 truncate mb-2">"{task.title}"</p>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirm(note.trim() || null) }
            }}
            placeholder="완료 메모 (선택, Enter로 저장)"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-400 resize-none"
          />
        </div>
        <div className="flex gap-1.5 px-3 pb-3">
          <button onClick={() => onConfirm(null)} className="flex-1 text-xs text-slate-500 hover:bg-slate-100 py-1.5 rounded-lg">
            메모 없이
          </button>
          <button onClick={() => onConfirm(note.trim() || null)} className="flex-1 text-xs bg-indigo-600 text-white py-1.5 rounded-lg hover:bg-indigo-700">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

function StickerTask({ task, onToggle, onDelete }) {
  const isOverdue = !task.is_completed && task.date < new Date().toISOString().slice(0, 10)
  const colorDot = task.color ? STICKER_COLOR_DOT[task.color] : null

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group ${
      task.is_completed ? 'opacity-60' : isOverdue ? 'bg-red-100' : 'bg-white shadow-sm'
    }`}>
      {colorDot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorDot}`} />
      )}
      <button
        onClick={() => onToggle(task)}
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          task.is_completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-yellow-500'
        }`}
      >
        {task.is_completed && <span className="text-[9px]">✓</span>}
      </button>

      <span className={`flex-1 text-xs leading-tight line-clamp-2 ${
        task.is_completed ? 'line-through text-gray-400' : 'text-gray-700'
      }`}>
        {task.title}
      </span>

      <button
        onClick={() => onDelete(task)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs flex-shrink-0 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
