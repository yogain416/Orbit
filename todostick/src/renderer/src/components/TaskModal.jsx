import { useState, useEffect } from 'react'
import { getTodayStr } from '../utils/date'
import { DEFAULT_CATEGORIES, categoryStyle } from '../utils/categories'

const COLORS = [
  { value: null, bg: 'bg-slate-200', label: '없음' },
  { value: 'red', bg: 'bg-red-400', label: '빨강' },
  { value: 'orange', bg: 'bg-orange-400', label: '주황' },
  { value: 'yellow', bg: 'bg-yellow-400', label: '노랑' },
  { value: 'green', bg: 'bg-green-400', label: '초록' },
  { value: 'blue', bg: 'bg-blue-400', label: '파랑' },
  { value: 'purple', bg: 'bg-purple-400', label: '보라' },
]

const REPEAT_OPTIONS = [
  { value: 'none', label: '없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' }
]

export default function TaskModal({ task, defaultDate, timeDefaults, onClose }) {
  const [title, setTitle] = useState(task?.title || '')
  const [memo, setMemo] = useState(task?.memo || '')
  const [date, setDate] = useState(task?.date || defaultDate || getTodayStr())
  const [repeatType, setRepeatType] = useState(task?.repeat_type || 'none')
  const [repeatDays, setRepeatDays] = useState(task?.repeat_days || [0, 1, 2, 3, 4, 5, 6])
  const [remindAt, setRemindAt] = useState(task?.remind_at || '')
  const [color, setColor] = useState(task?.color || null)
  const [category, setCategory] = useState(task?.category || null)
  const [startTime, setStartTime] = useState(task?.start_time || timeDefaults?.start_time || '')
  const [endTime, setEndTime] = useState(task?.end_time || timeDefaults?.end_time || '')
  const [completionNote, setCompletionNote] = useState(task?.completion_note || '')
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  useEffect(() => {
    window.api.categories.get().then((cats) => {
      if (cats.length) setCategories(cats)
    })
  }, [])

  const isEdit = !!task
  const titleLen = title.length
  const overLimit = titleLen > 100

  const handleSave = async () => {
    if (!title.trim() || overLimit) return
    setSaving(true)
    const payload = {
      title: title.trim(), memo, date,
      repeat_type: repeatType,
      repeat_days: repeatType === 'daily' ? repeatDays : null,
      remind_at: remindAt || null,
      start_time: startTime || null,
      end_time: endTime || null,
      color: color || null,
      category: category || null,
      ...(isEdit && task.is_completed ? { completion_note: completionNote.trim() || null } : {})
    }
    if (isEdit) {
      await window.api.tasks.update(task.id, payload)
    } else {
      await window.api.tasks.create(payload)
    }
    window.api.tasks.notifyChanged()
    setSaving(false)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{isEdit ? '할 일 편집' : '할 일 추가'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* 제목 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">제목 *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="할 일을 입력하세요"
              maxLength={110}
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors ${
                overLimit
                  ? 'border-red-300 focus:border-red-400'
                  : 'border-gray-200 focus:border-indigo-400'
              }`}
            />
            <div className={`text-xs text-right mt-1 ${overLimit ? 'text-red-500' : 'text-gray-400'}`}>
              {titleLen}/100
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* 시간 (타임블록용) */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">시간 (선택 — 타임블록 뷰용)</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <span className="text-gray-400 text-xs flex-shrink-0">~</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              {(startTime || endTime) && (
                <button
                  type="button"
                  onClick={() => { setStartTime(''); setEndTime('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0"
                >
                  지우기
                </button>
              )}
            </div>
            {startTime && endTime && (() => {
              const [sh, sm] = startTime.split(':').map(Number)
              const [eh, em] = endTime.split(':').map(Number)
              const dur = (eh * 60 + em) - (sh * 60 + sm)
              return dur > 0 ? <p className="text-xs text-indigo-500 mt-1">⏱ {startTime} ~ {endTime} ({dur}분)</p> : null
            })()}
          </div>

          {/* 카테고리 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">카테고리</label>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                type="button"
                onClick={() => setCategory(null)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                  category === null
                    ? 'bg-slate-200 text-slate-700 border-slate-400 ring-2 ring-offset-1 ring-indigo-400'
                    : 'bg-slate-100 text-slate-500 border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                없음
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  style={categoryStyle(c.color, category === c.id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                    category === c.id ? 'ring-2 ring-offset-1 ring-indigo-400' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 색상 태그 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">색상 태그</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={String(c.value)}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-all ${
                    color === c.value
                      ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110'
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 반복 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">반복</label>
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {repeatType === 'daily' && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {['일', '월', '화', '수', '목', '금', '토'].map((label, day) => {
                    const active = repeatDays.includes(day)
                    const isWeekend = day === 0 || day === 6
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setRepeatDays((prev) =>
                          active ? prev.filter((d) => d !== day) : [...prev, day].sort()
                        )}
                        className={`flex-1 py-1 text-xs rounded-md font-medium transition-all border ${
                          active
                            ? isWeekend
                              ? 'bg-rose-100 border-rose-300 text-rose-700'
                              : 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRepeatDays([1, 2, 3, 4, 5])}
                    className="text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    평일만
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeatDays([0, 1, 2, 3, 4, 5, 6])}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    매일
                  </button>
                </div>
              </div>
            )}
            {repeatType !== 'none' && (
              <p className="text-xs text-indigo-500 mt-1">🔁 선택한 날짜부터 자동으로 반복 생성됩니다</p>
            )}
          </div>

          {/* 알림 시간 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">알림 시간 (선택)</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              {remindAt && (
                <button
                  onClick={() => setRemindAt('')}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100"
                >
                  지우기
                </button>
              )}
            </div>
            {remindAt && (
              <p className="text-xs text-indigo-500 mt-1">🔔 {remindAt}에 시스템 알림이 울립니다</p>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="추가 메모 (선택)"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
            />
          </div>

          {/* 완료 메모 (완료된 할일 편집 시만 표시) */}
          {isEdit && task.is_completed && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">완료 메모</label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="완료 후 기록 (운동 결과, 소감 등)"
                rows={3}
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 resize-none bg-green-50"
              />
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || overLimit || saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
