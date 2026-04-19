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
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    setToast({ message: `"${task.title}" 삭제됨`, undo: () => restoreTask(task) })
    load()
    setTimeout(() => setToast(null), 5000)
  }

  const restoreTask = async (task) => {
    await window.api.tasks.create({
      title: task.title, memo: task.memo,
      date: task.date, repeat_type: task.repeat_type, order_index: task.order_index
    })
    window.api.tasks.notifyChanged()
    setToast(null)
    load()
  }

  const completed = tasks.filter((t) => t.is_completed).length
  const total = tasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); onDateChange(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); onDateChange(d) }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-between">
        <button onClick={prevDay} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">◀</button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800">
            {dateStr} {isToday && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full ml-1">오늘</span>}
          </h2>
        </div>
        <button onClick={nextDay} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">▶</button>
      </div>

      {/* 진행률 바 */}
      {total > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">{completed}/{total} 완료</span>
        </div>
      )}

      {/* 할일 목록 */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <span className="text-4xl">📋</span>
            <p className="text-sm">아직 할 일이 없어요.</p>
            <button
              onClick={() => onAddTask(dateStr)}
              className="mt-2 text-sm text-indigo-500 hover:underline"
            >
              + 첫 할 일 추가하기
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onEdit={onEditTask}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* 추가 버튼 */}
      {tasks.length > 0 && (
        <button
          onClick={() => onAddTask(dateStr)}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50 transition-colors text-sm font-medium"
        >
          + 할 일 추가
        </button>
      )}

      {/* Undo 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center gap-3 shadow-lg text-sm">
          <span>{toast.message}</span>
          <button onClick={toast.undo} className="text-indigo-300 hover:text-indigo-200 font-medium">취소</button>
        </div>
      )}
    </div>
  )
}

function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const isOverdue = !task.is_completed && task.date < new Date().toISOString().slice(0, 10)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      task.is_completed
        ? 'bg-gray-50 border-gray-100'
        : isOverdue
        ? 'bg-red-50 border-red-100'
        : 'bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm'
    }`}>
      <button
        onClick={() => onToggle(task)}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          task.is_completed
            ? 'bg-indigo-500 border-indigo-500 text-white'
            : 'border-gray-300 hover:border-indigo-400'
        }`}
      >
        {task.is_completed && <span className="text-xs">✓</span>}
      </button>

      <span
        className={`flex-1 text-sm font-medium line-clamp-2 ${
          task.is_completed ? 'line-through text-gray-400' : isOverdue ? 'text-red-600' : 'text-gray-700'
        }`}
      >
        {task.title}
        {isOverdue && <span className="ml-1 text-xs text-red-400">기한 초과</span>}
      </span>

      <div className="flex gap-1">
        <button
          onClick={() => onEdit(task)}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
        >편집</button>
        <button
          onClick={() => onDelete(task)}
          className="text-xs text-red-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50"
        >삭제</button>
      </div>
    </div>
  )
}
