import { useState, useEffect } from 'react'
import DayView from './views/DayView'
import WeekView from './views/WeekView'
import MonthView from './views/MonthView'
import TaskModal from './components/TaskModal'
import StickerPopup from './components/StickerPopup'
import { formatDate, getTodayStr } from './utils/date'

const VIEWS = ['일별', '주별', '월별']

export default function App() {
  const isSticker = window.location.hash === '#sticker'
  if (isSticker) {
    return <StickerPopup />
  }

  return <MainApp />
}

function MainApp() {
  const [view, setView] = useState('일별')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defaultDate, setDefaultDate] = useState(getTodayStr())

  const openAddModal = (date = getTodayStr()) => {
    setEditingTask(null)
    setDefaultDate(date)
    setModalOpen(true)
  }

  const openEditModal = (task) => {
    setEditingTask(task)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-indigo-600">📌 TodoStick</span>
        </div>

        {/* 뷰 전환 탭 */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-500">
          {formatDate(currentDate)}
        </div>
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
            onDateClick={(date) => { setCurrentDate(new Date(date)); setView('일별') }}
            onAddTask={openAddModal}
          />
        )}
        {view === '월별' && (
          <MonthView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onDateClick={(date) => { setCurrentDate(new Date(date)); setView('일별') }}
          />
        )}
      </main>

      {/* 할일 추가/편집 모달 */}
      {modalOpen && (
        <TaskModal
          task={editingTask}
          defaultDate={defaultDate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

