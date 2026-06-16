import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_CATEGORIES, getCategoryById, categoryStyle } from '../utils/categories'
import MarkdownView from '../components/MarkdownView'

export default function RecordsView() {
  const [tasks, setTasks] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats.length) setCategories(cats) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const data = await window.api.tasks.getCompleted({ category: categoryFilter, search })
    setTasks(data)
    setLoading(false)
  }, [categoryFilter, search])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  // 날짜별 그룹핑
  const grouped = tasks.reduce((acc, task) => {
    const date = (task.completed_at || task.updated_at || task.date).slice(0, 10)
    if (!acc[date]) acc[date] = []
    acc[date].push(task)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 / 필터 */}
      <div className="px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목 또는 메모로 검색"
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 rounded-lg text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{tasks.length}개</span>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setCategoryFilter(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
              categoryFilter === null
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            전체
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
              style={categoryStyle(c.color, categoryFilter === c.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                categoryFilter === c.id ? 'ring-2 ring-offset-1 ring-indigo-400' : 'opacity-70 hover:opacity-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기록 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm">불러오는 중...</div>
        ) : sortedDates.length === 0 ? (
          <EmptyRecords search={search} />
        ) : (
          <div className="flex flex-col gap-6">
            {sortedDates.map((date) => (
              <DateGroup key={date} date={date} tasks={grouped[date]} onUpdated={load} categories={categories} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DateGroup({ date, tasks, onUpdated, categories }) {
  const d = new Date(date + 'T00:00:00')
  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_KO[d.getDay()]})`

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{tasks.length}개 완료</span>
        <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <RecordCard key={task.id} task={task} onUpdated={onUpdated} categories={categories} />
        ))}
      </div>
    </div>
  )
}

function RecordCard({ task, onUpdated, categories }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [noteValue, setNoteValue] = useState(task.completion_note || '')
  const [saving, setSaving] = useState(false)
  const catInfo = task.category ? getCategoryById(task.category, categories) : null

  const handleSaveNote = async () => {
    setSaving(true)
    await window.api.tasks.update(task.id, { completion_note: noteValue.trim() || null })
    window.api.tasks.notifyChanged()
    setSaving(false)
    setEditing(false)
    onUpdated?.()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setEditing(false); setNoteValue(task.completion_note || '') }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveNote() }
  }

  const currentNote = task.completion_note
  const hasDetail = currentNote || task.memo

  return (
    <div className="rounded-xl border bg-white dark:bg-slate-800 p-3.5 transition-all hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:shadow-sm border-slate-100 dark:border-slate-700">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-green-500 text-base flex-shrink-0">✓</span>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => !editing && setExpanded((v) => !v)}
        >
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 line-through">{task.title}</p>
          {currentNote && !expanded && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 truncate">{currentNote}</p>
          )}
          {!currentNote && task.memo && !expanded && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{task.memo}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {catInfo && (
            <span
              style={{ backgroundColor: catInfo.color + '20', color: catInfo.color }}
              className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
            >
              {catInfo.label}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setEditing(true) }}
            className="text-xs text-slate-300 dark:text-slate-500 hover:text-indigo-400 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded transition-colors"
            title="완료 메모 편집"
          >
            ✎
          </button>
          {hasDetail && (
            <span
              className="text-xs text-slate-300 dark:text-slate-500 cursor-pointer"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-2 ml-7 flex flex-col gap-1.5">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                autoFocus
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="완료 메모를 입력하세요"
                rows={3}
                className="w-full border border-indigo-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs outline-none resize-none focus:border-indigo-400 bg-green-50 dark:bg-green-500/15 dark:text-slate-100 dark:placeholder-slate-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setEditing(false); setNoteValue(task.completion_note || '') }}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-1 rounded"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={saving}
                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentNote && (
                <div
                  className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 rounded-lg px-3 py-2.5 border border-green-100 dark:border-green-500/30 cursor-pointer hover:border-green-300 dark:hover:border-green-500/50"
                  onClick={() => setEditing(true)}
                >
                  <div className="mb-0.5">✅</div>
                  <MarkdownView text={currentNote} />
                </div>
              )}
              {!currentNote && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 text-left px-3 py-2 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors"
                >
                  + 완료 메모 추가
                </button>
              )}
              {task.memo && (
                <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-slate-700">
                  <MarkdownView text={task.memo} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyRecords({ search }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-700/40 flex items-center justify-center text-3xl">
        {search ? '🔍' : '📖'}
      </div>
      <div className="text-center">
        <p className="text-slate-600 dark:text-slate-300 font-medium">
          {search ? '검색 결과가 없어요' : '완료된 할 일이 없어요'}
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
          {search ? '다른 검색어를 입력해보세요' : '할 일을 완료하면 여기에 기록돼요'}
        </p>
      </div>
    </div>
  )
}
