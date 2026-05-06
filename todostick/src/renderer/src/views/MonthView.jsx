import { useState, useEffect } from 'react'
import { getDaysInMonth, toDateStr, getTodayStr } from '../utils/date'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

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

export default function MonthView({ currentDate, onDateChange, onDateClick, onAddTask }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const [poolTasks, setPoolTasks] = useState([])
  const [poolAddTitle, setPoolAddTitle] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthPoolKey = `M:${year}-${String(month + 1).padStart(2, '0')}`
  const weeksOfMonth = getWeeksOfMonth(year, month)

  const load = () => {
    window.api.tasks.getByMonth(year, month + 1).then((tasks) => {
      const map = {}
      tasks.forEach((t) => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t) })
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

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center">
          <span className="text-base font-bold text-slate-800">{year}년 {month + 1}월</span>
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
                {poolTasks.length > 0 && (
                  <span className="ml-1.5 bg-violet-200 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">
                    {poolDone}/{poolTasks.length}
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

            {/* 할일 목록 (주차별 그룹) */}
            <div className="flex-1 overflow-y-auto py-1">
              {poolTasks.length === 0 ? (
                <p className="text-xs text-violet-400 text-center py-6">아래에서 할일을 추가하고<br />주차별로 배정해보세요</p>
              ) : (
                <>
                  {/* 미배정 */}
                  {poolTasks.filter((t) => t._weekIdx === null).length > 0 && (
                    <div className="px-2 mb-2">
                      <p className="text-[10px] text-violet-400 font-semibold mb-1 px-1">미배정</p>
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

                  {/* 주차별 */}
                  {weeksOfMonth.map((monday, i) => {
                    const weekTasks = poolTasks.filter((t) => t._weekIdx === i)
                    if (weekTasks.length === 0) return null
                    const weekDone = weekTasks.filter((t) => t.is_completed).length
                    return (
                      <div key={i} className="px-2 mb-2">
                        <p className="text-[10px] text-violet-500 font-semibold mb-1 px-1 flex items-center justify-between">
                          <span>{i + 1}주차</span>
                          <span>{weekDone}/{weekTasks.length}</span>
                        </p>
                        {weekTasks.map((task) => (
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
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={`text-xs text-center font-semibold py-1 ${i >= 5 ? 'text-red-400' : 'text-slate-400'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />

              const dateStr = toDateStr(day)
              const tasks = tasksByDate[dateStr] || []
              const completed = tasks.filter((t) => t.is_completed).length
              const allDone = tasks.length > 0 && completed === tasks.length
              const isToday = dateStr === today
              const isWeekend = getDayIndex(day) >= 5

              return (
                <div
                  key={dateStr}
                  onClick={() => onDateClick(dateStr)}
                  className={`group relative flex flex-col items-center justify-start py-1 px-0.5 rounded-xl cursor-pointer transition-all hover:bg-slate-100 ${
                    isToday ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''
                  }`}
                >
                  <span className={`text-xs font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : isWeekend
                      ? 'text-red-400'
                      : 'text-slate-700'
                  }`}>
                    {day.getDate()}
                  </span>

                  {tasks.length > 0 && (
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${allDone ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <span className="text-xs text-slate-400 leading-none">{tasks.length}</span>
                    </div>
                  )}

                  {onAddTask && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddTask(dateStr) }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 opacity-0 group-hover:opacity-100 flex items-center justify-center text-indigo-400 hover:text-indigo-600 text-xs font-bold transition-opacity"
                      title="할일 추가"
                    >
                      +
                    </button>
                  )}
                </div>
              )
            })}
          </div>

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
