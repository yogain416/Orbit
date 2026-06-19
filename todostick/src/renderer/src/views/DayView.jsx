import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { toDateStr, getTodayStr } from '../utils/date'
import { DEFAULT_CATEGORIES, getCategoryById } from '../utils/categories'
import MarkdownView from '../components/MarkdownView'
import RolloverPickerModal from '../components/RolloverPickerModal'
import { getHolidayName, getDayColorClass } from '../utils/holidays'

const ROLLOVER_PROMPT_KEY = 'rolloverPromptDismissedOn'

export default function DayView({ currentDate, onDateChange, onAddTask, onEditTask }) {
  const [tasks, setTasks] = useState([])
  const [toast, setToast] = useState(null)
  const [showCompleted, setShowCompleted] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [completionNoteTask, setCompletionNoteTask] = useState(null)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [rolloverCandidates, setRolloverCandidates] = useState(null)

  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats.length) setCategories(cats) })
  }, [])

  const dateStr = toDateStr(currentDate)
  const isToday = dateStr === getTodayStr()

  const load = useCallback(async () => {
    const data = await window.api.tasks.getByDate(dateStr)
    setTasks(data)
  }, [dateStr])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (isToday) {
        // 진행중 항목은 모달 없이 오늘로 자동 이월 (완료/진행중 해제 전까지 매일 따라옴).
        await window.api.tasks.autoRolloverInProgress(dateStr)
        if (cancelled) return
        // 그 외 미완료 항목은 사용자가 오늘 이미 모달을 닫지 않았다면 선택형 모달로 띄운다.
        const dismissedOn = localStorage.getItem(ROLLOVER_PROMPT_KEY)
        if (dismissedOn !== dateStr) {
          const candidates = await window.api.tasks.getRolloverCandidates(dateStr)
          if (cancelled) return
          if (candidates && candidates.length > 0) {
            setRolloverCandidates(candidates)
          }
        }
      }
      if (cancelled) return
      load()
    }
    run()
    return () => { cancelled = true }
  }, [load, isToday, dateStr])

  const handleRolloverConfirm = useCallback(async (selectedIds) => {
    if (selectedIds.length === 0) {
      setRolloverCandidates(null)
      localStorage.setItem(ROLLOVER_PROMPT_KEY, dateStr)
      return
    }
    const created = await window.api.tasks.rolloverSelected(selectedIds, dateStr)
    setRolloverCandidates(null)
    localStorage.setItem(ROLLOVER_PROMPT_KEY, dateStr)
    if (created && created.length > 0) {
      window.api.tasks.notifyChanged()
      setToast({ msg: `📥 ${created.length}개 이월됨 · 클릭하여 닫기` })
      load()
    }
  }, [dateStr, load])

  const handleRolloverCancel = useCallback(() => {
    setRolloverCandidates(null)
    localStorage.setItem(ROLLOVER_PROMPT_KEY, dateStr)
  }, [dateStr])

  useEffect(() => {
    const handler = () => { load() }
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  const doToggle = useCallback(async (id, note) => {
    await window.api.tasks.toggle(id, note)
    window.api.tasks.notifyChanged()
    load()
  }, [load])

  const handleToggle = useCallback((task) => {
    if (!task.is_completed) {
      setCompletionNoteTask(task)
    } else {
      doToggle(task.id, null)
    }
  }, [doToggle])

  const handleToggleInProgress = useCallback(async (task) => {
    await window.api.tasks.setInProgress(task.id, !task.is_in_progress)
    window.api.tasks.notifyChanged()
    load()
  }, [load])

  const handleToggleStarred = useCallback(async (task) => {
    await window.api.tasks.setStarred(task.id, !task.is_starred)
    window.api.tasks.notifyChanged()
    load()
  }, [load])

  const handleHold = useCallback(async (task) => {
    await window.api.tasks.setOnHold(task.id, true)
    window.api.tasks.notifyChanged()
    load()
    setToast({
      msg: `"${task.title.length > 16 ? task.title.slice(0, 16) + '…' : task.title}" 보류함`,
      undo: async () => {
        await window.api.tasks.setOnHold(task.id, false)
        window.api.tasks.notifyChanged()
        setToast(null)
        load()
      }
    })
    setTimeout(() => setToast((t) => (t && t.undo ? null : t)), 5000)
  }, [load])

  const performDelete = useCallback(async (task) => {
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
  }, [load])

  const handleDelete = useCallback((task) => {
    if (task.parent_id || task.is_template) {
      setDeleteConfirm({ task })
      return
    }
    performDelete(task)
  }, [performDelete])

  const handleDeleteAndFuture = async (task) => {
    await window.api.tasks.deleteAndFuture(task.id, dateStr)
    window.api.tasks.notifyChanged()
    setDeleteConfirm(null)
    load()
  }

  // 전체 반복 삭제 — 템플릿 + 과거/미래 모든 인스턴스 정리
  const handleDeleteAll = async (task) => {
    await window.api.tasks.deleteAndFuture(task.id, '1970-01-01')
    window.api.tasks.notifyChanged()
    setDeleteConfirm(null)
    load()
  }

  const handleDragStart = useCallback((id) => setDraggedId(id), [])
  const handleDragOver = useCallback((id) => {
    setDragOverId((prev) => (id !== draggedIdRef.current && prev !== id ? id : prev))
  }, [])
  const draggedIdRef = useRef(null)
  useEffect(() => { draggedIdRef.current = draggedId }, [draggedId])
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  const handleDrop = useCallback(async (targetId) => {
    const dragged = draggedIdRef.current
    if (!dragged || dragged === targetId) {
      setDraggedId(null); setDragOverId(null); return
    }
    const ids = tasksRef.current.map((t) => t.id)
    const from = ids.indexOf(dragged)
    const to = ids.indexOf(targetId)
    const newOrder = [...ids]
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, dragged)
    setDraggedId(null); setDragOverId(null)
    await window.api.tasks.reorder(dateStr, newOrder)
    load()
  }, [dateStr, load])
  const handleDragEnd = useCallback(() => { setDraggedId(null); setDragOverId(null) }, [])

  const onExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // 기본 정렬: ① 미완료 우선 ② 시간 있는 것 시간 오름차순(위에서 아래로) ③ 시간 없으면 별표 우선 ④ order_index
  const sortedTasks = [...tasks].sort((a, b) => {
    if (!!a.is_completed !== !!b.is_completed) return a.is_completed ? 1 : -1
    const aHas = !!a.start_time
    const bHas = !!b.start_time
    if (aHas !== bHas) return aHas ? -1 : 1
    if (aHas && bHas) {
      const cmp = a.start_time.localeCompare(b.start_time)
      if (cmp !== 0) return cmp
    }
    if (!!a.is_starred !== !!b.is_starred) return a.is_starred ? -1 : 1
    return (a.order_index ?? 0) - (b.order_index ?? 0)
  })
  const displayTasks = showCompleted ? sortedTasks : sortedTasks.filter((t) => !t.is_completed)
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
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">‹</button>
        <div className="flex items-center gap-2">
          {(() => {
            const dayColor = getDayColorClass(dateStr, currentDate.getDay())
            const titleColor = dayColor === 'red' ? 'text-red-500' : dayColor === 'blue' ? 'text-blue-500' : 'text-slate-800 dark:text-slate-100'
            const subColor = dayColor === 'red' ? 'text-red-400' : dayColor === 'blue' ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'
            const holidayName = getHolidayName(dateStr)
            return (
              <>
                <span className={`text-base font-extrabold tracking-tight ${titleColor}`}>
                  {currentDate.getMonth() + 1}월 {currentDate.getDate()}일
                </span>
                <span className={`text-sm ${subColor}`}>{DAY_KO[currentDate.getDay()]}요일</span>
                {holidayName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300 font-medium border border-red-100 dark:border-slate-700">
                    {holidayName}
                  </span>
                )}
                {isToday && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold">오늘</span>
                )}
              </>
            )
          })()}
        </div>
        <div className="flex items-center gap-1">
          {total > 0 && (
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {showCompleted ? '완료 숨기기' : '완료 보이기'}
            </button>
          )}
          <button onClick={nextDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">›</button>
        </div>
      </div>

      {/* 진행률 */}
      {total > 0 && (
        <div className="px-6 py-2 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-xs font-medium flex-shrink-0 ${allDone ? 'text-green-600 dark:text-green-300' : 'text-slate-500 dark:text-slate-400'}`}>
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
            {displayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                categories={categories}
                onToggle={handleToggle}
                onToggleInProgress={handleToggleInProgress}
                onToggleStarred={handleToggleStarred}
                onHold={handleHold}
                onEdit={onEditTask}
                onDelete={handleDelete}
                isExpanded={expandedId === task.id}
                onExpand={onExpand}
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
                className="text-xs text-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 py-1.5 transition-colors"
              >
                완료된 항목 {completed}개 더 보기 ↓
              </button>
            )}
            <button
              onClick={() => onAddTask(dateStr)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-indigo-300 hover:text-indigo-400 transition-colors text-sm mt-1"
            >
              + 할 일 추가
            </button>
          </div>
        )}
        <SeeMemo dateStr={dateStr} />
      </div>

      {/* 반복 할일 삭제 확인 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">반복 할일 삭제</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              <span className="font-medium text-slate-700 dark:text-slate-200">"{deleteConfirm.task.title}"</span>은 반복 할일입니다.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { performDelete(deleteConfirm.task); setDeleteConfirm(null) }}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                이 날만 삭제
              </button>
              <button
                onClick={() => handleDeleteAndFuture(deleteConfirm.task)}
                className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-500/40 text-sm text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
              >
                오늘 이후 모두 삭제
              </button>
              <button
                onClick={() => handleDeleteAll(deleteConfirm.task)}
                className="w-full py-2.5 rounded-xl bg-red-500 text-sm text-white hover:bg-red-600 transition-colors"
              >
                전체 반복 삭제 (과거 포함)
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 py-1 transition-colors"
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

      {/* Undo / 알림 토스트 — undo 없는 토스트(이월 등)는 클릭 시 dismiss */}
      {toast && (
        <div
          onClick={() => { if (!toast.undo) setToast(null) }}
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg text-sm ${
            toast.undo ? '' : 'cursor-pointer hover:bg-slate-700 transition-colors'
          }`}
        >
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={(e) => { e.stopPropagation(); toast.undo() }}
              className="text-indigo-300 hover:text-indigo-200 font-semibold"
            >
              취소
            </button>
          )}
        </div>
      )}

      {rolloverCandidates && (
        <RolloverPickerModal
          candidates={rolloverCandidates}
          todayStr={dateStr}
          onClose={handleRolloverCancel}
          onConfirm={handleRolloverConfirm}
        />
      )}
    </div>
  )
}

function EmptyState({ onAdd, isToday }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center text-3xl">
        {isToday ? '☀️' : '📋'}
      </div>
      <div className="text-center">
        <p className="text-slate-600 dark:text-slate-300 font-medium">{isToday ? '오늘 할 일이 없어요' : '이 날의 할 일이 없어요'}</p>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">아래 버튼으로 첫 할 일을 추가해보세요</p>
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

const REPEAT_KO = { daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' }

const TaskCard = memo(function TaskCard({ task, categories, onToggle, onToggleInProgress, onToggleStarred, onHold, onEdit, onDelete, isExpanded, onExpand, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const today = getTodayStr()
  // 다일 이벤트는 종료일이 지나야 기한 초과
  const isOverdue = !task.is_completed && ((task.end_date || task.date) < today)
  const isRepeat = task.parent_id || task.is_template
  const colorBorder = task.color ? COLOR_BORDER[task.color] : null
  const catInfo = task.category ? getCategoryById(task.category, categories) : null
  const isStarred = !!task.is_starred && !task.is_completed

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
        isStarred ? 'ring-1 ring-yellow-300 shadow-sm' : ''
      } ${
        task.is_completed
          ? 'bg-slate-50 dark:bg-slate-700/40 border-slate-100 dark:border-slate-700'
          : task.is_in_progress
          ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-slate-700 hover:border-blue-300'
          : isStarred
          ? 'bg-yellow-50 dark:bg-yellow-500/15 border-yellow-200 dark:border-slate-700 hover:border-yellow-300'
          : isOverdue
          ? 'bg-red-50 dark:bg-red-500/15 border-red-100 dark:border-slate-700 hover:border-red-200'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* 드래그 핸들 */}
        <span className="text-slate-200 dark:text-slate-600 group-hover:text-slate-300 dark:group-hover:text-slate-500 cursor-grab mt-0.5 text-sm leading-none select-none flex-shrink-0">
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
              : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'
          }`}
        >
          {task.is_completed && (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* 진행중 토글 (완료된 task에는 숨김) */}
        {!task.is_completed && (
          <button
            onClick={() => onToggleInProgress(task)}
            title={task.is_in_progress ? '진행중 해제' : '진행중으로 표시 — 다음날 자동 복사'}
            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-all ${
              task.is_in_progress
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400 hover:bg-blue-100 hover:text-blue-500'
            }`}
          >
            ▶
          </button>
        )}

        {/* 우선순위(별표) 토글 — 완료된 task에는 숨김 */}
        {!task.is_completed && (
          <button
            onClick={() => onToggleStarred(task)}
            title={task.is_starred ? '중요 해제' : '오늘 중요로 표시 — 목록 상단 고정'}
            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-sm leading-none transition-all ${
              task.is_starred
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-slate-300 dark:text-slate-500 hover:text-yellow-400'
            }`}
          >
            {task.is_starred ? '★' : '☆'}
          </button>
        )}

        {/* 내용 (클릭 시 상세 펼치기) */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onExpand(task.id)}>
          <p className={`text-sm font-semibold leading-snug ${
            task.is_completed ? 'line-through text-slate-400 dark:text-slate-500' : isOverdue ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {task.title}
            {task.is_in_progress && !task.is_completed && (
              <span className="ml-1.5 text-xs text-blue-500 font-normal">진행중</span>
            )}
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
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{task.memo}</p>
          )}
          {task.remind_at && (
            <p className="text-xs text-indigo-400 mt-0.5">🔔 {task.remind_at}</p>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {!task.is_completed && (
            <button
              onClick={() => onHold(task)}
              title="보류 — 보류 목록으로 옮김 (나중에 오늘로 복귀)"
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-300 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors"
            >
              보류
            </button>
          )}
          <button
            onClick={() => onEdit(task)}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            편집
          </button>
          <button
            onClick={() => onDelete(task)}
            className="text-xs text-red-300 dark:text-red-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 상세 아코디언 — 메타정보 칩 + 메모/완료 메모 마크다운 */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-10 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              📅 {task.end_date ? `${task.date} ~ ${task.end_date}` : task.date}
            </span>
            {(task.start_time || task.end_time) && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                🕒 {task.start_time || '?'} ~ {task.end_time || '?'}
              </span>
            )}
            {task.repeat_type && task.repeat_type !== 'none' && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                🔁 {REPEAT_KO[task.repeat_type] || task.repeat_type}
              </span>
            )}
            {task.remind_at && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                🔔 {task.remind_at}
              </span>
            )}
            {task.rollover_source_id && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                ⏮ 어제에서 이월됨
              </span>
            )}
          </div>

          {task.memo ? (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-slate-700">
              <MarkdownView text={task.memo} />
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(task) }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-500 self-start px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition-colors"
            >
              + 메모 추가
            </button>
          )}

          {task.completion_note && (
            <div className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 rounded-lg px-3 py-2.5 border border-green-100 dark:border-slate-700">
              <div className="mb-0.5">✅</div>
              <MarkdownView text={task.completion_note} />
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function SeeMemo({ dateStr }) {
  const [good, setGood] = useState('')
  const [bad, setBad] = useState('')
  const [next, setNext] = useState('')
  const ref = useRef({ good: '', bad: '', next: '' })

  useEffect(() => {
    window.api.see.get(dateStr).then((obj) => {
      const g = obj?.good || '', b = obj?.bad || '', n = obj?.next || ''
      setGood(g); setBad(b); setNext(n)
      ref.current = { good: g, bad: b, next: n }
    })
  }, [dateStr])

  const save = () => window.api.see.set(dateStr, ref.current)

  return (
    <div className="mt-5 border-t border-slate-100 dark:border-slate-700 pt-4">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">📝 오늘의 회고</p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-green-600 mb-1 block">✅ 잘된 점</label>
          <textarea
            value={good}
            onChange={(e) => { setGood(e.target.value); ref.current.good = e.target.value }}
            onBlur={save}
            rows={2}
            placeholder="오늘 잘한 것들..."
            className="w-full border border-green-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 resize-none bg-green-50 dark:bg-green-500/15 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-amber-600 mb-1 block">😅 아쉬운 점</label>
          <textarea
            value={bad}
            onChange={(e) => { setBad(e.target.value); ref.current.bad = e.target.value }}
            onBlur={save}
            rows={2}
            placeholder="오늘 아쉬웠던 것들..."
            className="w-full border border-amber-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none bg-amber-50 dark:bg-amber-500/15 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-indigo-600 mb-1 block">🔜 내일 개선할 것</label>
          <textarea
            value={next}
            onChange={(e) => { setNext(e.target.value); ref.current.next = e.target.value }}
            onBlur={save}
            rows={2}
            placeholder="내일 개선할 점..."
            className="w-full border border-indigo-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none bg-indigo-50 dark:bg-indigo-500/15 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
      </div>
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
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎉</span>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">할 일 완료!</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            <span className="font-medium text-slate-700 dark:text-slate-200 line-clamp-1">"{task.title}"</span>을 완료했어요
          </p>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">완료 메모 (선택)</label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="운동 기록, 결과, 소감 등을 남겨보세요"
            rows={3}
            className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={() => onConfirm(null)}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
