import { useEffect, useRef, useState } from 'react'

// 헤더 우측 UserMenu 옆에 표시되는 동기화 상태 점.
// 색상:
//   🟢 동기화됨 (queue 비고 에러 없음)
//   🔵 동기화 중 (running)
//   🟡 대기 (queue 쌓임 + 에러 없음)
//   🔴 에러 (lastError 있음)
// 클릭 시 마지막 sync 시각, 큐 길이, "지금 동기화" 버튼 노출.

function formatRelativeTime(iso) {
  if (!iso) return '아직 동기화 안 됨'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '아직 동기화 안 됨'
  const diff = Date.now() - then
  if (diff < 0) return '방금 전'
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return '방금 전'
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  return `${day}일 전`
}

export default function SyncStatusBadge() {
  const [status, setStatus] = useState({
    queueLength: 0,
    lastSyncedAt: null,
    lastError: null,
    running: false
  })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  // 초기 status 로드
  useEffect(() => {
    let cancelled = false
    window.api.sync?.status()
      .then((s) => { if (!cancelled && s) setStatus(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // main에서 broadcast된 status-changed 구독
  useEffect(() => {
    const handler = (_, s) => { if (s) setStatus(s) }
    window.api.sync?.onStatusChanged(handler)
    return () => window.api.sync?.offStatusChanged(handler)
  }, [])

  // 외부 클릭 시 popover 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // lastSyncedAt 라벨이 실시간으로 흐려지게 60s마다 강제 리렌더
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const dotColor = (() => {
    if (status.devMode) return 'bg-slate-400'
    if (status.lastError) return 'bg-rose-500'
    if (status.running) return 'bg-blue-500 animate-pulse'
    if (status.queueLength > 0) return 'bg-amber-400'
    return 'bg-emerald-500'
  })()

  const label = (() => {
    if (status.devMode) return '[DEV] 로컬 전용'
    if (status.lastError) return '동기화 오류'
    if (status.running) return '동기화 중'
    if (status.queueLength > 0) return `대기 중 ${status.queueLength}건`
    return '동기화됨'
  })()

  const handleRunNow = async () => {
    if (busy) return
    setBusy(true)
    try {
      await window.api.sync?.runNow()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        title={label}
        aria-label="동기화 상태"
      >
        <span className={`block w-2.5 h-2.5 rounded-full ${dotColor}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className={`block w-2.5 h-2.5 rounded-full ${dotColor}`} />
              <span className="text-sm font-semibold text-slate-800">{label}</span>
            </div>
            {status.devMode ? (
              <div className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                개발 빌드에서는 Supabase 동기화가 꺼져 있습니다.
                <br />release 환경과의 데이터 혼선을 막기 위함.
              </div>
            ) : (
              <>
                <div className="mt-1.5 text-xs text-slate-500">
                  마지막 동기화: {formatRelativeTime(status.lastSyncedAt)}
                </div>
                {status.queueLength > 0 && (
                  <div className="text-xs text-slate-500">
                    보낼 변경: {status.queueLength}건
                  </div>
                )}
                {status.lastError && (
                  <div className="mt-1.5 text-xs text-rose-600 break-words">
                    {status.lastError}
                  </div>
                )}
              </>
            )}
          </div>
          {!status.devMode && (
            <button
              type="button"
              onClick={handleRunNow}
              disabled={busy || status.running}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy || status.running ? '동기화 중…' : '지금 동기화'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
