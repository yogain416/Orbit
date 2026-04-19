import { useState, useEffect, useCallback } from 'react'
import { getTodayStr } from '../utils/date'

export default function StickerPopup() {
  const [tasks, setTasks] = useState([])
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState(null)
  const today = getTodayStr()

  const load = useCallback(async () => {
    const data = await window.api.tasks.getByDate(today)
    setTasks(data)
  }, [today])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => load()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  // 날짜 자정 자동 갱신
  useEffect(() => {
    const now = new Date()
    const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
    const timer = setTimeout(() => load(), msToMidnight + 100)
    return () => clearTimeout(timer)
  }, [load])

  const handleToggle = async (task) => {
    await window.api.tasks.toggle(task.id)
    window.api.tasks.notifyChanged()
    load()
  }

  const handleDelete = async (task) => {
    const snapshot = { ...task }
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    load()
    setToast({ msg: `"${task.title.slice(0, 12)}..." 삭제됨`, undo: async () => {
      await window.api.tasks.create({
        title: snapshot.title, memo: snapshot.memo,
        date: snapshot.date, repeat_type: snapshot.repeat_type, order_index: snapshot.order_index
      })
      window.api.tasks.notifyChanged()
      load()
      setToast(null)
    }})
    setTimeout(() => setToast(null), 5000)
  }

  // 드래그: CSS -webkit-app-region 방식 (헤더에 style 적용)

  const completed = tasks.filter((t) => t.is_completed).length
  const total = tasks.length
  const allDone = total > 0 && completed === total

  return (
    <div className="flex flex-col h-screen select-none">
      {/* 헤더 (드래그 영역) */}
      <div
        style={{ WebkitAppRegion: 'drag' }}
        className="flex items-center justify-between px-3 py-2 bg-yellow-400 rounded-t-xl cursor-grab"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📌</span>
          <span className="text-xs font-bold text-yellow-900">오늘 할 일</span>
          {total > 0 && (
            <span className="text-xs text-yellow-800 font-medium">
              {completed}/{total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
          <button
            onClick={() => window.api.window.openMain()}
            className="text-yellow-800 hover:text-yellow-900 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300"
            title="메인 창 열기"
          >
            ↗
          </button>
        </div>
      </div>

      {/* 할일 목록 */}
      {!collapsed && (
        <>
          <div className="flex-1 overflow-y-auto bg-yellow-50 px-2 py-2 flex flex-col gap-1.5">
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-1">
                <span className="text-2xl">🎉</span>
                <p className="text-xs">오늘은 할 일이 없어요!</p>
              </div>
            ) : allDone ? (
              <div className="flex flex-col items-center justify-center h-full gap-1">
                <span className="text-2xl">✅</span>
                <p className="text-xs text-green-600 font-medium">모두 완료!</p>
              </div>
            ) : (
              tasks.map((task) => (
                <StickerTask key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
              ))
            )}
          </div>

          {/* 진행률 바 */}
          {total > 0 && !allDone && (
            <div className="bg-yellow-50 px-2 pb-2">
              <div className="h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-300"
                  style={{ width: `${(completed / total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Undo 토스트 */}
          {toast && (
            <div className="bg-gray-800 text-white text-xs px-2 py-1.5 flex items-center justify-between gap-2">
              <span className="truncate">{toast.msg}</span>
              <button onClick={toast.undo} className="text-yellow-300 hover:text-yellow-200 flex-shrink-0">취소</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StickerTask({ task, onToggle, onDelete }) {
  const isOverdue = !task.is_completed && task.date < new Date().toISOString().slice(0, 10)

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group ${
      task.is_completed ? 'opacity-60' : isOverdue ? 'bg-red-100' : 'bg-white shadow-sm'
    }`}>
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
