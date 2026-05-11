import { useState, useEffect } from 'react'
import { getWeekRange, toDateStr, getTodayStr } from '../utils/date'
import { usePersistedState } from '../utils/storage'
import { getHolidayName, getDayColorClass } from '../utils/holidays'
import { DEFAULT_CATEGORIES } from '../utils/categories'
import MorePopover, { sortChips } from '../components/MorePopover'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']
const WEEK_MAX_CHIPS = 5

const TASK_COLOR_LEFT = {
  red: 'border-red-400',
  orange: 'border-orange-400',
  yellow: 'border-yellow-400',
  green: 'border-green-400',
  blue: 'border-blue-400',
  purple: 'border-purple-400',
}

const HABIT_COLOR_DOT = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
}

export default function WeekView({ currentDate, onDateChange, onDateClick, onAddTask, onEditTask }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const [poolTasks, setPoolTasks] = useState([])
  const [poolAddTitle, setPoolAddTitle] = useState('')
  const [habitOpen, setHabitOpen] = useState(false)
  const [dragInfo, setDragInfo] = useState(null)
  const [dragOverDate, setDragOverDate] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [popoverDate, setPopoverDate] = useState(null)
  // 접힌 요일 카드 — 날짜 문자열 array. 오늘은 자동 제외됨.
  const [collapsedDays, setCollapsedDays] = usePersistedState('weekview:collapsed-days', [])
  const { start, end, monday } = getWeekRange(currentDate)

  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats?.length) setCategories(cats) })
  }, [])

  const weekPoolKey = `W:${start}`

  const loadTasks = () => {
    window.api.tasks.getByWeek(start, end).then((tasks) => {
      const map = {}
      tasks.forEach((t) => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t) })
      setTasksByDate(map)
    })
  }

  const loadPool = () => {
    window.api.tasks.getPool(weekPoolKey).then(setPoolTasks)
  }

  useEffect(() => { loadTasks(); loadPool() }, [start, end])

  useEffect(() => {
    const handler = () => { loadTasks(); loadPool() }
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [start, end])

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); onDateChange(d) }
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); onDateChange(d) }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const today = getTodayStr()
  const weekLabel = `${monday.getMonth() + 1}월 ${Math.ceil(monday.getDate() / 7)}주차`

  const allTasks = Object.values(tasksByDate).flat()
  const weekTotal = allTasks.length
  const weekDone = allTasks.filter((t) => t.is_completed).length

  const habitMap = {}
  Object.entries(tasksByDate).forEach(([date, tasks]) => {
    tasks.filter((t) => t.parent_id).forEach((t) => {
      if (!habitMap[t.parent_id]) {
        habitMap[t.parent_id] = { title: t.title, color: t.color, byDate: {} }
      }
      habitMap[t.parent_id].byDate[date] = t
    })
  })
  const habits = Object.values(habitMap)

  const handlePoolAdd = async () => {
    if (!poolAddTitle.trim()) return
    await window.api.tasks.create({
      title: poolAddTitle.trim(),
      date: weekPoolKey,
      repeat_type: 'none',
      order_index: poolTasks.length
    })
    window.api.tasks.notifyChanged()
    setPoolAddTitle('')
    loadPool()
  }

  const handlePoolAddKeyDown = (e) => {
    if (e.key === 'Enter') handlePoolAdd()
    if (e.key === 'Escape') setPoolAddTitle('')
  }

  const handlePoolToggle = async (taskId) => {
    await window.api.tasks.toggle(taskId, null)
    window.api.tasks.notifyChanged()
    loadPool()
  }

  const handleDayTaskToggle = async (taskId) => {
    await window.api.tasks.toggle(taskId, null)
    window.api.tasks.notifyChanged()
    loadTasks()
  }

  const handleAssignToDay = async (taskId, dateStr) => {
    await window.api.tasks.update(taskId, { date: dateStr })
    window.api.tasks.notifyChanged()
    loadPool()
    loadTasks()
  }

  const handleDeletePool = async (taskId) => {
    await window.api.tasks.delete(taskId)
    window.api.tasks.notifyChanged()
    loadPool()
  }

  const handleHabitToggle = async (taskId) => {
    await window.api.tasks.toggle(taskId, null)
    window.api.tasks.notifyChanged()
  }

  const handleTaskDragStart = (e, taskId, fromDate) => {
    e.stopPropagation()
    setDragInfo({ taskId, fromDate })
  }

  const handleDayDragOver = (e, dateStr) => {
    e.preventDefault()
    setDragOverDate(dateStr)
  }

  const handleDayDrop = async (e, toDate) => {
    e.preventDefault()
    if (!dragInfo || dragInfo.fromDate === toDate) {
      setDragInfo(null); setDragOverDate(null); return
    }
    await window.api.tasks.update(dragInfo.taskId, { date: toDate })
    window.api.tasks.notifyChanged()
    setDragInfo(null)
    setDragOverDate(null)
  }

  const poolDone = poolTasks.filter((t) => t.is_completed).length
  const sidebarEmpty = poolTasks.length === 0 && days.every((d) => !(tasksByDate[toDateStr(d)]?.length))

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center">
          <span className="text-base font-bold text-slate-800">{weekLabel}</span>
          <span className="ml-2 text-xs text-slate-400">{start} ~ {end}</span>
        </div>
        <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 닫혔을 때 얇은 열기 버튼 */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="목록 열기"
            className="w-6 flex-shrink-0 bg-indigo-50 border-r border-indigo-100 hover:bg-indigo-100 flex items-center justify-center text-indigo-400 hover:text-indigo-700 transition-colors"
          >
            ▸
          </button>
        )}

        {/* ===== 왼쪽: 이번 주 할일 목록 (토글 가능) ===== */}
        {sidebarOpen && (
          <div className="w-52 border-r border-slate-200 bg-indigo-50 flex flex-col flex-shrink-0">
            {/* 사이드바 헤더 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-100 flex-shrink-0">
              <span className="text-xs font-bold text-indigo-700">
                📋 이번 주 할일
                {poolTasks.length > 0 && (
                  <span className="ml-1.5 bg-indigo-200 text-indigo-700 rounded-full px-1.5 py-0.5 font-medium">
                    {poolDone}/{poolTasks.length}
                  </span>
                )}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                title="목록 닫기"
                className="text-indigo-300 hover:text-indigo-600 text-sm leading-none px-1"
              >
                ◂
              </button>
            </div>

            {/* 할일 목록 */}
            <div className="flex-1 overflow-y-auto py-1">
              {sidebarEmpty ? (
                <p className="text-xs text-indigo-400 text-center py-6">이번 주 할일이 없어요</p>
              ) : (
                <>
                  {/* 미배정 풀 */}
                  {poolTasks.length > 0 && (
                    <div className="px-2 mb-2">
                      <p className="text-[10px] text-indigo-400 font-semibold mb-1 px-1">미배정</p>
                      {poolTasks.map((task) => (
                        <WeekSidebarPoolTask
                          key={task.id}
                          task={task}
                          days={days}
                          onToggle={handlePoolToggle}
                          onAssign={handleAssignToDay}
                          onDelete={handleDeletePool}
                        />
                      ))}
                    </div>
                  )}

                  {/* 요일별 */}
                  {days.map((day, i) => {
                    const dateStr = toDateStr(day)
                    const dayTasks = tasksByDate[dateStr] || []
                    if (dayTasks.length === 0) return null
                    const isToday = dateStr === today
                    const done = dayTasks.filter((t) => t.is_completed).length
                    return (
                      <div key={dateStr} className="px-2 mb-2">
                        <p className={`text-[10px] font-semibold mb-1 px-1 flex items-center justify-between ${
                          isToday ? 'text-indigo-600' : 'text-slate-400'
                        }`}>
                          <span>{DAY_NAMES[i]} {day.getDate()}일{isToday ? ' · 오늘' : ''}</span>
                          <span>{done}/{dayTasks.length}</span>
                        </p>
                        {dayTasks.map((task) => (
                          <WeekSidebarDayTask key={task.id} task={task} onToggle={handleDayTaskToggle} />
                        ))}
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* 하단 추가 입력 */}
            <div className="px-3 py-2 border-t border-indigo-100 flex-shrink-0">
              <input
                type="text"
                value={poolAddTitle}
                onChange={(e) => setPoolAddTitle(e.target.value)}
                onKeyDown={handlePoolAddKeyDown}
                placeholder="+ 할일 추가..."
                className="w-full text-xs bg-transparent outline-none text-slate-600 placeholder-indigo-300 border-b border-transparent focus:border-indigo-300 pb-0.5 transition-colors"
              />
            </div>
          </div>
        )}

        {/* ===== 오른쪽: 7일 그리드 + 하단 ===== */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 7일 그리드 */}
          <div className="flex-1 p-3 grid grid-cols-7 gap-2 overflow-hidden">
            {days.map((day, i) => {
              const dateStr = toDateStr(day)
              const tasks = tasksByDate[dateStr] || []
              const completed = tasks.filter((t) => t.is_completed).length
              const isToday = dateStr === today
              const dayColor = getDayColorClass(dateStr, day.getDay())
              const holidayName = getHolidayName(dateStr)
              // 오늘은 강제 펴짐. collapsedDays에 있고 오늘이 아닐 때만 접힘.
              const isCollapsed = !isToday && collapsedDays.includes(dateStr)

              const toggleCollapse = (e) => {
                e.stopPropagation()
                if (isToday) return
                setCollapsedDays((prev) =>
                  prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
                )
              }

              return (
                <div
                  key={dateStr}
                  onClick={() => onDateClick(dateStr)}
                  onDragOver={(e) => handleDayDragOver(e, dateStr)}
                  onDrop={(e) => handleDayDrop(e, dateStr)}
                  onDragLeave={() => setDragOverDate(null)}
                  className={`flex flex-col rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                    dragOverDate === dateStr ? 'border-indigo-400 bg-indigo-50 shadow-md' :
                    isToday ? 'border-indigo-400 bg-indigo-50 shadow-sm' :
                    'border-slate-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  {/* 날짜 헤더 — 우측 토글 버튼 */}
                  <div className={`relative py-2 rounded-t-xl ${isToday ? 'bg-indigo-500' : 'bg-slate-50'} ${isCollapsed ? 'rounded-b-xl' : ''}`}>
                    <div className="text-center">
                      <div className={`text-xs font-medium ${
                        isToday ? 'text-indigo-100' :
                        dayColor === 'red' ? 'text-red-400' :
                        dayColor === 'blue' ? 'text-blue-400' :
                        'text-slate-500'
                      }`}>
                        {DAY_NAMES[i]}
                      </div>
                      <div
                        title={holidayName || undefined}
                        className={`text-sm font-bold ${
                          isToday ? 'text-white' :
                          dayColor === 'red' ? 'text-red-500' :
                          dayColor === 'blue' ? 'text-blue-500' :
                          'text-slate-700'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                    {!isToday && (
                      <button
                        onClick={toggleCollapse}
                        title={isCollapsed ? '펴기' : '접기'}
                        className={`absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${
                          isCollapsed
                            ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                            : 'text-slate-300 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {isCollapsed ? '▸' : '▾'}
                      </button>
                    )}
                  </div>

                  {/* 접혔을 때: 요약만 표시 */}
                  {isCollapsed ? (
                    tasks.length > 0 && (
                      <div className="px-2 py-1.5 flex items-center justify-center gap-1 text-xs text-slate-500">
                        <span className="font-medium">{tasks.length}건</span>
                        {completed > 0 && (
                          <span className={`text-[10px] ${completed === tasks.length ? 'text-green-600' : 'text-slate-400'}`}>
                            ({completed} 완료)
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    <>
                      {/* 할일 미리보기 */}
                      <div className="flex-1 p-1.5 flex flex-col gap-0.5">
                        {sortChips(tasks).slice(0, WEEK_MAX_CHIPS).map((task) => (
                          <div key={task.id} className="relative group/chip">
                            <div
                              draggable
                              onDragStart={(e) => handleTaskDragStart(e, task.id, dateStr)}
                              onClick={(e) => { e.stopPropagation(); onEditTask && onEditTask(task) }}
                              className={`text-xs px-1.5 py-0.5 rounded truncate border-l-2 cursor-pointer hover:bg-indigo-100 active:opacity-50 ${
                                task.is_completed
                                  ? 'bg-slate-100 text-slate-400 line-through border-slate-300'
                                  : `bg-indigo-50 text-indigo-700 ${task.color ? TASK_COLOR_LEFT[task.color] : 'border-transparent'}`
                              }`}
                              title={task.title}
                            >
                              {task.title.length > 7 ? task.title.slice(0, 7) + '…' : task.title}
                            </div>
                            {/* 호버 즉시 표시 풀 제목 */}
                            <span className="invisible group-hover/chip:visible absolute z-50 left-0 -top-7 bg-slate-800 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none max-w-[280px] truncate">
                              {task.title}
                            </span>
                          </div>
                        ))}
                        {tasks.length > WEEK_MAX_CHIPS && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPopoverDate(dateStr) }}
                            title={`이 날의 일정 ${tasks.length}개 모두 보기`}
                            className="text-[10px] text-indigo-600 hover:text-white hover:bg-indigo-500 bg-indigo-50 border border-indigo-200 rounded text-center px-1.5 py-0.5 mt-0.5 font-semibold transition-colors"
                          >
                            ▸ +{tasks.length - WEEK_MAX_CHIPS}개 더
                          </button>
                        )}
                      </div>

                      {/* 완료 카운터 */}
                      {tasks.length > 0 && (
                        <div className={`text-xs text-center py-1 border-t ${
                          completed === tasks.length ? 'text-green-600 border-green-100 bg-green-50 rounded-b-xl' : 'text-slate-400 border-slate-100'
                        }`}>
                          {completed === tasks.length ? '✓ 완료' : `${completed}/${tasks.length}`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

          </div>

          {/* +N개 더 팝오버 */}
          {popoverDate && (
            <MorePopover
              date={popoverDate}
              tasks={tasksByDate[popoverDate] || []}
              categories={categories}
              onClose={() => setPopoverDate(null)}
              onEditTask={onEditTask}
              onAddTask={onAddTask}
            />
          )}

          {/* 습관 트래커 */}
          {habits.length > 0 && (
            <div className="bg-amber-50 border-t border-amber-100 flex-shrink-0">
              <button
                onClick={() => setHabitOpen((v) => !v)}
                className="flex items-center gap-1.5 w-full px-4 py-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900"
              >
                <span>🔁 습관 트래커</span>
                <span className="bg-amber-200 text-amber-700 rounded-full px-1.5 text-xs">{habits.length}</span>
                <span className="text-amber-400 ml-auto">{habitOpen ? '▲' : '▼'}</span>
              </button>
              {habitOpen && (
                <div className="px-4 pb-2 flex flex-col gap-1 max-h-28 overflow-y-auto">
                  {habits.map((habit, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${habit.color ? HABIT_COLOR_DOT[habit.color] : 'bg-slate-300'}`} />
                      <span className="text-xs text-slate-600 truncate flex-1 min-w-0" style={{ maxWidth: 90 }}>{habit.title}</span>
                      {days.map((day) => {
                        const dateStr = toDateStr(day)
                        const task = habit.byDate[dateStr]
                        return (
                          <button
                            key={dateStr}
                            onClick={() => task && handleHabitToggle(task.id)}
                            className={`w-6 h-6 flex-shrink-0 rounded text-xs font-medium transition-colors ${
                              !task
                                ? 'text-slate-200 cursor-default'
                                : task.is_completed
                                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                : 'bg-white text-slate-300 border border-slate-200 hover:border-amber-300 hover:text-amber-600'
                            }`}
                          >
                            {!task ? '−' : task.is_completed ? '✓' : '○'}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 주간 통계 */}
          <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-slate-400 flex-shrink-0">주간 완료율</span>
            <div className="flex-1 flex gap-1.5 items-end">
              {days.map((day, i) => {
                const dateStr = toDateStr(day)
                const dayTasks = tasksByDate[dateStr] || []
                const dayTotal = dayTasks.length
                const dayDone = dayTasks.filter((t) => t.is_completed).length
                const pct = dayTotal > 0 ? (dayDone / dayTotal) * 100 : 0
                const isWeekend = i >= 5
                return (
                  <div key={dateStr} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct === 100 && dayTotal > 0 ? 'bg-green-400' : 'bg-indigo-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs ${isWeekend ? 'text-red-300' : 'text-slate-300'}`}>{DAY_NAMES[i]}</span>
                  </div>
                )
              })}
            </div>
            {weekTotal > 0 && (
              <span className="text-xs text-slate-500 flex-shrink-0 font-medium">{weekDone}/{weekTotal}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WeekSidebarPoolTask({ task, days, onToggle, onAssign, onDelete }) {
  return (
    <div className={`flex flex-col rounded-lg px-2 py-1.5 mb-0.5 group ${task.is_completed ? 'bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onToggle(task.id)}
          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            task.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-indigo-400'
          }`}
        >
          {task.is_completed && <span className="text-[8px]">✓</span>}
        </button>
        <span className={`flex-1 text-xs truncate min-w-0 ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
          {task.title}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 text-[10px] flex-shrink-0 transition-opacity"
        >
          ✕
        </button>
      </div>
      {/* 요일 배정 버튼 */}
      <div className="flex gap-px mt-1 ml-5">
        {days.map((day, i) => (
          <button
            key={i}
            onClick={() => onAssign(task.id, toDateStr(day))}
            title={`${DAY_NAMES[i]}요일로 배정`}
            className="text-[10px] w-5 h-4 rounded text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 font-medium transition-colors"
          >
            {DAY_NAMES[i]}
          </button>
        ))}
      </div>
    </div>
  )
}

function WeekSidebarDayTask({ task, onToggle }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 mb-0.5 ${task.is_completed ? 'bg-slate-50' : 'bg-white'}`}>
      <button
        onClick={() => onToggle(task.id)}
        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          task.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-indigo-400'
        }`}
      >
        {task.is_completed && <span className="text-[8px]">✓</span>}
      </button>
      <span className={`flex-1 text-xs truncate min-w-0 ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
        {task.title}
        {(task.parent_id || task.is_template) && <span className="ml-1 text-indigo-400 text-[10px]">🔁</span>}
      </span>
    </div>
  )
}
