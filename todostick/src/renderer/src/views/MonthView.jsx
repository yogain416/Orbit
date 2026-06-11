import { useState, useEffect } from 'react'
import { getDaysInMonth, toDateStr, getTodayStr } from '../utils/date'
import { usePersistedState } from '../utils/storage'
import { getHolidayName, getDayColorClass } from '../utils/holidays'
import { DEFAULT_CATEGORIES } from '../utils/categories'
import MorePopover, { TaskChip, sortChips } from '../components/MorePopover'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

// GCal 모드 활성화에 필요한 최소 폭 (사이드바 닫혀도 너무 좁으면 compact로 fallback)
const GCAL_MIN_WIDTH = 800
const GCAL_MAX_CHIPS = 4

function getWeekIdxOfDate(dateStr, weeksOfMonth) {
  const d = new Date(dateStr + 'T00:00:00')
  for (let i = 0; i < weeksOfMonth.length; i++) {
    const monday = weeksOfMonth[i]
    const next = new Date(monday)
    next.setDate(monday.getDate() + 7)
    if (d >= monday && d < next) return i
  }
  return -1
}

function getWeeksOfMonth(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const firstDayWeek = firstDay.getDay()
  const firstMonday = new Date(firstDay)
  firstMonday.setDate(firstDay.getDate() - (firstDayWeek === 0 ? 6 : firstDayWeek - 1))

  const weeks = []
  let cur = new Date(firstMonday)
  while (cur <= lastDay) {
    weeks.push(new Date(cur))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

export default function MonthView({ currentDate, onDateChange, onDateClick, onAddTask, onEditTask }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const [poolTasks, setPoolTasks] = useState([])
  const [poolAddTitle, setPoolAddTitle] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [popoverDate, setPopoverDate] = useState(null)
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats?.length) setCategories(cats) })
  }, [])

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // GCal 모드: 사이드바 닫혔고 충분히 넓을 때만
  const gcalMode = !sidebarOpen && windowWidth >= GCAL_MIN_WIDTH

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  // 사이드바 주차 그룹 접힘 상태 (week index 배열). 기본은 모두 펴짐.
  const [collapsedSidebarWeeks, setCollapsedSidebarWeeks] = usePersistedState(
    `monthview:sidebar-collapsed-weeks:${monthKey}`,
    []
  )

  const monthPoolKey = `M:${year}-${String(month + 1).padStart(2, '0')}`
  const weeksOfMonth = getWeeksOfMonth(year, month)

  const load = () => {
    window.api.tasks.getByMonth(year, month + 1).then((tasks) => {
      const map = {}
      tasks.forEach((t) => {
        // 다일 이벤트는 시작~종료 모든 날짜 셀에 매핑 (셀 사이 띠 연결)
        if (t.end_date && t.end_date > t.date) {
          const cur = new Date(t.date + 'T00:00:00')
          const end = new Date(t.end_date + 'T00:00:00')
          while (cur <= end) {
            const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
            if (!map[ds]) map[ds] = []
            map[ds].push(t)
            cur.setDate(cur.getDate() + 1)
          }
        } else {
          if (!map[t.date]) map[t.date] = []
          map[t.date].push(t)
        }
      })
      setTasksByDate(map)
    })
  }

  const loadPool = async () => {
    const monthTasks = await window.api.tasks.getPool(monthPoolKey)
    const weekResults = await Promise.all(
      weeksOfMonth.map(async (monday, i) => {
        const tasks = await window.api.tasks.getPool(`W:${toDateStr(monday)}`)
        return tasks.map((t) => ({ ...t, _weekIdx: i }))
      })
    )
    setPoolTasks([
      ...monthTasks.map((t) => ({ ...t, _weekIdx: null })),
      ...weekResults.flat()
    ])
  }

  useEffect(() => { load(); loadPool() }, [year, month])

  useEffect(() => {
    const handler = () => { load(); loadPool() }
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [year, month])

  const prevMonth = () => onDateChange(new Date(year, month - 1, 1))
  const nextMonth = () => onDateChange(new Date(year, month + 1, 1))

  const days = getDaysInMonth(year, month)
  const today = getTodayStr()

  const allTasks = Object.values(tasksByDate).flat()
  const totalTasks = allTasks.length
  const totalDone = allTasks.filter((t) => t.is_completed).length
  const totalRemaining = totalTasks - totalDone
  const completionRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0

  const poolDone = poolTasks.filter((t) => t.is_completed).length

  const handlePoolAdd = async () => {
    if (!poolAddTitle.trim()) return
    await window.api.tasks.create({
      title: poolAddTitle.trim(),
      date: monthPoolKey,
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

  const handleAssignToWeek = async (task, weekIdx, monday) => {
    const targetKey = task._weekIdx === weekIdx ? monthPoolKey : `W:${toDateStr(monday)}`
    await window.api.tasks.update(task.id, { date: targetKey })
    window.api.tasks.notifyChanged()
    loadPool()
  }

  const handlePoolToggle = async (taskId) => {
    await window.api.tasks.toggle(taskId, null)
    window.api.tasks.notifyChanged()
    loadPool()
  }

  const handleDeletePool = async (taskId) => {
    await window.api.tasks.delete(taskId)
    window.api.tasks.notifyChanged()
    loadPool()
  }

  const handleScheduledToggle = async (taskId) => {
    await window.api.tasks.toggle(taskId, null)
    window.api.tasks.notifyChanged()
    load()
  }

  const handleScheduledDelete = async (task) => {
    const ok = window.confirm(`"${task.title}" 을(를) 삭제할까요?\n반복 일정이면 이 날만 삭제됩니다.`)
    if (!ok) return
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    load()
  }

  // 일정 task(일별 등록)를 주차별로 묶기
  const scheduledTasksByWeek = {}
  for (const [dateStr, tasks] of Object.entries(tasksByDate)) {
    const wi = getWeekIdxOfDate(dateStr, weeksOfMonth)
    if (wi < 0) continue
    if (!scheduledTasksByWeek[wi]) scheduledTasksByWeek[wi] = []
    for (const t of tasks) scheduledTasksByWeek[wi].push(t)
  }

  const sidebarTotalCount = poolTasks.length + allTasks.length
  const sidebarDoneCount = poolDone + allTasks.filter((t) => t.is_completed).length

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center">
          <span className="text-base font-extrabold tracking-tight text-slate-800">{year}년 {month + 1}월</span>
        </div>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 닫혔을 때 얇은 열기 버튼 */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="목록 열기"
            className="w-6 flex-shrink-0 bg-violet-50 border-r border-violet-100 hover:bg-violet-100 flex items-center justify-center text-violet-400 hover:text-violet-700 transition-colors"
          >
            ▸
          </button>
        )}

        {/* ===== 왼쪽: 이번 달 할일 풀 (주차별) ===== */}
        {sidebarOpen && (
          <div className="w-52 border-r border-slate-200 bg-violet-50 flex flex-col flex-shrink-0">
            {/* 사이드바 헤더 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-violet-100 flex-shrink-0">
              <span className="text-xs font-bold text-violet-700">
                📋 이번 달 할일
                {sidebarTotalCount > 0 && (
                  <span className="ml-1.5 bg-violet-200 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">
                    {sidebarDoneCount}/{sidebarTotalCount}
                  </span>
                )}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                title="목록 닫기"
                className="text-violet-300 hover:text-violet-600 text-sm leading-none px-1"
              >
                ◂
              </button>
            </div>

            {/* 할일 목록 (주차별 그룹: 풀 + 일정) */}
            <div className="flex-1 overflow-y-auto py-1">
              {sidebarTotalCount === 0 ? (
                <p className="text-xs text-violet-400 text-center py-6">아래에서 할일을 추가하고<br />주차별로 배정해보세요</p>
              ) : (
                <>
                  {/* 미배정 풀 */}
                  {poolTasks.filter((t) => t._weekIdx === null).length > 0 && (
                    <div className="px-2 mb-2">
                      <p className="text-[10px] text-violet-400 font-semibold mb-1 px-1">미배정 (풀)</p>
                      {poolTasks.filter((t) => t._weekIdx === null).map((task) => (
                        <MonthPoolTask
                          key={task.id}
                          task={task}
                          weeks={weeksOfMonth}
                          onAssign={handleAssignToWeek}
                          onToggle={handlePoolToggle}
                          onDelete={handleDeletePool}
                        />
                      ))}
                    </div>
                  )}

                  {/* 주차별: 풀(배정됨) + 일정(날짜별) */}
                  {weeksOfMonth.map((monday, i) => {
                    const weekPool = poolTasks.filter((t) => t._weekIdx === i)
                    const weekScheduled = (scheduledTasksByWeek[i] || []).slice().sort((a, b) =>
                      a.date.localeCompare(b.date) || a.order_index - b.order_index
                    )
                    if (weekPool.length === 0 && weekScheduled.length === 0) return null
                    const wkAll = [...weekPool, ...weekScheduled]
                    const wkDone = wkAll.filter((t) => t.is_completed).length
                    const sunday = new Date(monday)
                    sunday.setDate(monday.getDate() + 6)
                    const weekRange = `${monday.getMonth() + 1}/${monday.getDate()}~${sunday.getMonth() + 1}/${sunday.getDate()}`

                    // 일정 task를 날짜별로 또 그룹핑
                    const scheduledByDate = {}
                    for (const t of weekScheduled) {
                      if (!scheduledByDate[t.date]) scheduledByDate[t.date] = []
                      scheduledByDate[t.date].push(t)
                    }

                    const isSidebarCollapsed = collapsedSidebarWeeks.includes(i)
                    const toggleSidebarWeek = () =>
                      setCollapsedSidebarWeeks((prev) =>
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                      )
                    return (
                      <div key={i} className="px-2 mb-3">
                        <button
                          type="button"
                          onClick={toggleSidebarWeek}
                          className="w-full text-[10px] text-violet-500 font-semibold mb-1 px-1 flex items-center justify-between hover:text-violet-700 transition-colors"
                        >
                          <span>
                            {i + 1}주차 <span className="font-normal text-violet-300">({weekRange})</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span>{wkDone}/{wkAll.length}</span>
                            <span className="text-violet-300">{isSidebarCollapsed ? '▸' : '▾'}</span>
                          </span>
                        </button>

                        {!isSidebarCollapsed && (
                          <>
                            {/* 풀(주차 배정) */}
                            {weekPool.map((task) => (
                              <MonthPoolTask
                                key={task.id}
                                task={task}
                                weeks={weeksOfMonth}
                                onAssign={handleAssignToWeek}
                                onToggle={handlePoolToggle}
                                onDelete={handleDeletePool}
                              />
                            ))}

                            {/* 일정(일별 등록) */}
                            {Object.keys(scheduledByDate).sort().map((dateStr) => {
                              const d = new Date(dateStr + 'T00:00:00')
                              const dayLabel = `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAY_KO[d.getDay()]}`
                              return (
                                <div key={dateStr} className="mt-1">
                                  <p
                                    onClick={() => onDateClick(dateStr)}
                                    className="text-[9px] text-slate-400 ml-1 mb-0.5 cursor-pointer hover:text-violet-600"
                                  >
                                    📅 {dayLabel}
                                  </p>
                                  {scheduledByDate[dateStr].map((task) => (
                                    <MonthScheduledTask
                                      key={task.id}
                                      task={task}
                                      onToggle={handleScheduledToggle}
                                      onDelete={handleScheduledDelete}
                                    />
                                  ))}
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* 하단 항상 보이는 추가 입력 */}
            <div className="px-3 py-2.5 border-t border-violet-100 flex-shrink-0">
              <input
                type="text"
                value={poolAddTitle}
                onChange={(e) => setPoolAddTitle(e.target.value)}
                onKeyDown={handlePoolAddKeyDown}
                placeholder="+ 할일 추가 (Enter)"
                className="w-full text-xs bg-transparent outline-none text-slate-600 placeholder-violet-300 border-b border-transparent focus:border-violet-400 pb-0.5 transition-colors"
              />
            </div>
          </div>
        )}

        {/* ===== 오른쪽: 달력 ===== */}
        <div className="flex-1 flex flex-col p-4 gap-1 overflow-hidden">
          {/* 요일 헤더 — 토 파랑, 일 빨강 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div
                key={d}
                className={`text-xs text-center font-semibold py-1 ${
                  i === 6 ? 'text-red-400' : i === 5 ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 주별 행 — 항상 펴진 상태 7일 그리드 */}
          <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
            {(() => {
              const weekRows = []
              for (let i = 0; i < days.length; i += 7) weekRows.push(days.slice(i, i + 7))
              return weekRows.map((week, wIdx) => (
                <div key={wIdx} className={`border border-slate-100 rounded-xl overflow-hidden bg-white ${gcalMode ? 'flex-shrink-0' : ''}`}>
                  <div className="grid grid-cols-7 gap-1 p-1">
                    {week.map((day, di) => {
                      if (!day) return <div key={`e-${wIdx}-${di}`} />
                      const dateStr = toDateStr(day)
                      const tasks = tasksByDate[dateStr] || []
                      const completed = tasks.filter((t) => t.is_completed).length
                      const allDone = tasks.length > 0 && completed === tasks.length
                      const isToday = dateStr === today
                      const dayColor = getDayColorClass(dateStr, day.getDay())
                      const holidayName = getHolidayName(dateStr)

                      const sortedTasks = gcalMode ? sortChips(tasks) : tasks
                      const hasStarred = gcalMode && sortedTasks.some((t) => t.is_starred && !t.is_completed)

                      const cellTitle = gcalMode && tasks.length > 0
                        ? `${holidayName ? holidayName + ' · ' : ''}일정 ${tasks.length}개 — 클릭해서 자세히 보기`
                        : (holidayName || (gcalMode ? '클릭해서 일정 추가/보기' : undefined))
                      return (
                        <div
                          key={dateStr}
                          onClick={() => onDateClick(dateStr)}
                          title={cellTitle}
                          className={`group relative flex flex-col ${gcalMode ? 'items-stretch px-1 pt-1.5 pb-1' : 'items-center justify-start py-2 px-0.5'} rounded-lg cursor-pointer transition-all hover:bg-slate-100 ${gcalMode ? 'min-h-[140px]' : 'min-h-[60px]'} ${
                            isToday ? 'ring-2 ring-indigo-400 bg-indigo-50' : hasStarred ? 'bg-yellow-50/60' : ''
                          }`}
                        >
                          {/* 날짜 헤더 */}
                          <div className={gcalMode ? 'flex items-center justify-between mb-0.5' : 'contents'}>
                            <span className={`text-xs font-semibold ${gcalMode ? 'w-6 h-6' : 'w-7 h-7'} flex items-center justify-center rounded-full ${
                              isToday
                                ? 'bg-indigo-600 text-white'
                                : dayColor === 'red'
                                ? 'text-red-500'
                                : dayColor === 'blue'
                                ? 'text-blue-500'
                                : 'text-slate-700'
                            }`}>
                              {day.getDate()}
                            </span>
                            {gcalMode && holidayName && (
                              <span className="text-[9px] text-red-400 truncate ml-1">{holidayName}</span>
                            )}
                          </div>

                          {/* 칩(GCal 모드) 또는 점·개수(compact) */}
                          {gcalMode ? (
                            tasks.length > 0 && (
                              <div className="flex flex-col gap-0.5">
                                {sortedTasks.slice(0, GCAL_MAX_CHIPS).map((task) => (
                                  <TaskChip
                                    key={task.id}
                                    task={task}
                                    categories={categories}
                                    cellDate={dateStr}
                                    weekStart={toDateStr(weeksOfMonth[wIdx])}
                                    weekEnd={(() => {
                                      const we = new Date(weeksOfMonth[wIdx])
                                      we.setDate(we.getDate() + 6)
                                      return toDateStr(we)
                                    })()}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onEditTask && onEditTask(task)
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleScheduledDelete(task)
                                    }}
                                  />
                                ))}
                                {sortedTasks.length > GCAL_MAX_CHIPS && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setPopoverDate(dateStr) }}
                                    title={`이 날의 일정 ${sortedTasks.length}개 모두 보기`}
                                    className="text-[10px] text-indigo-600 hover:text-white hover:bg-indigo-500 bg-indigo-50 border border-indigo-200 rounded text-left px-1.5 py-0.5 mt-0.5 font-semibold transition-colors flex items-center gap-0.5"
                                  >
                                    <span>▸</span>
                                    <span>+{sortedTasks.length - GCAL_MAX_CHIPS}개 더</span>
                                  </button>
                                )}
                              </div>
                            )
                          ) : (
                            tasks.length > 0 && (
                              <div className="flex flex-col items-center gap-0.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${allDone ? 'bg-green-400' : 'bg-amber-400'}`} />
                                <span className="text-xs text-slate-400 leading-none">{tasks.length}</span>
                              </div>
                            )
                          )}

                          {onAddTask && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onAddTask(dateStr) }}
                              className="absolute top-0.5 right-0.5 w-4 h-4 opacity-0 group-hover:opacity-100 flex items-center justify-center text-indigo-400 hover:text-indigo-600 text-xs font-bold transition-opacity z-10"
                              title="할일 추가"
                            >
                              +
                            </button>
                          )}

                          {/* GCal 모드 셀 hover 안내 — native tooltip이 안 보일 수 있어 시각 hint 추가 */}
                          {gcalMode && (
                            <span className="absolute bottom-0.5 right-1 text-[9px] text-indigo-500 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none font-medium">
                              ↗ 자세히
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* +N개 더보기 팝오버 */}
          {popoverDate && (
            <MorePopover
              date={popoverDate}
              tasks={tasksByDate[popoverDate] || []}
              categories={categories}
              onClose={() => setPopoverDate(null)}
              onEditTask={onEditTask}
              onAddTask={onAddTask}
              onDeleteTask={handleScheduledDelete}
            />
          )}

          {/* 월간 통계 */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-6">
            {totalTasks > 0 ? (
              <>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  완료 <span className="font-semibold text-green-600">{totalDone}</span>개
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  미완료 <span className="font-semibold text-amber-500">{totalRemaining}</span>개
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  완료율 <span className="font-semibold text-indigo-600">{completionRate}%</span>
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-green-400" /> 전체 완료
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> 미완료 있음
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthPoolTask({ task, weeks, onAssign, onToggle, onDelete }) {
  return (
    <div className={`flex flex-col rounded-lg px-2 py-1.5 mb-0.5 group ${task.is_completed ? 'bg-slate-50' : 'bg-white'}`}>
      {/* 첫째 줄: 체크 + 제목 + 삭제 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onToggle(task.id)}
          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            task.is_completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-slate-300 hover:border-violet-500'
          }`}
        >
          {task.is_completed && <span className="text-[8px]">✓</span>}
        </button>
        <span className={`flex-1 text-xs font-medium truncate min-w-0 ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 text-[10px] flex-shrink-0 transition-opacity"
        >
          ✕
        </button>
      </div>

      {/* 둘째 줄: 주차 배정 버튼 (항상 표시) */}
      <div className="flex gap-px mt-1 ml-5">
        {weeks.map((monday, i) => {
          const isActive = task._weekIdx === i
          return (
            <button
              key={i}
              onClick={() => onAssign(task, i, monday)}
              title={isActive ? '클릭하면 미배정으로 되돌리기' : `${i + 1}주에 배정`}
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-violet-500 text-white'
                  : 'text-slate-300 hover:bg-violet-100 hover:text-violet-700'
              }`}
            >
              {i + 1}주
            </button>
          )
        })}
      </div>
    </div>
  )
}

function getDayIndex(date) {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}

function MonthScheduledTask({ task, onToggle, onDelete }) {
  const isRepeat = task.parent_id || task.is_template
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 mb-0.5 group ${task.is_completed ? 'bg-slate-50' : 'bg-white'}`}>
      <button
        onClick={() => onToggle(task.id)}
        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          task.is_completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-slate-300 hover:border-violet-500'
        }`}
      >
        {task.is_completed && <span className="text-[8px]">✓</span>}
      </button>
      <span className={`flex-1 text-xs font-medium truncate min-w-0 ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
        {isRepeat && <span className="ml-1 text-violet-400 text-[10px]">🔁</span>}
      </span>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task) }}
          title="삭제"
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 text-[10px] flex-shrink-0 transition-opacity"
        >
          ✕
        </button>
      )}
    </div>
  )
}
