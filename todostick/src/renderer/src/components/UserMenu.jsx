import { useState, useRef, useEffect } from 'react'

export default function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const email = user?.email || ''
  const displayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || email || '사용자'
  const initial = (displayName || 'U').charAt(0).toUpperCase()
  const avatar = user?.user_metadata?.avatar_url

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold text-xs hover:bg-indigo-200 transition-colors overflow-hidden"
        title={email || displayName}
        aria-label="계정 메뉴"
      >
        {avatar ? (
          <img src={avatar} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-800 truncate">{displayName}</div>
            {email && email !== displayName && (
              <div className="text-xs text-slate-500 truncate">{email}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
