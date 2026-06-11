import { useState, useEffect, useMemo } from 'react'

const MONTH_KR = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function getLastNMonths(n) {
  const months = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function getNextNMonths(n) {
  const months = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function ymLabel(ym) {
  const [year, mon] = ym.split('-')
  return `${year}년 ${MONTH_KR[parseInt(mon) - 1]}`
}

export default function ReviewView() {
  const [stats, setStats] = useState([])
  const [goals, setGoals] = useState({})
  const [editingGoal, setEditingGoal] = useState(null)
  const [goalText, setGoalText] = useState('')

  const lookBackMonths = useMemo(() => getLastNMonths(6), [])
  const lookForwardMonths = useMemo(() => getNextNMonths(3), [])

  useEffect(() => {
    window.api.review.getStats(lookBackMonths).then(setStats)
  }, [])

  useEffect(() => {
    const allMonths = [...new Set([...lookBackMonths, ...lookForwardMonths])]
    Promise.all(allMonths.map((ym) => window.api.review.getGoal(ym).then((text) => [ym, text]))).then(
      (entries) => setGoals(Object.fromEntries(entries))
    )
  }, [])

  const handleSaveGoal = async (ym) => {
    await window.api.review.setGoal(ym, goalText)
    setGoals((prev) => ({ ...prev, [ym]: goalText }))
    setEditingGoal(null)
    setGoalText('')
  }

  const maxTotal = Math.max(...stats.map((s) => s.total), 1)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5 flex flex-col gap-8">

        {/* Look Back */}
        <section>
          <h2 className="text-lg font-extrabold text-slate-800 mb-0.5">📊 Look Back</h2>
          <p className="text-xs text-slate-400 mb-5">지난 6개월간 할일 완료율을 돌아보세요</p>

          <div className="grid grid-cols-6 gap-4">
            {stats.map((s) => {
              const [, mon] = s.ym.split('-')
              const barColor =
                s.rate >= 80 ? 'bg-green-400' : s.rate >= 50 ? 'bg-indigo-400' : s.rate > 0 ? 'bg-slate-300' : 'bg-slate-200'

              return (
                <div key={s.ym} className="flex flex-col items-center gap-1.5">
                  {/* 막대 */}
                  <div className="w-full bg-slate-100 rounded-lg h-24 flex items-end overflow-hidden">
                    <div
                      className={`w-full transition-all duration-500 ${barColor}`}
                      style={{ height: `${Math.max(s.rate, s.total > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${s.rate >= 80 ? 'text-green-600' : s.rate >= 50 ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {s.total > 0 ? `${s.rate}%` : '—'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{MONTH_KR[parseInt(mon) - 1]}</span>
                  <span className="text-xs text-slate-300">{s.done}/{s.total}</span>

                  {/* 이 달의 목표 미리보기 */}
                  {goals[s.ym] && (
                    <div className="w-full text-center">
                      <p className="text-xs text-slate-400 truncate" title={goals[s.ym]}>
                        🎯 {goals[s.ym].slice(0, 8)}{goals[s.ym].length > 8 ? '…' : ''}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Look Forward */}
        <section>
          <h2 className="text-lg font-extrabold text-slate-800 mb-0.5">🎯 Look Forward</h2>
          <p className="text-xs text-slate-400 mb-5">앞으로 3개월의 목표를 미리 세워보세요</p>

          <div className="flex flex-col gap-3">
            {lookForwardMonths.map((ym) => {
              const isEditing = editingGoal === ym
              const hasGoal = !!goals[ym]

              return (
                <div key={ym} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-700">{ymLabel(ym)}</span>
                    {!isEditing && (
                      <button
                        onClick={() => { setEditingGoal(ym); setGoalText(goals[ym] || '') }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                      >
                        {hasGoal ? '편집' : '+ 목표 추가'}
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        autoFocus
                        value={goalText}
                        onChange={(e) => setGoalText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingGoal(null)
                          if (e.key === 'Enter' && e.ctrlKey) handleSaveGoal(ym)
                        }}
                        rows={3}
                        placeholder="이달의 목표를 적어보세요... (Ctrl+Enter로 저장)"
                        className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingGoal(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleSaveGoal(ym)}
                          className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : hasGoal ? (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{goals[ym]}</p>
                  ) : (
                    <p className="text-xs text-slate-300 italic">목표를 입력해보세요 — 쓰면 실현될 확률이 높아집니다</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
