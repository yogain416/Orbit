import { useState, useEffect } from 'react'
import { getDaysInMonth, toDateStr, getTodayStr } from '../utils/date'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

export default function MonthView({ currentDate, onDateChange, onDateClick }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const load = () => {
    window.api.tasks.getByMonth(year, month + 1).then((tasks) => {
      const map = {}
      tasks.forEach((t) => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t) })
      setTasksByDate(map)
    })
  }

  useEffect(() => { load() }, [year, month])

  useEffect(() => {
    window.api.tasks.onRefresh(load)
    return () => window.api.tasks.offRefresh(load)
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

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center">
          <span className="text-base font-bold text-slate-800">{year}년 {month + 1}월</span>
        </div>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
      </div>

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
                className={`flex flex-col items-center justify-start py-1 px-0.5 rounded-xl cursor-pointer transition-all hover:bg-slate-100 ${
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
  )
}

function getDayIndex(date) {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}
