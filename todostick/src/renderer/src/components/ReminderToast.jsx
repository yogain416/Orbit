import { useEffect, useState } from 'react'

export function playFunSound() {
  try {
    const ctx = new AudioContext()
    // 장난스러운 오름차순 아르페지오 (C5-E5-G5-C6)
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.09
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t)
      osc.stop(t + 0.35)
    })
  } catch {}
}

function Toast({ id, title, remind_at, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 마운트 직후 슬라이드업 트리거
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    setTimeout(() => onDismiss(id), 300)
  }

  return (
    <div
      className="flex items-start gap-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-indigo-100 dark:border-slate-700 px-4 py-3.5 w-80 cursor-pointer"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
      }}
      onClick={dismiss}
    >
      <span className="text-2xl flex-shrink-0 mt-0.5">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-300 mb-0.5">알림 · {remind_at}</p>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">클릭하여 닫기</p>
      </div>
    </div>
  )
}

export default function ReminderToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-[9999] pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
