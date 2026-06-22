import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getTodayStr, toDateStr } from '../utils/date'
import HabitEditModal from '../components/HabitEditModal'

const WEEKS = 12
const DAYS_IN_WEEK = 7
const TOTAL_DAYS = WEEKS * DAYS_IN_WEEK

const STATUS_STYLE = {
  off:    'bg-slate-100 dark:bg-slate-700',
  skip:   'bg-slate-200 dark:bg-slate-600',
  miss:   'bg-rose-100 dark:bg-rose-500/20',
  today:  'bg-yellow-200 ring-1 ring-yellow-400',
  future: 'bg-slate-50 dark:bg-slate-700/40',
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

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

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
    if (d.status === 'done') {
      run += 1
      if (run > longest) longest = run
    } else if (d.status === 'miss') {
      run = 0
    }
  }

  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (d.status === 'future') continue
    if (d.status === 'today') {
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

// 요일별 성공률 (월~일) — expected(=done/miss/today) 대비 done 비율.
function weekdayRates(days) {
  // getDay 0(일)..6(토) → 표시 인덱스 0(월)..6(일)
  const expected = [0, 0, 0, 0, 0, 0, 0]
  const done = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days) {
    if (!(d.status === 'done' || d.status === 'miss' || d.status === 'today')) continue
    const dow = new Date(d.date + 'T00:00:00').getDay()
    const idx = (dow + 6) % 7
    expected[idx] += 1
    if (d.status === 'done') done[idx] += 1
  }
  return WEEKDAY_LABELS.map((label, i) => ({
    label,
    rate: expected[i] > 0 ? Math.round((done[i] / expected[i]) * 100) : null,
    done: done[i],
    expected: expected[i]
  }))
}

