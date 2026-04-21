import { useState, useEffect, useCallback } from 'react'

const SHORTCUT_DEFS = [
  { key: 'openMain', label: '메인 창 열기', desc: '어디서든 메인 창을 포커스' },
  { key: 'toggleSticker', label: '스티커 토글', desc: '스티커 팝업 열기/닫기' }
]

export default function SettingsModal({ onClose }) {
  const [shortcuts, setShortcuts] = useState({})
  const [recording, setRecording] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.shortcuts.get().then(setShortcuts)
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()

    const parts = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')

    const ignored = ['Control', 'Shift', 'Alt', 'Meta', 'Escape']
    if (!ignored.includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
    }

    if (e.key === 'Escape') {
      setRecording(null)
      return
    }

    if (parts.length >= 2) {
      setShortcuts((prev) => ({ ...prev, [recording]: parts.join('+') }))
      setRecording(null)
    }
  }, [recording])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleSave = async () => {
    await window.api.shortcuts.set(shortcuts)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  const handleReset = async () => {
    const defaults = await window.api.shortcuts.get()
    setShortcuts(defaults)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">⚙️ 단축키 설정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* 단축키 목록 */}
        <div className="px-6 py-4 flex flex-col gap-3">
          {SHORTCUT_DEFS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <button
                onClick={() => setRecording(recording === key ? null : key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-sm font-mono transition-all ${
                  recording === key
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-600 animate-pulse'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {recording === key ? '키를 누르세요...' : (shortcuts[key] || '미설정')}
              </button>
            </div>
          ))}

          <p className="text-xs text-gray-400 mt-1">
            단축키 버튼 클릭 후 원하는 키 조합을 누르세요 (예: Ctrl+Shift+T). ESC로 취소.
          </p>
        </div>

        {/* 앱 내 단축키 안내 */}
        <div className="px-6 pb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">앱 내 단축키 (변경 불가)</p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            {[
              ['Ctrl+N', '할일 추가'],
              ['T', '오늘로 이동'],
              ['Enter', '모달에서 저장'],
              ['Esc', '모달 닫기'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{desc}</span>
                <kbd className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-600">{key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            기본값 복원
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {saved ? '저장됨 ✓' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
