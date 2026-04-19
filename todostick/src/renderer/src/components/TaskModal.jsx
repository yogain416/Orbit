import { useState, useEffect } from 'react'
import { getTodayStr } from '../utils/date'

const REPEAT_OPTIONS = [
  { value: 'none', label: '없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' }
]

export default function TaskModal({ task, defaultDate, onClose }) {
  const [title, setTitle] = useState(task?.title || '')
  const [memo, setMemo] = useState(task?.memo || '')
  const [date, setDate] = useState(task?.date || defaultDate || getTodayStr())
  const [repeatType, setRepeatType] = useState(task?.repeat_type || 'none')
  const [saving, setSaving] = useState(false)

  const isEdit = !!task
  const titleLen = title.length
  const overLimit = titleLen > 100

  const handleSave = async () => {
    if (!title.trim() || overLimit) return
    setSaving(true)
    if (isEdit) {
      await window.api.tasks.update(task.id, { title: title.trim(), memo, date, repeat_type: repeatType })
    } else {
      await window.api.tasks.create({ title: title.trim(), memo, date, repeat_type: repeatType })
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{isEdit ? '할 일 편집' : '할 일 추가'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-4 flex flex-col gap-4">
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
