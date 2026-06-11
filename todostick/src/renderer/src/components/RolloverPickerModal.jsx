import { useState, useMemo } from 'react'

// 며칠 전인지 라벨 ("어제", "3일 전", ...)
function daysAgoLabel(dateStr, todayStr) {
  const d1 = new Date(dateStr + 'T00:00:00')
  const d2 = new Date(todayStr + 'T00:00:00')
  const diff = Math.round((d2 - d1) / 86400000)
  if (diff === 1) return '어제'
  if (diff > 1) return `${diff}일 전`
  return dateStr
}

export default function RolloverPickerModal({ candidates, todayStr, onClose, onConfirm }) {
  // 기본: 전체 체크 — 빠르게 "이월하기" 누르면 모두 이월되는 동선.
  const [checked, setChecked] = useState(() => new Set(candidates.map((c) => c.id)))

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => a.date.localeCompare(b.date) || (a.order_index - b.order_index)),
    [candidates]
  )

  const allChecked = checked.size === candidates.length
  const noneChecked = checked.size === 0

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(candidates.map((c) => c.id)))
  }

  const handleConfirm = () => {
    onConfirm(Array.from(checked))
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">📥 어제에서 이월할 항목 선택</h3>
          <p className="text-xs text-gray-500 mt-1">
            완료하지 못한 {candidates.length}개의 항목이 있습니다.
            체크한 항목만 오늘로 옮겨집니다.
          </p>
        </div>

        <div className="px-6 py-2 border-b border-gray-100 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 accent-indigo-500"
            />
            전체 선택
          </label>
          <span className="text-xs text-gray-400">{checked.size} / {candidates.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {sorted.map((task) => {
            const isChecked = checked.has(task.id)
            return (
              <label
                key={task.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  isChecked ? 'bg-indigo-50/60' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(task.id)}
                  className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 break-words">{task.title || '(제목 없음)'}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                    <span>📅 {daysAgoLabel(task.date, todayStr)} · {task.date}</span>
                    {task.is_in_progress && (
                      <span className="text-amber-600">· 진행중</span>
                    )}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            건너뛰기
          </button>
          <button
            onClick={handleConfirm}
            disabled={noneChecked}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {noneChecked ? '이월하기' : `${checked.size}개 이월하기`}
          </button>
        </div>
      </div>
    </div>
  )
}
