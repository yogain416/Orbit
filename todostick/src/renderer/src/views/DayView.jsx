import { useState, useEffect, useCallback } from 'react'
import { toDateStr, getTodayStr } from '../utils/date'
import { DEFAULT_CATEGORIES, getCategoryById } from '../utils/categories'

export default function DayView({ currentDate, onDateChange, onAddTask, onEditTask }) {
  const [tasks, setTasks] = useState([])
  const [toast, setToast] = useState(null)
  const [showCompleted, setShowCompleted] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [overdueTasks, setOverdueTasks] = useState([])
  const [rolloverDone, setRolloverDone] = useState(false)
  const [selectedRolloverIds, setSelectedRolloverIds] = useState(new Set())
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [completionNoteTask, setCompletionNoteTask] = useState(null)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats.length) setCategories(cats) })
  }, [])

  const dateStr = toDateStr(currentDate)
  const isToday = dateStr === getTodayStr()

  const load = useCallback(async () => {
    const data = await window.api.tasks.getByDate(dateStr)
    setTasks(data)
  }, [dateStr])

  const loadOverdue = useCallback(async () => {
    if (!isToday) { setOverdueTasks([]); return }
    const data = await window.api.tasks.getOverdue(dateStr)
    setOverdueTasks(data)
  }, [dateStr, isToday])

  useEffect(() => {
    load()
    loadOverdue()
    setRolloverDone(false)
  }, [load, loadOverdue])

  useEffect(() => {
    setSelectedRolloverIds(new Set(overdueTasks.map((t) => t.id)))
  }, [overdueTasks])

  useEffect(() => {
    const handler = () => { load(); loadOverdue() }
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load, loadOverdue])

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

  const handleDelete = (task) => {
    if (task.parent_id || task.is_template) {
      setDeleteConfirm({ task })
      return
    }
    performDelete(task)
  }

  const performDelete = async (task) => {
    const snap = { ...task }
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    load()
    setToast({
      msg: `"${task.title.length > 16 ? task.title.slice(0, 16) + '…' : task.title}" 삭제`,
      undo: async () => {
        await window.api.tasks.create({
          title: snap.title, memo: snap.memo, date: snap.date,
          repeat_type: 'none', remind_at: snap.remind_at || null
        })
        window.api.tasks.notifyChanged()
        setToast(null)
        load()
      }
    })
    setTimeout(() => setToast(null), 5000)
  }

  const handleDeleteAndFuture = async (task) => {
    await window.api.tasks.deleteAndFuture(task.id, dateStr)
    window.api.tasks.notifyChanged()
    setDeleteConfirm(null)
    load()
  }

  const handleRollover = async () => {
    await window.api.tasks.rollover(dateStr)
    setRolloverDone(true)
    setOverdueTasks([])
    load()
  }

  const handleRolloverSelected = async () => {
    if (selectedRolloverIds.size === 0) return
    await window.api.tasks.rolloverSelected([...selectedRolloverIds], dateStr)
    setRolloverDone(true)
    setOverdueTasks([])
    load()
  }

  const toggleRolloverSelect = (id) => {
    setSelectedRolloverIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDragStart = (id) => setDraggedId(id)
  const handleDragOver = (id) => { if (id !== draggedId) setDragOverId(id) }
  const handleDrop = async (targetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null); setDragOverId(null); return
    }
    const ids = tasks.map((t) => t.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    const newOrder = [...ids]
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, draggedId)
    setDraggedId(null); setDragOverId(null)
    await window.api.tasks.reorder(dateStr, newOrder)
    load()
  }
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null) }

  const displayTasks = showCompleted ? tasks : tasks.filter((t) => !t.is_completed)
  const completed = tasks.filter((t) => t.is_completed).length
  const total = tasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = total > 0 && completed === total

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); onDateChange(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); onDateChange(d) }
  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="flex flex-col h-full">
      {/* 날짜 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">‹</button>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-800">
            {currentDate.getMonth() + 1}월 {currentDate.getDate()}일
          </span>
          <span className="text-sm text-slate-500">{DAY_KO[currentDate.getDay()]}요일</span>
          {isToday && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold">오늘</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {total > 0 && (
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              {showCompleted ? '완료 숨기기' : '완료 보이기'}
            </button>
          )}
          <button onClick={nextDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">›</button>
        </div>
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

      {/* 이월 배너 */}
      {isToday && overdueTasks.length > 0 && !rolloverDone && (
        <div className="mx-6 mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-amber-700 font-medium">⏰ 어제 미완료 할일</span>
            <button
              onClick={() => setOverdueTasks([])}
              className="text-xs text-amber-400 hover:text-amber-600 transition-colors"
            >
              닫기
            </button>
          </div>
          <div className="flex flex-col gap-1 mb-2.5">
            {overdueTasks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedRolloverIds.has(t.id)}
                  onChange={() => toggleRolloverSelect(t.id)}
                  className="accent-amber-500"
                />
                <span className="truncate">{t.title}</span>
              </label>
            ))}
          </div>
          <button
            onClick={handleRolloverSelected}
            disabled={selectedRolloverIds.size === 0}
            className="text-xs px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors font-medium"
          >
            선택한 {selectedRolloverIds.size}개 오늘로 이월
          </button>
        </div>
      )}

      {/* 할일 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {total === 0 ? (
          <EmptyState onAdd={() => onAddTask(dateStr)} isToday={isToday} />
        ) : (
          <div className="flex flex-col gap-2">
            {displayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                categories={categories}
                onToggle={handleToggle}
                onEdit={onEditTask}
                onDelete={handleDelete}
                isExpanded={expandedId === task.id}
                onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                isDragging={draggedId === task.id}
                isDragOver={dragOverId === task.id}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
            {!showCompleted && completed > 0 && (
              <button
                onClick={() => setShowCompleted(true)}
                className="text-xs text-center text-slate-400 hover:text-slate-600 py-1.5 transition-colors"
              >
                완료된 항목 {completed}개 더 보기 ↓
              </button>
            )}
            <button
              onClick={() => onAddTask(dateStr)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors text-sm mt-1"
            >
              + 할 일 추가
            </button>
          </div>
        )}
      </div>

      {/* 반복 할일 삭제 확인 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">반복 할일 삭제</h3>
            <p className="text-sm text-slate-500 mb-5">
              <span className="font-medium text-slate-700">"{deleteConfirm.task.title}"</span>은 반복 할일입니다.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { performDelete(deleteConfirm.task); setDeleteConfirm(null) }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                이 날만 삭제
              </button>
              <button
                onClick={() => handleDeleteAndFuture(deleteConfirm.task)}
                className="w-full py-2.5 rounded-xl bg-red-500 text-sm text-white hover:bg-red-600 transition-colors"
              >
                이후 모두 삭제
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-sm text-slate-400 hover:text-slate-600 py-1 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 완료 메모 팝업 */}
      {completionNoteTask && (
        <CompletionNoteModal
          task={completionNoteTask}
          onConfirm={(note) => {
            doToggle(completionNoteTask.id, note)
            setCompletionNoteTask(null)
          }}
          onClose={() => setCompletionNoteTask(null)}
        />
      )}

      {/* Undo 토스트 */}
      {toast && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg text-sm">
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

const COLOR_BORDER = {
  red: 'border-l-red-400',
  orange: 'border-l-orange-400',
  yellow: 'border-l-yellow-400',
  green: 'border-l-green-400',
  blue: 'border-l-blue-400',
  purple: 'border-l-purple-400',
}

function TaskCard({ task, categories, onToggle, onEdit, onDelete, isExpanded, onExpand, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const today = getTodayStr()
  const isOverdue = !task.is_completed && task.date < today
  const isRepeat = task.parent_id || task.is_template
  const colorBorder = task.color ? COLOR_BORDER[task.color] : null
  const catInfo = task.category ? getCategoryById(task.category, categories) : null

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(task.id) }}
      onDrop={() => onDrop(task.id)}
      onDragEnd={onDragEnd}
      className={`group flex flex-col rounded-xl border transition-all ${isDragging ? 'opacity-40' : ''} ${
        isDragOver ? 'border-indigo-400 shadow-md scale-[1.01]' : ''
      } ${colorBorder ? `border-l-4 ${colorBorder}` : ''} ${
        task.is_completed
          ? 'bg-slate-50 border-slate-100'
          : isOverdue
          ? 'bg-red-50 border-red-100 hover:border-red-200'
          : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* 드래그 핸들 */}
        <span className="text-slate-200 group-hover:text-slate-300 cursor-grab mt-0.5 text-sm leading-none select-none flex-shrink-0">
          ⠿
        </span>

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

        {/* 내용 (클릭 시 메모 펼치기) */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => (task.memo || task.completion_note) && onExpand(task.id)}>
          <p className={`text-sm font-medium leading-snug ${
            task.is_completed ? 'line-through text-slate-400' : isOverdue ? 'text-red-700' : 'text-slate-700'
          }`}>
            {task.title}
            {isOverdue && <span className="ml-1.5 text-xs text-red-400 font-normal">기한 초과</span>}
            {isRepeat && <span className="ml-1.5 text-xs text-indigo-400 font-normal">🔁</span>}
            {catInfo && (
              <span
                style={{ backgroundColor: catInfo.color + '20', color: catInfo.color }}
                className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-normal"
              >
                {catInfo.label}
              </span>
            )}
          </p>
          {task.memo && !isExpanded && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{task.memo}</p>
          )}
          {task.remind_at && (
            <p className="text-xs text-indigo-400 mt-0.5">🔔 {task.remind_at}</p>
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

      {/* 메모/완료 메모 아코디언 */}
      {isExpanded && (task.memo || task.completion_note) && (
        <div className="px-4 pb-3 ml-10 flex flex-col gap-1.5">
          {task.memo && (
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
              {task.memo}
            </p>
          )}
          {task.completion_note && (
            <p className="text-xs text-green-700 leading-relaxed whitespace-pre-wrap bg-green-50 rounded-lg px-3 py-2.5 border border-green-100">
              ✅ {task.completion_note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CompletionNoteModal({ task, onConfirm, onClose }) {
  const [note, setNote] = useState('')

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirm(note.trim() || null) }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎉</span>
            <h3 className="font-bold text-slate-800">할 일 완료!</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            <span className="font-medium text-slate-700 line-clamp-1">"{task.title}"</span>을 완료했어요
          </p>
          <label className="text-xs font-medium text-slate-500 mb-1 block">완료 메모 (선택)</label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="운동 기록, 결과, 소감 등을 남겨보세요"
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={() => onConfirm(null)}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            메모 없이 완료
          </button>
          <button
            onClick={() => onConfirm(note.trim() || null)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            저장하고 완료
          </button>
        </div>
      </div>
    </div>
  )
}
