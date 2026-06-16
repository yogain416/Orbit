import { useState } from 'react'

// 습관 그리드가 렌더 가능한 6색 — DB color 키와 1:1.
const COLORS = [
  { key: 'red', cls: 'bg-red-400' },
  { key: 'orange', cls: 'bg-orange-400' },
  { key: 'yellow', cls: 'bg-yellow-400' },
  { key: 'green', cls: 'bg-green-500' },
  { key: 'blue', cls: 'bg-blue-400' },
  { key: 'purple', cls: 'bg-purple-400' }
]

// 표시 순서 월~일, 값은 Date.getDay() (0=일)
const WEEKDAYS = [
  { v: 1, label: '월' }, { v: 2, label: '화' }, { v: 3, label: '수' },
  { v: 4, label: '목' }, { v: 5, label: '금' }, { v: 6, label: '토' }, { v: 0, label: '일' }
]

export default function HabitEditModal({ habit, onClose, onSaved, allowGoal = true }) {
  const isEdit = !!habit
  const [title, setTitle] = useState(habit?.title || '')
  const [color, setColor] = useState(habit?.color || 'green')
  // mode: 'daily' 매일/요일, 'weekly' 매주, 'monthly' 매월, 'goal' 주 N회
  const initialMode = habit?.weekly_goal ? 'goal' : (habit?.repeat_type || 'daily')
  const [mode, setMode] = useState(initialMode)
  const [days, setDays] = useState(Array.isArray(habit?.repeat_days) ? habit.repeat_days : [])
  const [goal, setGoal] = useState(habit?.weekly_goal || 3)
  const [saving, setSaving] = useState(false)

  const toggleDay = (v) => {
    setDays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]))
  }

  const handleSave = async () => {
    const t = title.trim()
    if (!t || saving) return
    setSaving(true)
    const payload = {
      title: t,
      color,
      repeat_type: mode === 'goal' ? 'daily' : mode,
      repeat_days: mode === 'daily' && days.length > 0 && days.length < 7 ? days : null,
      weekly_goal: mode === 'goal' ? Number(goal) || 1 : null
    }
    try {
      if (isEdit) await window.api.habits.update(habit.id, payload)
      else await window.api.habits.create(payload)
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="font-bold text-gray-800 dark:text-slate-100">{isEdit ? '🌱 습관 편집' : '🌱 새 습관'}</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-200 text-lg">✕</button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* 이름 */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">이름</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="예: 물 8잔, 스트레칭, 독서 30분"
              maxLength={40}
              className="mt-1 w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* 색상 */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">색상</label>
            <div className="mt-2 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  className={`w-7 h-7 rounded-full transition-all ${c.cls} ${color === c.key ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'hover:scale-110 opacity-80'}`}
                />
              ))}
            </div>
          </div>

          {/* 반복 방식 */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400">반복 방식</label>
            <div className={`mt-2 grid gap-1.5 ${allowGoal ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {[['daily', '매일/요일'], ['weekly', '매주'], ['monthly', '매월'], ...(allowGoal ? [['goal', '주 N회']] : [])].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    mode === key ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 요일 선택 (매일/요일 모드) */}
          {mode === 'daily' && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">요일 (선택 안 하면 매일)</label>
              <div className="mt-2 flex gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDay(d.v)}
                    className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                      days.includes(d.v) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 주 N회 목표 */}
          {mode === 'goal' && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">주간 목표 횟수</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-20 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <span className="text-sm text-gray-500 dark:text-slate-400">회 / 주</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">고정 요일 없이 일주일에 정한 횟수만 채우면 되는 습관(예: 주 3회 운동).</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {isEdit ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
