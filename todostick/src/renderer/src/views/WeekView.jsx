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

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); onDateChange(d) }
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); onDateChange(d) }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">◀</button>
        <h2 className="text-base font-bold text-gray-700">
          {start} ~ {end}
        </h2>
        <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600">▶</button>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-2 overflow-hidden">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const tasks = tasksByDate[dateStr] || []
          const completed = tasks.filter((t) => t.is_completed).length
          const isToday = dateStr === getTodayStr()

          return (
            <div
              key={dateStr}
              className={`flex flex-col rounded-xl border p-2 cursor-pointer hover:shadow-md transition-shadow ${
                isToday ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'
              }`}
              onClick={() => onDateClick(dateStr)}
            >
              <div className="text-center mb-2">
                <div className={`text-xs font-medium ${i >= 5 ? 'text-red-400' : 'text-gray-500'}`}>
                  {DAY_NAMES[i]}
                </div>
                <div className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                  {day.getDate()}
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col gap-1">
                {tasks.slice(0, 4).map((task) => (
                  <div
                    key={task.id}
                    className={`text-xs px-1.5 py-0.5 rounded truncate ${
                      task.is_completed
                        ? 'bg-gray-100 text-gray-400 line-through'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {task.title.length > 8 ? task.title.slice(0, 8) + '…' : task.title}
                  </div>
                ))}
                {tasks.length > 4 && (
                  <div className="text-xs text-gray-400 text-center">+{tasks.length - 4}개</div>
                )}
              </div>

              {tasks.length > 0 && (
                <div className="text-xs text-center text-gray-400 mt-1">{completed}/{tasks.length}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
