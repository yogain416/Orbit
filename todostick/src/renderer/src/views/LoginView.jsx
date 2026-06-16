import { useState, useEffect } from 'react'

const MAX_LOCAL = 3

export default function LoginView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [waitingCallback, setWaitingCallback] = useState(false)

  // 로컬 프로필
  const [profiles, setProfiles] = useState([])
  const [adding, setAdding] = useState(false)
  const [newNick, setNewNick] = useState('')
  const [busy, setBusy] = useState(false)

  const loadProfiles = () => {
    window.api.local?.list().then((list) => setProfiles(list || [])).catch(() => {})
  }
  useEffect(loadProfiles, [])

  const handleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await window.api.auth.signInWithGoogle()
      // 외부 브라우저가 열리고, 인증 후 deep link로 돌아오면 onStateChanged 콜백이 발화한다.
      setWaitingCallback(true)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // 프로필 선택 → 입장. main이 auth:state-changed를 emit하면 AuthGate가 MainApp으로 전환.
  const enterProfile = async (id) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await window.api.local.login(id)
    } catch (e) {
      setError(e?.message || String(e))
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    const name = newNick.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      const { profile } = await window.api.local.create(name)
      setNewNick('')
      setAdding(false)
      // 만든 즉시 그 프로필로 입장
      await window.api.local.login(profile.id)
    } catch (e) {
      setError(e?.message || String(e))
      setBusy(false)
    }
  }

  const handleDelete = async (e, profile) => {
    e.stopPropagation()
    if (busy) return
    if (!window.confirm(`'${profile.nickname}' 플레이어를 삭제할까요?\n이 프로필의 로컬 데이터는 더 이상 보이지 않습니다.`)) return
    setBusy(true)
    try {
      const list = await window.api.local.delete(profile.id)
      setProfiles(list || [])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md mx-auto px-8">
        <div className="text-center mb-8">
          <div className="text-5xl text-indigo-500 mb-3">◎</div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Orbit</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">개인과 팀의 일정·할일·프로젝트를 잇는 운영 OS</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading || waitingCallback || busy}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg font-semibold text-slate-700 dark:text-slate-100 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            {loading ? '브라우저 여는 중...' : 'Google로 로그인'}
          </button>

          {waitingCallback && (
            <div className="mt-5 px-3 py-3 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              브라우저에서 Google 로그인을 완료해 주세요. 인증이 끝나면 자동으로 이 창으로 돌아옵니다.
            </div>
          )}

          {/* 구분선 */}
          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400 dark:text-slate-500">또는 로컬로 시작</span>
            <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* 로컬 프로필 (오프라인, 최대 3명) */}
          <div className="flex flex-col gap-2">
            {profiles.map((p) => (
              <div
                key={p.id}
                onClick={() => enterProfile(p.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 transition-colors ${busy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
              >
                <span
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: p.color || '#6366f1' }}
                >
                  {(p.nickname || 'P').charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{p.nickname}</span>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, p)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-500 hover:text-rose-400 dark:hover:text-rose-300 transition-all text-sm flex-shrink-0"
                  title="플레이어 삭제"
                >
                  ✕
                </button>
              </div>
            ))}

            {adding ? (
              <div className="flex flex-col gap-2 p-3 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-500/10">
                <input
                  autoFocus
                  type="text"
                  value={newNick}
                  onChange={(e) => setNewNick(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setAdding(false); setNewNick('') } }}
                  placeholder="닉네임 입력"
                  maxLength={20}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setNewNick('') }}
                    className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newNick.trim() || busy}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    만들고 시작
                  </button>
                </div>
              </div>
            ) : (
              profiles.length < MAX_LOCAL && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-400 dark:text-slate-500 hover:border-indigo-300 hover:text-indigo-500 dark:hover:text-indigo-300 disabled:opacity-40 transition-colors"
                >
                  <span>+</span>
                  <span>새 플레이어 추가</span>
                </button>
              )
            )}
            {profiles.length >= MAX_LOCAL && !adding && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">로컬 플레이어는 최대 {MAX_LOCAL}명까지 만들 수 있어요.</p>
            )}
          </div>

          {error && (
            <div className="mt-5 px-3 py-3 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
              {error}
            </div>
          )}

          <p className="mt-6 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed text-center">
            <strong>Google 로그인</strong>: Calendar·Tasks 연동 + 여러 기기 동기화.<br />
            <strong>로컬</strong>: 계정 없이 이 PC에서만 사용 (동기화 없음).
          </p>
        </div>
      </div>
    </div>
  )
}