function HabitGrid({ days, accent, todayStr, onToggle, onSkip }) {
  const firstDayOfWeek = new Date(days[0].date + 'T00:00:00').getDay()
  const offsetFromMon = (firstDayOfWeek + 6) % 7
  const padded = [...Array(offsetFromMon).fill(null), ...days]
  while (padded.length % 7 !== 0) padded.push(null)
  const weeks = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

  // 클릭 가능 여부 — 미래만 제외하고 아무 날이나 토글 가능.
  // off(반복 요일 아님)인 날도 클릭해 '보충(makeup) 완료'를 찍을 수 있다
  // (예: 월수금 습관을 사정상 화요일에 수행). 못 한 원래 요일은 우클릭 휴식으로 처리.
  const canToggle = (cell) => cell.date <= todayStr

  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((cell, di) => {
            if (!cell) return <div key={di} className="w-3 h-3 opacity-0" />
            const isDone = cell.status === 'done'
            const baseStyle = STATUS_STYLE[cell.status]
            const doneStyle = accent ? HABIT_ACCENT[accent]?.done || STATUS_STYLE.done : STATUS_STYLE.done
            const clickable = canToggle(cell)
            const hasNote = !!cell.instance?.completion_note
            return (
              <button
                key={di}
                title={`${cell.date} · ${cell.status}${hasNote ? ' · 📝' : ''}${clickable ? ' (우클릭=휴식)' : ''}`}
                onClick={() => clickable && onToggle(cell.date)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (cell.date > todayStr || isDone) return
                  onSkip(cell.date, cell.status !== 'skip')
                }}
                disabled={!clickable && cell.status !== 'skip'}
                className={`w-3 h-3 rounded-[3px] transition-all ${isDone ? doneStyle : baseStyle} ${
                  hasNote ? 'ring-1 ring-offset-0 ring-indigo-300' : ''
                } ${clickable || cell.status === 'skip' ? 'hover:ring-1 hover:ring-indigo-400 cursor-pointer' : 'cursor-default'}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function HabitCard({ h, todayStr, onToggle, onSkip, onSetPaused, onDelete, onEdit, onNote, dragHandlers, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const menuRef = useRef(null)
  const paused = !!h.template.paused
  const isGoal = !!h.template.weekly_goal

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const stats = calcStats(h.days, todayStr)
  const accent = HABIT_ACCENT[h.template.color]
  const todayDone = h.days[h.days.length - 1]?.instance?.is_completed

  return (
    <div
      {...dragHandlers}
      className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-4 transition-colors ${paused ? 'border-slate-200 dark:border-slate-600 opacity-70' : 'border-slate-100 dark:border-slate-700'} ${dragging ? 'ring-2 ring-indigo-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="cursor-grab text-slate-300 dark:text-slate-500 hover:text-slate-400 dark:hover:text-slate-200 select-none flex-shrink-0" title="드래그로 순서 변경">⋮⋮</span>
          {accent && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} />}
          <h3 className={`font-bold truncate ${paused ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{h.template.title}</h3>
          {isGoal && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 rounded border border-indigo-100 dark:border-slate-700">
              주 {h.template.weekly_goal}회
            </span>
          )}
          {paused && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-600">
              ⏸ 중지됨
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs flex-shrink-0">
          {isGoal ? (
            <span className="text-slate-500 dark:text-slate-400">
              🎯 <span className="font-bold text-indigo-600 dark:text-indigo-300">{h.weekProgress?.done || 0}/{h.weekProgress?.target}</span>
              <span className="text-slate-400 dark:text-slate-500 ml-1">이번주</span>
            </span>
          ) : (
            <>
              <span className="text-slate-500 dark:text-slate-400">
                🔥 <span className="font-bold text-orange-600 dark:text-orange-300">{stats.current}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-1">현재</span>
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                🏆 <span className="font-bold text-indigo-600 dark:text-indigo-300">{stats.longest}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-1">최장</span>
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                📅 <span className="font-bold text-emerald-600 dark:text-emerald-300">{stats.monthRate}%</span>
                <span className="text-slate-400 dark:text-slate-500 ml-1">({stats.monthDone}/{stats.monthExpected})</span>
              </span>
            </>
          )}

          {/* 오늘 한 줄 회고 */}
          <button
            onClick={() => onNote(h)}
            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${todayDone ? 'text-indigo-400 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15' : 'text-slate-300 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            title="오늘 한 줄 회고"
          >
            📝
          </button>

          {/* 더보기 메뉴 */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="습관 관리"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-10 w-36 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg py-1 text-left">
                <button onClick={() => { setMenuOpen(false); onEdit(h.template) }} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">✏️ 편집</button>
                <button onClick={() => { setMenuOpen(false); setShowStats((v) => !v) }} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">📊 요일별 통계</button>
                <button onClick={() => { setMenuOpen(false); onSetPaused(h.template.id, !paused) }} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">{paused ? '▶ 재개' : '⏸ 중지'}</button>
                <button onClick={() => { setMenuOpen(false); onDelete(h.template.id, h.template.title) }} className="w-full px-3 py-2 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15">🗑 삭제</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <HabitGrid
        days={h.days}
        accent={h.template.color}
        todayStr={todayStr}
        onToggle={(date) => onToggle(h.template.id, date)}
        onSkip={(date, skip) => onSkip(h.template.id, date, skip)}
      />

      {showStats && <WeekdayStats days={h.days} />}
    </div>
  )
}

function WeekdayStats({ days }) {
  const rates = useMemo(() => weekdayRates(days), [days])
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2">요일별 성공률 (최근 12주)</p>
      <div className="flex items-end gap-2">
        {rates.map((r) => (
          <div key={r.label} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full h-16 bg-slate-50 dark:bg-slate-700/40 rounded relative flex items-end overflow-hidden">
              <div
                className="w-full bg-emerald-300 rounded-t transition-all"
                style={{ height: `${r.rate ?? 0}%` }}
                title={r.expected ? `${r.done}/${r.expected}` : '데이터 없음'}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{r.label}</span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{r.rate == null ? '-' : `${r.rate}%`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 반복 규칙을 한국어 라벨로. start_date는 weekly/monthly 기준일.
function formatRepeat(t) {
  if (t.weekly_goal) return `🎯 주 ${t.weekly_goal}회`
  if (t.repeat_type === 'daily') {
    if (Array.isArray(t.repeat_days) && t.repeat_days.length > 0) {
      const order = [1, 2, 3, 4, 5, 6, 0]
      const names = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' }
      const picked = order.filter((d) => t.repeat_days.includes(d)).map((d) => names[d])
      return `🔁 매주 ${picked.join('·')}`
    }
    return '🔁 매일'
  }
  if (t.repeat_type === 'weekly') {
    const names = ['일', '월', '화', '수', '목', '금', '토']
    const dow = new Date(t.start_date + 'T00:00:00').getDay()
    return `🔁 매주 ${names[dow]}`
  }
  if (t.repeat_type === 'monthly') {
    const day = new Date(t.start_date + 'T00:00:00').getDate()
    return `🔁 매월 ${day}일`
  }
  return '🔁 반복'
}

function formatNextDate(dateStr, todayStr) {
  if (!dateStr) return '—'
  if (dateStr === todayStr) return '오늘'
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(todayStr + 'T00:00:00')
  const diff = Math.round((d - t) / 86400000)
  if (diff === 1) return '내일'
  const label = `${d.getMonth() + 1}/${d.getDate()}`
  return diff > 0 && diff <= 7 ? `${label} (${diff}일 뒤)` : label
}

function RecurringRow({ t, todayStr, onEdit, onSetPaused, onDelete, onConvert }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const accent = HABIT_ACCENT[t.color]

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 ${t.paused ? 'border-slate-200 dark:border-slate-600 opacity-70' : 'border-slate-100 dark:border-slate-700'}`}>
      {accent ? <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} /> : <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-300 dark:bg-slate-600" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold truncate ${t.paused ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{t.title}</h3>
          {t.paused && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-600">⏸ 중지됨</span>
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {formatRepeat(t)} · 다음 {formatNextDate(t.next_date, todayStr)}
          {t.remind_at && ` · ⏰ ${t.remind_at}`}
          {t.done_count > 0 && ` · ✓ ${t.done_count}회`}
        </p>
      </div>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="반복 일정 관리"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-10 w-40 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg py-1 text-left">
            <button onClick={() => { setMenuOpen(false); onEdit(t) }} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">✏️ 편집</button>
            <button onClick={() => { setMenuOpen(false); onConvert(t) }} className="w-full px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15">🌱 습관으로 전환</button>
            <button onClick={() => { setMenuOpen(false); onSetPaused(t.id, !t.paused) }} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">{t.paused ? '▶ 재개' : '⏸ 중지'}</button>
            <button onClick={() => { setMenuOpen(false); onDelete(t.id, t.title) }} className="w-full px-3 py-2 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15">🗑 시리즈 삭제</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HabitView() {
  const [matrix, setMatrix] = useState([])
  const [recurring, setRecurring] = useState([])
  const [seg, setSeg] = useState('habit') // 'habit' | 'recurring' | 'all'
  const [editing, setEditing] = useState(undefined) // undefined=닫힘, null=새로, obj=편집
  const [editAllowGoal, setEditAllowGoal] = useState(true)
  const [showPaused, setShowPaused] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const todayStr = getTodayStr()

  const range = useMemo(() => getDateRangeBack(TOTAL_DAYS), [])

  const load = useCallback(async () => {
    const [data, rec] = await Promise.all([
      window.api.habits.getMatrix(range.start, range.end),
      window.api.habits.getRecurring()
    ])
    setMatrix(data)
    setRecurring(rec)
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

  const handleSkip = async (templateId, date, skip) => {
    await window.api.habits.setSkip(templateId, date, skip)
    load()
  }

  const handleSetPaused = async (templateId, paused) => {
    await window.api.habits.setPaused(templateId, paused)
    load()
  }

  const handleDelete = async (templateId, title) => {
    const ok = window.confirm(
      `'${title}' 습관을 삭제할까요?\n\n잔디·스트릭 기록이 모두 사라지며 되돌릴 수 없습니다.\n잠시 쉬려는 거라면 '중지'를 사용하세요.`
    )
    if (!ok) return
    await window.api.habits.delete(templateId)
    load()
  }

  const handleNote = async (h) => {
    const existing = h.days[h.days.length - 1]?.instance?.completion_note || ''
    const note = window.prompt(`오늘 '${h.template.title}' 한 줄 회고`, existing)
    if (note === null) return
    await window.api.habits.toggle(h.template.id, todayStr, note)
    load()
  }

  // 습관 카드 편집(주N회 허용) / 반복 일정 행 편집(주N회 숨김)
  const openHabitEdit = (t) => { setEditAllowGoal(true); setEditing(t) }
  const openTemplateEdit = (t) => { setEditAllowGoal(false); setEditing({ id: t.id, title: t.title, color: t.color, repeat_type: t.repeat_type, repeat_days: t.repeat_days, weekly_goal: t.weekly_goal }) }
  const openCreate = () => { setEditAllowGoal(true); setEditing(null) }

  const handleDeleteSeries = async (templateId, title) => {
    const ok = window.confirm(`'${title}' 반복 일정을 통째로 삭제할까요?\n\n템플릿과 모든 반복 인스턴스가 사라지며 되돌릴 수 없습니다.`)
    if (!ok) return
    await window.api.habits.delete(templateId)
    load()
  }

  const handleConvert = async (t) => {
    await window.api.habits.setIsHabit(t.id, true)
    load()
    setSeg('habit')
  }

  // 드래그 정렬 — active(중지 아님) 카드 기준.
  const active = matrix.filter((h) => !h.template.paused)
  const paused = matrix.filter((h) => h.template.paused)
  // 일반 반복 일정(습관 아님) — '반복 일정' 세그먼트에 표시
  const nonHabitRecurring = recurring.filter((r) => !r.is_habit)
  const showHabits = seg === 'habit' || seg === 'all'
  const showRecurring = seg === 'recurring' || seg === 'all'

  const handleDrop = async (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); return }
    const reordered = [...active]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setDragIdx(null)
    // 낙관적 반영 + 영속화 (중지 카드는 뒤에 그대로 둠)
    setMatrix([...reordered, ...paused])
    await window.api.habits.reorder([...reordered, ...paused].map((h) => h.template.id))
    load()
  }

  const dragHandlersFor = (idx) => ({
    draggable: true,
    onDragStart: () => setDragIdx(idx),
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => handleDrop(idx),
    onDragEnd: () => setDragIdx(null)
  })

  if (matrix.length === 0 && nonHabitRecurring.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col items-center gap-3 text-center">
          <span className="text-5xl">🌱</span>
          <h2 className="text-lg font-extrabold text-slate-700 dark:text-slate-200">아직 추적 중인 습관이 없어요</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            아래 버튼으로 습관을 추가하거나, 반복 일정을 추가할 때 <span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium">🌱 습관으로 추적</span> 옵션을 켜보세요.
          </p>
          <button
            onClick={openCreate}
            className="mt-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            + 첫 습관 만들기
          </button>
        </div>
        {editing !== undefined && (
          <HabitEditModal habit={editing} allowGoal={editAllowGoal} onClose={() => setEditing(undefined)} onSaved={load} />
        )}
      </div>
    )
  }

  const todayMissing = active.filter((h) => {
    const todayCell = h.days[h.days.length - 1]
    return todayCell?.date === todayStr && todayCell.status === 'today'
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-5 flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mb-0.5">🌱 습관 트래커</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">최근 12주 · 습관 {active.length}개{paused.length > 0 && ` · 중지 ${paused.length}`} · 반복 일정 {nonHabitRecurring.length}개</p>
          </div>
          {seg !== 'recurring' && (
            <button
              onClick={openCreate}
              className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors flex-shrink-0"
            >
              + 습관 추가
            </button>
          )}
        </div>

        {/* 세그먼트 — 습관 / 반복 일정 / 전체 */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 self-start">
          {[['habit', '습관'], ['recurring', '반복 일정'], ['all', '전체']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSeg(key)}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                seg === key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 오늘 미완 빠른 체크 */}
        {showHabits && todayMissing.length > 0 && (
          <section className="bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-4">
            <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-2">⚡ 오늘 아직 안 한 습관 ({todayMissing.length})</p>
            <div className="flex flex-wrap gap-2">
              {todayMissing.map((h) => (
                <button
                  key={h.template.id}
                  onClick={() => handleToggle(h.template.id, todayStr)}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-yellow-300 dark:border-yellow-500/30 rounded-full text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 hover:border-yellow-400 transition-colors"
                >
                  ✓ {h.template.title}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 활성 습관 카드 */}
        {showHabits && (
          <>
            {active.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">추적 중인 습관이 없어요. <button onClick={openCreate} className="text-emerald-600 dark:text-emerald-300 font-medium hover:underline">습관 추가</button></p>
            )}
            <div className="flex flex-col gap-3">
              {active.map((h, idx) => (
                <HabitCard
                  key={h.template.id}
                  h={h}
                  todayStr={todayStr}
                  onToggle={handleToggle}
                  onSkip={handleSkip}
                  onSetPaused={handleSetPaused}
                  onDelete={handleDelete}
                  onEdit={openHabitEdit}
                  onNote={handleNote}
                  dragHandlers={dragHandlersFor(idx)}
                  dragging={dragIdx === idx}
                />
              ))}
            </div>

            {/* 중지된 습관 — 접이식 */}
            {paused.length > 0 && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowPaused((v) => !v)}
                  className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex items-center gap-1 self-start"
                >
                  {showPaused ? '▾' : '▸'} 중지된 습관 {paused.length}개
                </button>
                {showPaused && paused.map((h) => (
                  <HabitCard
                    key={h.template.id}
                    h={h}
                    todayStr={todayStr}
                    onToggle={handleToggle}
                    onSkip={handleSkip}
                    onSetPaused={handleSetPaused}
                    onDelete={handleDelete}
                    onEdit={openHabitEdit}
                    onNote={handleNote}
                    dragHandlers={{}}
                    dragging={false}
                  />
                ))}
              </div>
            )}

            {/* 범례 */}
            <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 px-1 flex-wrap">
              <span>적게</span>
              <div className="w-3 h-3 rounded-[3px] bg-slate-100 dark:bg-slate-700" />
              <div className="w-3 h-3 rounded-[3px] bg-rose-100 dark:bg-rose-500/20" />
              <div className="w-3 h-3 rounded-[3px] bg-emerald-400" />
              <span>많이</span>
              <span className="ml-2">·</span>
              <div className="w-3 h-3 rounded-[3px] bg-yellow-200 ring-1 ring-yellow-400" />
              <span>오늘</span>
              <span className="ml-2">·</span>
              <div className="w-3 h-3 rounded-[3px] bg-slate-200 dark:bg-slate-600" />
              <span>휴식(우클릭)</span>
            </div>
          </>
        )}

        {/* 일반 반복 일정 목록 */}
        {showRecurring && (
          <div className="flex flex-col gap-3">
            {seg === 'all' && nonHabitRecurring.length > 0 && (
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 mt-2">🔁 일반 반복 일정</h3>
            )}
            {nonHabitRecurring.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-slate-400 dark:text-slate-500">습관이 아닌 반복 일정이 없어요.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">할일 추가 시 <span className="bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded font-medium">반복</span> 옵션을 켜면 여기서 한눈에 관리할 수 있어요.</p>
              </div>
            ) : (
              nonHabitRecurring.map((t) => (
                <RecurringRow
                  key={t.id}
                  t={t}
                  todayStr={todayStr}
                  onEdit={openTemplateEdit}
                  onSetPaused={handleSetPaused}
                  onDelete={handleDeleteSeries}
                  onConvert={handleConvert}
                />
              ))
            )}
          </div>
        )}
      </div>

      {editing !== undefined && (
        <HabitEditModal habit={editing} allowGoal={editAllowGoal} onClose={() => setEditing(undefined)} onSaved={load} />
      )}
    </div>
  )
}
