import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_CATEGORIES, PALETTE, categoryStyle } from '../utils/categories'

const SHORTCUT_DEFS = [
  { key: 'openMain', label: '메인 창 열기', desc: '어디서든 메인 창을 포커스' },
  { key: 'toggleSticker', label: '스티커 토글', desc: '스티커 팝업 열기/닫기' }
]

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('shortcuts')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">⚙️ 설정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-100 px-6">
          {[['shortcuts', '단축키'], ['categories', '카테고리']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'shortcuts' ? (
          <ShortcutsTab onClose={onClose} />
        ) : (
          <CategoriesTab onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function ShortcutsTab({ onClose }) {
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
    if (e.key === 'Escape') { setRecording(null); return }
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

  return (
    <>
      <div className="px-6 py-4 flex flex-col gap-3 overflow-y-auto flex-1">
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

        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 mb-2">앱 내 단축키 (변경 불가)</p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            {[['Ctrl+N', '할일 추가'], ['T', '오늘로 이동'], ['Enter', '모달에서 저장'], ['Esc', '모달 닫기']].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{desc}</span>
                <kbd className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-600">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-gray-100">
        <button
          onClick={() => window.api.shortcuts.get().then(setShortcuts)}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          기본값 복원
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>
      </div>
    </>
  )
}

function CategoriesTab({ onClose }) {
  const [categories, setCategories] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[7])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    window.api.categories.get().then((cats) => {
      setCategories(cats.length ? cats : DEFAULT_CATEGORIES)
    })
  }, [])

  const save = async (updated) => {
    setCategories(updated)
    await window.api.categories.set(updated)
  }

  const handleAdd = async () => {
    const label = newLabel.trim()
    if (!label || categories.length >= 10) return
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    await save([...categories, { id, label, color: newColor }])
    setNewLabel('')
    setNewColor(PALETTE[7])
    setAdding(false)
  }

  const handleDelete = async (id) => {
    await save(categories.filter((c) => c.id !== id))
  }

  return (
    <>
      <div className="px-6 py-4 flex flex-col gap-3 overflow-y-auto flex-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500">카테고리 목록</p>
          <p className="text-xs text-gray-400">{categories.length}/10</p>
        </div>

        {/* 카테고리 목록 */}
        <div className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="flex-1 text-sm text-gray-700 truncate">{c.label}</span>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-gray-300 hover:text-red-400 transition-colors text-sm flex-shrink-0"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">카테고리가 없습니다</p>
          )}
        </div>

        {/* 추가 폼 */}
        {adding ? (
          <div className="flex flex-col gap-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/30">
            <input
              autoFocus
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="카테고리 이름"
              maxLength={12}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
            />
            <div>
              <p className="text-xs text-gray-400 mb-2">색상 선택</p>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setNewColor(hex)}
                    className={`w-7 h-7 rounded-full transition-all ${newColor === hex ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'hover:scale-110 opacity-80'}`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setAdding(false); setNewLabel('') }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={!newLabel.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                추가
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={categories.length >= 10}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span>+</span>
            <span>{categories.length >= 10 ? '최대 10개까지 가능합니다' : '새 카테고리 추가'}</span>
          </button>
        )}
      </div>

      <div className="flex justify-end px-6 py-4 border-t border-gray-100">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          닫기
        </button>
      </div>
    </>
  )
}
