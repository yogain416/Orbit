import { useState, useEffect, useCallback, useMemo } from 'react'
import { getTodayStr, toDateStr } from '../utils/date'

const WEEKS = 12
const DAYS_IN_WEEK = 7
const TOTAL_DAYS = WEEKS * DAYS_IN_WEEK

const STATUS_STYLE = {
  off:    'bg-slate-100',
  skip:   'bg-slate-200',
  miss:   'bg-rose-100',
  today:  'bg-yellow-200 ring-1 ring-yellow-400',
  future: 'bg-slate-50',
  done:   'bg-emerald-400',
}

const HABIT_ACCENT = {
  red:    { dot: 'bg-red-400',    done: 'bg-red-400' },
  orange: { dot: 'bg-orange-400', done: 'bg-orange-400' },
  yellow: { dot: 'bg-yellow-400', done: 'bg-yellow-400' },
  green:  { dot: 'bg-green-500',  done: 'bg-green-500' },
  blue:   { dot: 'bg-blue-400',   done: 'bg-blue-400' },
  purple: { dot: 'bg-purple-400', done: 'bg-purple-400' },
}

function getDateRangeBack(days) {
  const today = new Date()
  const end = toDateStr(today)
  const start = new Date(today)
  start.setDate(today.getDate() - (days - 1))
  return { start: toDateStr(start), end }
}

function calcStats(days, todayStr) {
  // 현재 스트릭: 어제부터 과거로 연속 done. 오늘이 done이면 +1, 미완이지만 expected이면 끊지 않음(아직 기회 있음).
  let current = 0
  let longest = 0
  let run = 0
  let monthExpected = 0
  let monthDone = 0
  const ymPrefix = todayStr.slice(0, 7)

  for (const d of days) {
    if (d.date.startsWith(ymPrefix) && (d.status === 'done' || d.status === 'miss' || d.status === 'today')) {
      monthExpected += 1
      if (d.status === 'done') monthDone += 1
    }
    // 최장 스트릭: done 연속만 카운트, off/skip은 끊지 않고 패스, miss는 끊음
    if (d.status === 'done') {
      run += 1
      if (run > longest) longest = run
    } else if (d.status === 'miss') {
      run = 0
    }
    // off/skip/today/future는 longest 카운트에 영향 없음
  }

  // 현재 스트릭: 끝에서부터 거꾸로
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (d.status === 'future') continue
    if (d.status === 'today') {
      // 오늘 미완은 끊지 않음, done이면 +1
      if (d.instance?.is_completed) current += 1
      continue
    }
    if (d.status === 'off' || d.status === 'skip') continue
    if (d.status === 'done') current += 1
    else break
  }

  const monthRate = monthExpected > 0 ? Math.round((monthDone / monthExpected) * 100) : 0
  return { current, longest, monthDone, monthExpected, monthRate }
}

