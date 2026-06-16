import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_CATEGORIES, PALETTE, categoryStyle } from '../utils/categories'
import { getStoredTheme, setTheme } from '../utils/theme'

const THEME_CHOICES = [
  { value: 'light', label: '라이트', icon: '☀️' },
  { value: 'dark', label: '다크', icon: '🌙' },
  { value: 'system', label: '시스템', icon: '🖥️' }
]

const SHORTCUT_DEFS = [
  { key: 'openMain', label: '메인 창 열기', desc: '어디서든 메인 창을 포커스' },
  { key: 'toggleSticker', label: '스티커 토글', desc: '스티커 팝업 열기/닫기' }
]

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('shortcuts')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="font-bold text-gray-800 dark:text-slate-100">⚙️ 설정</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-200 text-lg">✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-100 dark:border-slate-700 px-6">
          {[['shortcuts', '단축키'], ['categories', '카테고리'], ['general', '일반']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                  : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'shortcuts' && <ShortcutsTab onClose={onClose} />}
        {tab === 'categories' && <CategoriesTab onClose={onClose} />}
        {tab === 'general' && <GeneralTab onClose={onClose} />}
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
              <p className="text-sm font-medium text-gray-700 dark:text-slate-200">{label}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{desc}</p>
            </div>
            <button
              onClick={() => setRecording(recording === key ? null : key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-sm font-mono transition-all ${
                recording === key
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 animate-pulse'
                  : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40 text-gray-700 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15'
              }`}
            >
              {recording === key ? '키를 누르세요...' : (shortcuts[key] || '미설정')}
            </button>
          </div>
        ))}
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
          단축키 버튼 클릭 후 원하는 키 조합을 누르세요 (예: Ctrl+Shift+T). ESC로 취소.
        </p>

        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">앱 내 단축키 (변경 불가)</p>
          <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            {[['Ctrl+N', '할일 추가'], ['T', '오늘로 이동'], ['Enter', '모달에서 저장'], ['Esc', '모달 닫기']].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">{desc}</span>
                <kbd className="text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-2 py-0.5 font-mono text-gray-600 dark:text-slate-300">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
        <button
          onClick={() => window.api.shortcuts.get().then(setShortcuts)}
          className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
        >
          기본값 복원
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
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
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400">카테고리 목록</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{categories.length}/10</p>
        </div>

        {/* 카테고리 목록 */}
        <div className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-700/40">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="flex-1 text-sm text-gray-700 dark:text-slate-200 truncate">{c.label}</span>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-gray-300 dark:text-slate-500 hover:text-red-400 dark:hover:text-red-300 transition-colors text-sm flex-shrink-0"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">카테고리가 없습니다</p>
          )}
        </div>

        {/* 추가 폼 */}
        {adding ? (
          <div className="flex flex-col gap-3 p-3 rounded-xl border border-indigo-100 dark:border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-500/15">
            <input
              autoFocus
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="카테고리 이름"
              maxLength={12}
              className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">색상 선택</p>
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
                className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-200 dark:border-slate-600 text-sm text-gray-400 dark:text-slate-500 hover:border-indigo-300 hover:text-indigo-500 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span>+</span>
            <span>{categories.length >= 10 ? '최대 10개까지 가능합니다' : '새 카테고리 추가'}</span>
          </button>
        )}
      </div>

      <div className="flex justify-end px-6 py-4 border-t border-gray-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          닫기
        </button>
      </div>
    </>
  )
}

function GeneralTab({ onClose }) {
  const [autoLaunch, setAutoLaunch] = useState(true)
  const [loading, setLoading] = useState(true)
  const [theme, setThemeState] = useState(getStoredTheme())

  useEffect(() => {
    window.api.app?.getAutoLaunch().then((v) => { setAutoLaunch(!!v); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const chooseTheme = (value) => {
    setThemeState(value)
    setTheme(value) // localStorage 저장 + 즉시 적용 + 다른 창에 전파
  }

  const toggle = async () => {
    const next = !autoLaunch
    setAutoLaunch(next)
    try {
      const applied = await window.api.app.setAutoLaunch(next)
      setAutoLaunch(!!applied)
    } catch {
      setAutoLaunch(!next) // 실패 시 롤백
    }
  }

  return (
    <>
      <div className="px-6 py-4 flex flex-col gap-3 overflow-y-auto flex-1">
        {/* 테마 (다크모드) */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">테마</p>
          <div className="flex gap-2">
            {THEME_CHOICES.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => chooseTheme(value)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  theme === value
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-gray-200 text-gray-500 hover:border-indigo-300 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-500'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
            '시스템'은 Windows 다크모드 설정을 따라갑니다.
          </p>
        </div>

        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-200">컴퓨터 시작 시 자동 실행</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Windows에 로그인하면 Orbit이 자동으로 켜집니다.</p>
          </div>
          <button
            onClick={toggle}
            disabled={loading}
            role="switch"
            aria-checked={autoLaunch}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${autoLaunch ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoLaunch ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
          꺼져 있어도 트레이 아이콘에서 언제든 다시 열 수 있어요. 개발 모드에서는 적용되지 않습니다.
        </p>

        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />

        <UpdateSection />
      </div>

      <div className="flex justify-end px-6 py-4 border-t border-gray-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          닫기
        </button>
      </div>
    </>
  )
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

function UpdateSection() {
  // state: { version, status, info, progress, error }
  const [state, setState] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.updater?.getState().then((s) => { if (alive) setState(s) }).catch(() => {})
    const handler = (_, s) => setState((prev) => ({ ...prev, ...s }))
    window.api.updater?.onStatus(handler)
    return () => { alive = false; window.api.updater?.offStatus(handler) }
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      const s = await window.api.updater.check()
      setState((prev) => ({ ...prev, ...s }))
    } catch {
      // 무시 — 상태 이벤트로 error가 들어옴
    } finally {
      setChecking(false)
    }
  }

  const restart = () => window.api.updater?.quitAndInstall()

  const status = state?.status
  const version = state?.version
  const isDev = state?.info?.devMode
  const newVersion = state?.info?.version
  const percent = state?.progress?.percent

  // 상태별 한 줄 안내
  let statusLine = null
  if (isDev) {
    statusLine = <span className="text-gray-400 dark:text-slate-500">개발 모드에서는 자동 업데이트가 비활성화됩니다.</span>
  } else if (status === 'checking') {
    statusLine = <span className="text-gray-500 dark:text-slate-400">업데이트 확인 중…</span>
  } else if (status === 'available') {
    statusLine = <span className="text-indigo-600 dark:text-indigo-300">새 버전 {newVersion} 발견 — 다운로드 중…</span>
  } else if (status === 'downloading') {
    statusLine = (
      <span className="text-indigo-600 dark:text-indigo-300">
        다운로드 중 {percent != null ? `${percent.toFixed(0)}%` : ''}
        {state?.progress?.total ? ` (${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)})` : ''}
      </span>
    )
  } else if (status === 'downloaded') {
    statusLine = <span className="text-green-600 dark:text-green-400">새 버전 {newVersion} 준비 완료 — 재시작하면 설치됩니다.</span>
  } else if (status === 'not-available') {
    statusLine = <span className="text-gray-500 dark:text-slate-400">최신 버전을 사용 중입니다.</span>
  } else if (status === 'error') {
    statusLine = <span className="text-red-500 dark:text-red-400 break-all">확인 실패: {state?.error}</span>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-200">업데이트</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            현재 버전 <span className="font-mono">v{version || '…'}</span>
          </p>
        </div>
        {status === 'downloaded' ? (
          <button
            onClick={restart}
            className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            지금 재시작
          </button>
        ) : (
          <button
            onClick={check}
            disabled={checking || isDev || status === 'checking' || status === 'downloading'}
            className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'checking' || status === 'downloading' ? '확인 중…' : '업데이트 확인'}
          </button>
        )}
      </div>
      {statusLine && <p className="text-xs mt-1.5">{statusLine}</p>}
    </div>
  )
}
