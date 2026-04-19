import { useState, useEffect, useCallback } from 'react'
import { toDateStr, getTodayStr } from '../utils/date'

export default function DayView({ currentDate, onDateChange, onAddTask, onEditTask }) {
  const [tasks, setTasks] = useState([])
  const [toast, setToast] = useState(null)
  const dateStr = toDateStr(currentDate)
  const isToday = dateStr === getTodayStr()

  const load = useCallback(async () => {
    const data = await window.api.tasks.getByDate(dateStr)
    setTasks(data)
  }, [dateStr])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => load()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  const handleToggle = async (task) => {
    await window.api.tasks.toggle(task.id)
    window.api.tasks.notifyChanged()
    load()
  }

  const handleDelete = async (task) => {
    const snap = { ...task }
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    setToast({
      msg: `"${task.title.length > 16 ? task.title.slice(0, 16) + '…' : task.title}" 삭제`,
      undo: async () => {
        await window.api.tasks.create({ title: snap.title, memo: snap.memo, date: snap.date, repeat_type: snap.repeat_type })
        window.api.tasks.notifyChanged()
        setToast(null)
        load()
      }
    })
    load()
    setTimeout(() => setToast(null), 5000)
  }

  const completed = tasks.filter((t) => t.is_completed).length
  const total = tasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = total > 0 && completed === total

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); onDateChange(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); onDateChange(d) }

  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']
  const dayLabel = `${DAY_KO[currentDate.getDay()]}요일`

  return (
    <div className="flex flex-col h-full">
      {/* 날짜 헤더 바 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          ‹
        </button>
        <div className="text-center">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800">
              {currentDate.getMonth() + 1}월 {currentDate.getDate()}일
            </span>
            <span className="text-sm text-slate-500">{dayLabel}</span>
            {isToday && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold">오늘</span>
            )}
          </div>
        </div>
        <button onClick={nextDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          ›
        </button>
      </div>

      {/* 진행률 */}
      {total > 0 && (
        <div className="px-6 py-2 bg-white border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-xs font-medium flex-shrink-0 ${allDone ? 'text-green-600' : 'text-slate-500'}`}>
              {allDone ? '🎉 모두 완료!' : `${completed}/${total} 완료`}
            </span>
          </div>
        </div>
      )}

      {/* 할일 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {total === 0 ? (
          <EmptyState onAdd={() => onAddTask(dateStr)} isToday={isToday} />
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onEdit={onEditTask}
                onDelete={handleDelete}
              />
            ))}
            <button
              onClick={() => onAddTask(dateStr)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors text-sm mt-1"
            >
              + 할 일 추가
            </button>
          </div>
        )}
      </div>

      {/* Undo 토스트 */}
      {toast && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg text-sm animate-fade-in">
          <span>{toast.msg}</span>
          <button onClick={toast.undo} className="text-indigo-300 hover:text-indigo-200 font-semibold">취소</button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onAdd, isToday }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">
        {isToday ? '☀️' : '📋'}
      </div>
      <div className="text-center">
        <p className="text-slate-600 font-medium">{isToday ? '오늘 할 일이 없어요' : '이 날의 할 일이 없어요'}</p>
        <p className="text-slate-400 text-sm mt-1">아래 버튼으로 첫 할 일을 추가해보세요</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
      >
        + 할 일 추가
      </button>
    </div>
  )
}

function TaskCard({ task, onToggle, onEdit, onDelete }) {
  const today = getTodayStr()
  const isOverdue = !task.is_completed && task.date < today

  return (
    <div className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
      task.is_completed
        ? 'bg-slate-50 border-slate-100'
        : isOverdue
        ? 'bg-red-50 border-red-100 hover:border-red-200'
        : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
    }`}>
      {/* 체크 버튼 */}
      <button
        onClick={() => onToggle(task)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          task.is_completed
            ? 'bg-green-500 border-green-500 text-white'
            : isOverdue
            ? 'border-red-300 hover:border-red-500'
            : 'border-slate-300 hover:border-indigo-400'
        }`}
      >
        {task.is_completed && (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${
          task.is_completed ? 'line-through text-slate-400' : isOverdue ? 'text-red-700' : 'text-slate-700'
        }`}>
          {task.title}
          {isOverdue && <span className="ml-1.5 text-xs text-red-400 font-normal">기한 초과</span>}
          {task.repeat_type !== 'none' && (
            <span className="ml-1.5 text-xs text-indigo-400 font-normal">🔁</span>
          )}
        </p>
        {task.memo && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{task.memo}</p>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onEdit(task)}
          className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          편집
        </button>
        <button
          onClick={() => onDelete(task)}
          className="text-xs text-red-300 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  )
}