function HabitGrid({ days, accent, onToggle }) {
  // 12주 × 7일 매트릭스 (열 = 주, 행 = 요일)
  // days는 시간순. 첫 날의 요일에 맞춰 패딩.
  const firstDayOfWeek = new Date(days[0].date + 'T00:00:00').getDay() // 0=일
  // 월요일을 첫 행으로: getDay 0(일)=6, 1(월)=0, 2(화)=1, ...
  const offsetFromMon = (firstDayOfWeek + 6) % 7
  const padded = [...Array(offsetFromMon).fill(null), ...days]
  while (padded.length % 7 !== 0) padded.push(null)
  const weeks = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((cell, di) => {
            if (!cell) return <div key={di} className="w-3 h-3 opacity-0" />
            const isDone = cell.status === 'done'
            const baseStyle = STATUS_STYLE[cell.status]
            const doneStyle = accent ? HABIT_ACCENT[accent]?.done || STATUS_STYLE.done : STATUS_STYLE.done
            return (
              <button
                key={di}
                title={`${cell.date} · ${cell.status}`}
                onClick={() => cell.status !== 'off' && cell.status !== 'future' && onToggle(cell.date)}
                disabled={cell.status === 'off' || cell.status === 'future'}
                className={`w-3 h-3 rounded-[3px] transition-all ${
                  isDone ? doneStyle : baseStyle
                } ${cell.status === 'off' || cell.status === 'future' ? 'cursor-default' : 'hover:ring-1 hover:ring-indigo-400 cursor-pointer'}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function HabitView() {
  const [matrix, setMatrix] = useState([])
  const todayStr = getTodayStr()

  const range = useMemo(() => getDateRangeBack(TOTAL_DAYS), [])

  const load = useCallback(async () => {
    const data = await window.api.habits.getMatrix(range.start, range.end)
    setMatrix(data)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => load()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  const handleToggle = async (templateId, date) => {
    await window.api.habits.toggle(templateId, date)
    load()
  }

  if (matrix.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col items-center gap-3 text-center">
          <span className="text-5xl">🌱</span>
          <h2 className="text-lg font-bold text-slate-700">아직 추적 중인 습관이 없어요</h2>
          <p className="text-sm text-slate-500 max-w-md leading-relaxed">
            반복 일정을 추가할 때 <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">🌱 습관으로 추적</span> 옵션을 켜면 여기서 잔디와 스트릭을 볼 수 있어요.
          </p>
          <p className="text-xs text-slate-400 mt-2">예: 매일 물 8잔, 평일 스트레칭, 매주 독서 30분 등</p>
        </div>
      </div>
    )
  }

  const todayMissing = matrix.filter((h) => {
    const todayCell = h.days[h.days.length - 1]
    return todayCell?.date === todayStr && todayCell.status === 'today'
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-5 flex flex-col gap-6">
        {/* 헤더 */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-0.5">🌱 습관 트래커</h2>
          <p className="text-xs text-slate-400">최근 12주 · {matrix.length}개 습관</p>
        </div>

        {/* 오늘 미완 빠른 체크 */}
        {todayMissing.length > 0 && (
          <section className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-yellow-800 mb-2">⚡ 오늘 아직 안 한 습관 ({todayMissing.length})</p>
            <div className="flex flex-wrap gap-2">
              {todayMissing.map((h) => (
                <button
                  key={h.template.id}
                  onClick={() => handleToggle(h.template.id, todayStr)}
                  className="px-3 py-1.5 bg-white border border-yellow-300 rounded-full text-xs font-medium text-slate-700 hover:bg-yellow-100 hover:border-yellow-400 transition-colors"
                >
                  ✓ {h.template.title}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 습관별 카드 */}
        <div className="flex flex-col gap-3">
          {matrix.map((h) => {
            const stats = calcStats(h.days, todayStr)
            const accent = HABIT_ACCENT[h.template.color]
            return (
              <div key={h.template.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {accent && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} />}
                    <h3 className="font-bold text-slate-800 truncate">{h.template.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    <span className="text-slate-500">
                      🔥 <span className="font-bold text-orange-600">{stats.current}</span>
                      <span className="text-slate-400 ml-1">현재</span>
                    </span>
                    <span className="text-slate-500">
                      🏆 <span className="font-bold text-indigo-600">{stats.longest}</span>
                      <span className="text-slate-400 ml-1">최장</span>
                    </span>
                    <span className="text-slate-500">
                      📅 <span className="font-bold text-emerald-600">{stats.monthRate}%</span>
                      <span className="text-slate-400 ml-1">({stats.monthDone}/{stats.monthExpected})</span>
                    </span>
                  </div>
                </div>

                <HabitGrid
                  days={h.days}
                  accent={h.template.color}
                  onToggle={(date) => handleToggle(h.template.id, date)}
                />
              </div>
            )
          })}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-3 text-xs text-slate-400 px-1">
          <span>적게</span>
          <div className="w-3 h-3 rounded-[3px] bg-slate-100" />
          <div className="w-3 h-3 rounded-[3px] bg-slate-200" />
          <div className="w-3 h-3 rounded-[3px] bg-rose-100" />
          <div className="w-3 h-3 rounded-[3px] bg-emerald-400" />
          <span>많이</span>
          <span className="ml-4">·</span>
          <div className="w-3 h-3 rounded-[3px] bg-yellow-200 ring-1 ring-yellow-400" />
          <span>오늘</span>
        </div>
      </div>
    </div>
  )
}
