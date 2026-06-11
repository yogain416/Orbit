import { getCategoryById } from '../utils/categories'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

// 칩 정렬: 진행중(0순위) → 다일이벤트 → ★ → 시간 → 일반 → 완료(맨 아래)
export function sortChips(tasks) {
  return tasks.slice().sort((a, b) => {
    if (!!a.is_completed !== !!b.is_completed) return a.is_completed ? 1 : -1
    // 진행중이 최우선 (완료 제외 후 가장 위)
    const aInProg = !!a.is_in_progress
    const bInProg = !!b.is_in_progress
    if (aInProg !== bInProg) return aInProg ? -1 : 1
    const aMulti = !!a.end_date
    const bMulti = !!b.end_date
    if (aMulti !== bMulti) return aMulti ? -1 : 1
    if (aMulti && bMulti) return a.date.localeCompare(b.date)
    if (!!a.is_starred !== !!b.is_starred) return a.is_starred ? -1 : 1
    const aHasTime = !!a.start_time
    const bHasTime = !!b.start_time
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1
    if (aHasTime && bHasTime) return a.start_time.localeCompare(b.start_time)
    return (a.order_index || 0) - (b.order_index || 0)
  })
}

// 호버 시 즉시 전체 제목 표시 (Electron native tooltip 우회)
function HoverTip({ children }) {
  return (
    <span className="invisible group-hover/chip:visible absolute z-50 left-0 -top-7 bg-slate-800 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none max-w-[280px] truncate">
      {children}
    </span>
  )
}

export function TaskChip({ task, categories, onClick, onContextMenu, cellDate, weekStart, weekEnd }) {
  const cat = task.category ? getCategoryById(task.category, categories) : null
  const color = cat?.color || '#94A3B8'
  const isCompleted = !!task.is_completed
  const hasTime = !!task.start_time
  const isStarred = !!task.is_starred && !isCompleted
  const isMultiDay = !!task.end_date
  const fullTitle = isMultiDay
    ? `${task.title} (${task.date} ~ ${task.end_date})`
    : hasTime
    ? `${task.start_time} ${task.title}`
    : task.title

  if (isMultiDay && cellDate) {
    const isStart = task.date === cellDate || (weekStart && task.date < weekStart && cellDate === weekStart)
    const isEnd = task.end_date === cellDate || (weekEnd && task.end_date > weekEnd && cellDate === weekEnd)
    const radiusClass = `${isStart ? 'rounded-l' : ''} ${isEnd ? 'rounded-r' : ''}`
    return (
      <div className="relative group/chip min-w-0" style={{ marginLeft: isStart ? 0 : '-4px', marginRight: isEnd ? 0 : '-4px' }}>
        <button
          onClick={onClick}
          onContextMenu={onContextMenu}
          title={fullTitle}
          className={`flex items-center gap-1 px-1 py-0.5 text-left transition-opacity ${radiusClass} ${isCompleted ? 'opacity-50' : 'hover:opacity-90'} min-w-0 w-full`}
          style={{ backgroundColor: color }}
        >
          <span className={`text-[11px] truncate text-white font-medium ${isCompleted ? 'line-through' : ''}`}>
            {task.title}
          </span>
        </button>
        <HoverTip>{fullTitle}</HoverTip>
      </div>
    )
  }

  if (isStarred) {
    return (
      <div className="relative group/chip min-w-0">
        <button
          onClick={onClick}
          onContextMenu={onContextMenu}
          title={fullTitle}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-left bg-yellow-100 hover:bg-yellow-200 transition-colors min-w-0 w-full"
        >
          <span className="text-yellow-600 text-[10px] flex-shrink-0">★</span>
          {hasTime && <span className="text-[10px] text-yellow-700 font-medium flex-shrink-0">{task.start_time}</span>}
          <span className="text-[11px] font-medium text-yellow-900 truncate">{task.title}</span>
        </button>
        <HoverTip>{fullTitle}</HoverTip>
      </div>
    )
  }

  if (hasTime) {
    return (
      <div className="relative group/chip min-w-0">
        <button
          onClick={onClick}
          onContextMenu={onContextMenu}
          title={fullTitle}
          className={`flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 transition-colors min-w-0 w-full ${isCompleted ? 'opacity-50' : ''}`}
        >
          <span className="w-0.5 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
          <span className={`text-[10px] font-medium flex-shrink-0 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-600'}`}>
            {task.start_time}
          </span>
          <span className={`text-[11px] font-medium truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.title}
          </span>
        </button>
        <HoverTip>{fullTitle}</HoverTip>
      </div>
    )
  }

  return (
    <div className="relative group/chip min-w-0">
      <button
        onClick={onClick}
        title={fullTitle}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 transition-colors min-w-0 w-full ${isCompleted ? 'opacity-50' : ''}`}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className={`text-[11px] font-medium truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </span>
      </button>
      <HoverTip>{fullTitle}</HoverTip>
    </div>
  )
}

export default function MorePopover({ date, tasks, categories, onClose, onEditTask, onAddTask, onDeleteTask }) {
  const sorted = sortChips(tasks)
  const d = new Date(date + 'T00:00:00')
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-80 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-800">{label}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-base leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {sorted.map((task) => (
            <div key={task.id} className="mb-0.5 flex items-center gap-1 group/row">
              <div className="flex-1 min-w-0">
                <TaskChip
                  task={task}
                  categories={categories}
                  onClick={() => { onEditTask && onEditTask(task); onClose() }}
                />
              </div>
              {onDeleteTask && (
                <button
                  onClick={() => onDeleteTask(task)}
                  title="삭제"
                  className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-400 text-xs flex-shrink-0 transition-opacity px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {onAddTask && (
          <button
            onClick={() => { onAddTask(date); onClose() }}
            className="px-4 py-2 border-t border-slate-100 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors text-center"
          >
            + 할일 추가
          </button>
        )}
      </div>
    </div>
  )
}
