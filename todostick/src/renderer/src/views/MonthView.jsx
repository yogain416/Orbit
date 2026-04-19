import { useState, useEffect } from 'react'
import { getDaysInMonth, toDateStr, getTodayStr } from '../utils/date'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

export default function MonthView({ currentDate, onDateChange, onDateClick }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    window.api.tasks.getByMonth(year, month + 1).then((tasks) => {
      const map = {}
      tasks.forEach((t) => {
        if (!map[t.date]) map[t.date] = []
        map[t.date].push(t)
      })
      setTasksByDate(map)
    })
  }, [year, month])

  const prevMonth = () => onDateChange(new Date(year, month - 1, 1))
  const nextMonth = () => onDateChange(new Date(year, month + 1, 1))

  const days = getDaysInMonth(year, month)
  const today = getTodayStr()

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">◀</button>
        <h2 className="text-base font-bold text-gray-700">{year}년 {month + 1}월</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">▶</button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`text-xs text-center font-medium py-1 ${i >= 5 ? 'text-red-400' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="flex-1 grid grid-cols-7 gap-1 overflow-hidden">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />

          const dateStr = toDateStr(day)
          const tasks = tasksByDate[dateStr] || []
          const completed = tasks.filter((t) => t.is_completed).length
          const allDone = tasks.length > 0 && completed === tasks.length
          const isToday = dateStr === today

          return (
            <div
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={`flex flex-col items-center justify-start p-1 rounded-lg cursor-pointer transition-all hover:bg-indigo-50 ${
                isToday ? 'ring-2 ring-indigo-400' : ''
              }`}
            >
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'
              }`}>
                {day.getDate()}
              </span>

              {tasks.length > 0 && (
                <div className="mt-0.5 flex flex-col items-center gap-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${allDone ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className="text-xs text-gray-400">{tasks.length}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> 전체 완료</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 미완료 있음</span>
      </div>
    </div>
  )
}
