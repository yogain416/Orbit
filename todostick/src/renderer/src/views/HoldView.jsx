import { useState, useEffect, useCallback } from 'react'
import { getTodayStr } from '../utils/date'
import { DEFAULT_CATEGORIES, getCategoryById } from '../utils/categories'

// 며칠 전부터 보류 중인지 라벨
function heldAgoLabel(heldAt, todayStr) {
  if (!heldAt) return ''
  const d1 = new Date(heldAt.slice(0, 10) + 'T00:00:00')
  const d2 = new Date(todayStr + 'T00:00:00')
  const diff = Math.round((d2 - d1) / 86400000)
  if (diff <= 0) return '오늘 보류'
  if (diff === 1) return '어제 보류'
  return `${diff}일째 보류`
}

export default function HoldView() {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    const data = await window.api.tasks.getHeld()
    setTasks(data)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.api.categories.get().then((cats) => { if (cats.length) setCategories(cats) })
  }, [])
  useEffect(() => {
    const handler = () => { load() }
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [load])

  const handleReturn = useCallback(async (task) => {
    await window.api.tasks.returnFromHold(task.id, getTodayStr())
    window.api.tasks.notifyChanged()
    load()
    setToast({ msg: `"${task.title.length > 16 ? task.title.slice(0, 16) + '…' : task.title}" 오늘로 복귀됨 · 클릭하여 닫기` })
  }, [load])

  const handleDelete = useCallback(async (task) => {
    await window.api.tasks.delete(task.id)
    window.api.tasks.notifyChanged()
    load()
  }, [load])

  const todayStr = getTodayStr()

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100">⏸ 보류 목록</span>
          {tasks.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">{tasks.length}</span>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center text-3xl">⏸</div>
            <div className="text-center">
              <p className="text-slate-600 dark:text-slate-300 font-medium">보류한 할 일이 없어요</p>
              <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">할 일 카드의 <span className="text-amber-600 dark:text-amber-300">보류</span> 버튼으로 잠시 미뤄둘 수 있어요</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => {
              const catInfo = task.category ? getCategoryById(task.category, categories) : null
              return (
                <div
                  key={task.id}
                  className="group flex items-start gap-3 p-3.5 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-200 dark:hover:border-slate-600 transition-all"
                >
                  <span className="mt-0.5 text-amber-400 dark:text-amber-300 flex-shrink-0 text-sm leading-none select-none">⏸</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100 break-words">
                      {task.title}
                      {task.is_in_progress && (
                        <span className="ml-1.5 text-xs text-blue-500 font-normal">진행중</span>
                      )}
                      {catInfo && (
                        <span
                          style={{ backgroundColor: catInfo.color + '20', color: catInfo.color }}
                          className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-normal"
                        >
                          {catInfo.label}
                        </span>
                      )}
                    </p>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="text-amber-600 dark:text-amber-300">{heldAgoLabel(task.held_at, todayStr)}</span>
                      <span>· 원래 {task.date}</span>
                    </div>
                    {task.memo && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{task.memo}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleReturn(task)}
                      className="text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      오늘로 복귀
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      className="text-xs text-red-300 dark:text-red-400 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl shadow-lg text-sm cursor-pointer hover:bg-slate-700 transition-colors"
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
