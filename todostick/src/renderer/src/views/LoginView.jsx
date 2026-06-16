import { useState } from 'react'

export default function LoginView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [waitingCallback, setWaitingCallback] = useState(false)

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

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md mx-auto px-8">
        <div className="text-center mb-10">
          <div className="text-5xl text-indigo-500 mb-3">◎</div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Orbit</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">개인과 팀의 일정·할일·프로젝트를 잇는 운영 OS</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading || waitingCallback}
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

          {error && (
            <div className="mt-5 px-3 py-3 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
              {error}
            </div>
          )}

          <p className="mt-6 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed text-center">
            로그인 시 Google Calendar·Tasks 접근 권한을 요청합니다. (PC가 Google API를 직접 호출)
          </p>
        </div>
      </div>
    </div>
  )
}
