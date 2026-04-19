import { useState, useEffect } from 'react'
import { getWeekRange, toDateStr, getTodayStr } from '../utils/date'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

export default function WeekView({ currentDate, onDateChange, onDateClick, onAddTask }) {
  const [tasksByDate, setTasksByDate] = useState({})
  const { start, end, monday } = getWeekRange(currentDate)

  useEffect(() => {
    window.api.tasks.getByWeek(start, end).then((tasks) => {
      const map = {}
      tasks.forEach((t) => {
        if (!map[t.date]) map[t.date] = []
        map[t.date].push(t)
      })
      setTasksByDate(map)
    })
  }, [start, end])

  useEffect(() => {
    const handler = () => {
      window.api.tasks.getByWeek(start, end).then((tasks) => {
        const map = {}
        tasks.forEach((t) => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t) })
        setTasksByDate(map)
      })
    }
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

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
        <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center">
          <span className="text-base font-bold text-slate-800">{weekLabel}</span>
          <span className="ml-2 text-xs text-slate-400">{start} ~ {end}</span>
        </div>
        <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
      </div>

      {/* 7일 그리드 */}
      <div className="flex-1 p-4 grid grid-cols-7 gap-2 overflow-hidden">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const tasks = tasksByDate[dateStr] || []
          const completed = tasks.filter((t) => t.is_completed).length
          const isToday = dateStr === today
          const isWeekend = i >= 5

          return (
            <div
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={`flex flex-col rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                isToday
                  ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-indigo-200'
              }`}
            >
              {/* 날짜 헤더 */}
              <div className={`text-center py-2 rounded-t-xl ${isToday ? 'bg-indigo-500' : 'bg-slate-50'}`}>
                <div className={`text-xs font-medium ${isToday ? 'text-indigo-100' : isWeekend ? 'text-red-400' : 'text-slate-500'}`}>
                  {DAY_NAMES[i]}
                </div>
                <div className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-700'}`}>
                  {day.getDate()}
                </div>
              </div>

              {/* 할일 미리보기 */}
              <div className="flex-1 overflow-hidden p-1.5 flex flex-col gap-0.5">
                {tasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className={`text-xs px-1.5 py-0.5 rounded truncate ${
                      task.is_completed
                        ? 'bg-slate-100 text-slate-400 line-through'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}
                    title={task.title}
                  >
                    {task.title.length > 7 ? task.title.slice(0, 7) + '…' : task.title}
                  </div>
                ))}
                {tasks.length > 5 && (
                  <div className="text-xs text-slate-400 text-center">+{tasks.length - 5}</div>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
