import { useState, useEffect, useCallback } from 'react'
import DayView from './views/DayView'
import WeekView from './views/WeekView'
import MonthView from './views/MonthView'
import RecordsView from './views/RecordsView'
import TimeBlockView from './views/TimeBlockView'
import ReviewView from './views/ReviewView'
import HabitView from './views/HabitView'
import HoldView from './views/HoldView'
import LoginView from './views/LoginView'
import TaskModal from './components/TaskModal'
import StickerPopup from './components/StickerPopup'
import SettingsModal from './components/SettingsModal'
import UserMenu from './components/UserMenu'
import SyncStatusBadge from './components/SyncStatusBadge'
import ReminderToastContainer, { playFunSound } from './components/ReminderToast'
import { formatDate, getTodayStr } from './utils/date'

const VIEWS = ['일별', '주별', '월별', '타임블록', '습관', '보류', '리뷰', '기록']

export default function App() {
  const isSticker = window.location.hash === '#sticker'
  if (isSticker) return <StickerPopup />
  return <AuthGate />
}

function AuthGate() {
  // 'unknown'은 초기 getSession 로딩 중. session === null이면 LoginView, session 있으면 MainApp.
  const [session, setSession] = useState('unknown')

  useEffect(() => {
    let cancelled = false
    window.api.auth.getSession()
      .then((s) => { if (!cancelled) setSession(s || null) })
      .catch(() => { if (!cancelled) setSession(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handler = (_, payload) => setSession(payload?.session || null)
    window.api.auth.onStateChanged(handler)
    return () => window.api.auth.offStateChanged(handler)
  }, [])

  if (session === 'unknown') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
        <span className="text-sm text-slate-400 dark:text-slate-500">불러오는 중...</span>
      </div>
    )
  }
  if (!session) return <LoginView />
  return <MainApp user={session.user} />
}

function MainApp({ user }) {
  const [view, setView] = useState('일별')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defaultDate, setDefaultDate] = useState(getTodayStr())
  const [modalTimeDefaults, setModalTimeDefaults] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [envInfo, setEnvInfo] = useState({ isDev: false, dbPath: '' })

  useEffect(() => {
    window.api.env?.info().then(setEnvInfo).catch(() => {})
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const handler = (_, task) => {
      playFunSound()
      const id = Date.now()
      setToasts((prev) => [...prev, { id, ...task }])
      setTimeout(() => dismissToast(id), 6000)
    }
    window.api.reminders.onNotify(handler)
    return () => window.api.reminders.offNotify(handler)
  }, [dismissToast])

  const isToday = getTodayStr() === getTodayStr(currentDate)

  const openAddModal = useCallback((date = getTodayStr(), timeDefaults = null) => {
    setEditingTask(null)
    setDefaultDate(typeof date === 'string' ? date : getTodayStr())
    setModalTimeDefaults(timeDefaults)
    setModalOpen(true)
  }, [])

  const openEditModal = useCallback((task) => {
    setEditingTask(task)
    setModalOpen(true)
  }, [])

  const goToToday = () => setCurrentDate(new Date())

  const handleSignOut = useCallback(async () => {
    try {
      // signOut 후 main의 'auth:state-changed'가 발화하여 AuthGate가 LoginView로 자동 전환한다.
      await window.api.auth.signOut()
    } catch (e) {
      console.error('signOut failed:', e)
    }
  }, [])

  // 전역 키보드 단축키
  useEffect(() => {
    const handler = (e) => {
      if (modalOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        openAddModal(getTodayStr(currentDate))
      }
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) goToToday()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen, currentDate, openAddModal])

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
      {/* 헤더 — 좁아져도 깨지지 않도록 gap/padding 최소화 + 라벨 반응형 */}
      <header className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        {/* 로고 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-lg text-indigo-500">◎</span>
          <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-base tracking-tight">Orbit</span>
          {envInfo.isDev && (
            <span
              title={`개발 모드 — DB: ${envInfo.dbPath}`}
              className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-500/30 cursor-help"
            >
              DEV
            </span>
          )}
        </div>

        {/* 날짜 네비게이션 — flex-1로 가변, 길어지면 truncate */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{formatDate(currentDate)}</span>
          {!isToday && (
            <button
              onClick={goToToday}
              className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors font-medium flex-shrink-0"
            >
              오늘로
            </button>
          )}
        </div>

        {/* 뷰 전환 — 좁아질수록 px 축소 */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                view === v
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* 추가 버튼 — lg 미만에서는 + 아이콘만 */}
        <button
          onClick={() => openAddModal(getTodayStr(currentDate))}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0"
          title="Ctrl+N — 할일 추가"
        >
          <span className="text-sm leading-none">+</span>
          <span className="hidden lg:inline">추가</span>
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
          title="단축키 설정"
        >
          ⚙️
        </button>
        <SyncStatusBadge />
        <UserMenu user={user} onSignOut={handleSignOut} />
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden">
        {view === '일별' && (
          <DayView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onAddTask={openAddModal}
            onEditTask={openEditModal}
          />
        )}
        {view === '주별' && (
          <WeekView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onDateClick={(date) => { setCurrentDate(new Date(date + 'T00:00:00')); setView('일별') }}
            onAddTask={openAddModal}
            onEditTask={openEditModal}
          />
        )}
        {view === '월별' && (
          <MonthView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onDateClick={(date) => { setCurrentDate(new Date(date + 'T00:00:00')); setView('일별') }}
            onAddTask={openAddModal}
            onEditTask={openEditModal}
          />
        )}
        {view === '타임블록' && (
          <TimeBlockView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onAddTask={openAddModal}
            onEditTask={openEditModal}
          />
        )}
        {view === '습관' && <HabitView />}
        {view === '보류' && <HoldView />}
        {view === '리뷰' && <ReviewView />}
        {view === '기록' && <RecordsView />}
      </main>

      {/* 하단 단축키 힌트 */}
      <div className="px-5 py-1.5 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-4">
        <span className="text-xs text-slate-400 dark:text-slate-500"><kbd className="bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-1 rounded text-xs">Ctrl+N</kbd> 할일 추가</span>
        <span className="text-xs text-slate-400 dark:text-slate-500"><kbd className="bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-1 rounded text-xs">T</kbd> 오늘로 이동</span>
      </div>

      {/* 할일 추가/편집 모달 */}
      {modalOpen && (
        <TaskModal
          task={editingTask}
          defaultDate={defaultDate}
          timeDefaults={modalTimeDefaults}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* 단축키 설정 모달 */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* 알림 토스트 */}
      <ReminderToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
