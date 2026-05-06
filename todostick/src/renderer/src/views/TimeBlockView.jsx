import { useState, useEffect, useRef, useCallback } from 'react'
import { toDateStr, getTodayStr } from '../utils/date'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6 ~ 23시
const PX_PER_HOUR = 64
const PX_PER_MIN = PX_PER_HOUR / 60

const BLOCK_COLORS = {
  red: 'bg-red-200 border-red-400 text-red-800',
  orange: 'bg-orange-200 border-orange-400 text-orange-800',
  yellow: 'bg-yellow-200 border-yellow-400 text-yellow-800',
  green: 'bg-green-200 border-green-400 text-green-800',
  blue: 'bg-blue-200 border-blue-400 text-blue-800',
  purple: 'bg-purple-200 border-purple-400 text-purple-800',
}
const DEFAULT_BLOCK = 'bg-indigo-100 border-indigo-300 text-indigo-800'

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function pxToMinutes(px) {
  return Math.max(6 * 60, Math.min(24 * 60, Math.round(px / PX_PER_MIN) + 6 * 60))
}

function snapMinutes(m, step = 15) {
  return Math.round(m / step) * step
}

function minutesToStr(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function minutesToPx(m) {
  return (m - 6 * 60) * PX_PER_MIN
}

export default function TimeBlockView({ currentDate, onDateChange, onAddTask, onEditTask }) {
  const [tasks, setTasks] = useState([])
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  const [dragState, setDragState] = useState(null)   // 빈 그리드 드래그 → 새 블록 생성
  const [moveTask, setMoveTask] = useState(null)      // 블록 이동 미리보기
  const [resizeTask, setResizeTask] = useState(null)  // 블록 리사이즈 미리보기

  const gridRef = useRef(null)
  // ref는 setMove/setResize보다 먼저 동기적으로 갱신 → 이벤트 타이밍 문제 방지
  const moveRef = useRef(null)
  const resizeRef = useRef(null)
  const tasksRef = useRef([])
  const onEditRef = useRef(onEditTask)
  const onAddRef = useRef(onAddTask)
  const dateStrRef = useRef('')

  useEffect(() => { onEditRef.current = onEditTask }, [onEditTask])
  useEffect(() => { onAddRef.current = onAddTask }, [onAddTask])
  useEffect(() => { tasksRef.current = tasks }, [tasks])

  const today = getTodayStr()
  const dateStr = toDateStr(currentDate)
  dateStrRef.current = dateStr

  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const loadTasks = useCallback(() => {
    window.api.tasks.getByDate(dateStr).then(setTasks)
  }, [dateStr])

  useEffect(() => { loadTasks() }, [loadTasks])

  useEffect(() => {
    const handler = () => loadTasks()
    window.api.tasks.onRefresh(handler)
    return () => window.api.tasks.offRefresh(handler)
  }, [loadTasks])

  // 마운트 시 한 번만 등록 — ref로 최신 상태를 읽으므로 stale closure 없음
  useEffect(() => {
    const getGPx = (clientY) => {
      if (!gridRef.current) return 0
      const rect = gridRef.current.getBoundingClientRect()
      return Math.max(0, Math.min(clientY - rect.top, HOURS.length * PX_PER_HOUR))
    }

    const onMouseMove = (e) => {
      const mt = moveRef.current
      const rt = resizeRef.current
      if (!mt && !rt) return

      const px = getGPx(e.clientY)
      const curMin = pxToMinutes(px)

      if (mt) {
        const moved = mt.moved || Math.abs(e.clientY - mt.startY) > 4
        const raw = snapMinutes(curMin - mt.grabOffsetMin)
        const newStart = Math.max(6 * 60, Math.min(23 * 60 - mt.duration, raw))
        const updated = { ...mt, moved, previewStart: newStart, previewEnd: newStart + mt.duration }
        moveRef.current = updated
        setMoveTask(updated)
      }
      if (rt) {
        const newEnd = Math.max(rt.startMin + 15, snapMinutes(curMin))
        const updated = { ...rt, previewEnd: newEnd }
        resizeRef.current = updated
        setResizeTask(updated)
      }
    }

    const onMouseUp = async () => {
      const mt = moveRef.current
      const rt = resizeRef.current

      // 생성 드래그도 같이 취소
      setDragState(null)

      if (mt) {
        moveRef.current = null
        setMoveTask(null)
        if (mt.moved && mt.previewStart !== mt.origStart) {
          await window.api.tasks.update(mt.taskId, {
            start_time: minutesToStr(mt.previewStart),
            end_time: minutesToStr(mt.previewEnd)
          })
          window.api.tasks.notifyChanged()
        } else if (!mt.moved) {
          // 클릭으로 처리 → 편집 모달
          const task = tasksRef.current.find(t => t.id === mt.taskId)
          if (task) onEditRef.current(task)
        }
      }
      if (rt) {
        resizeRef.current = null
        setResizeTask(null)
        await window.api.tasks.update(rt.taskId, {
          end_time: minutesToStr(rt.previewEnd)
        })
        window.api.tasks.notifyChanged()
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, []) // 빈 배열 — 마운트 시 한 번만

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); onDateChange(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); onDateChange(d) }

  const getGridPx = (clientY) => {
    if (!gridRef.current) return 0
    const rect = gridRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(clientY - rect.top, HOURS.length * PX_PER_HOUR))
  }

  // 빈 그리드 드래그 → 새 블록 생성
  const handleGridMouseDown = (e) => {
    if (e.button !== 0) return
    if (moveRef.current || resizeRef.current) return
    e.preventDefault()
    const px = getGridPx(e.clientY)
    setDragState({ startPx: px, endPx: px })
  }

  const handleGridMouseMove = (e) => {
    if (!dragState) return
    setDragState(prev => ({ ...prev, endPx: getGridPx(e.clientY) }))
  }

  const handleGridMouseUp = (e) => {
    if (moveRef.current || resizeRef.current) return // window 핸들러가 처리
    if (!dragState) return
    const { startPx, endPx } = dragState
    const minPx = Math.min(startPx, endPx)
    const maxPx = Math.max(startPx, endPx)
    setDragState(null)

    if (maxPx - minPx < 8) {
      onAddTask(dateStr)
      return
    }

    const startMin = snapMinutes(pxToMinutes(minPx))
    const endMin = snapMinutes(pxToMinutes(maxPx))
    onAddTask(dateStr, {
      start_time: minutesToStr(startMin),
      end_time: minutesToStr(Math.max(startMin + 15, endMin))
    })
  }

  // 미배정 할일 칩 → 그리드에 드롭
  const handleGridDragOver = (e) => e.preventDefault()

  const handleGridDrop = async (e) => {
    e.preventDefault()
    const taskId = parseInt(e.dataTransfer.getData('text/plain'))
    if (!taskId) return
    const dropMin = snapMinutes(pxToMinutes(getGridPx(e.clientY)))
    await window.api.tasks.update(taskId, {
      start_time: minutesToStr(dropMin),
      end_time: minutesToStr(dropMin + 60)
    })
    window.api.tasks.notifyChanged()
  }

  // 블록 이동 시작 — ref를 즉시 동기 갱신
  const startMove = (task, e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startMin = timeToMinutes(task.start_time)
    const endMin = timeToMinutes(task.end_time) || startMin + 60
    const duration = endMin - startMin
    const grabMin = pxToMinutes(getGridPx(e.clientY))
    const grabOffsetMin = Math.max(0, Math.min(duration - 15, grabMin - startMin))
    const newTask = {
      taskId: task.id,
      origStart: startMin,
      duration,
      grabOffsetMin,
      previewStart: startMin,
      previewEnd: endMin,
      startY: e.clientY,
      moved: false
    }
    moveRef.current = newTask  // 즉시 갱신 — 렌더 전에도 window 핸들러가 읽을 수 있음
    setMoveTask(newTask)
  }

  // 블록 리사이즈 시작
  const startResize = (task, e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startMin = timeToMinutes(task.start_time)
    const endMin = timeToMinutes(task.end_time) || startMin + 60
    const newTask = { taskId: task.id, startMin, previewEnd: endMin }
    resizeRef.current = newTask
    setResizeTask(newTask)
  }

  const timedTasks = tasks.filter(t => t.start_time)
  const untimedTasks = tasks.filter(t => !t.start_time)
  const totalHeight = HOURS.length * PX_PER_HOUR

  const preview = dragState && (() => {
    const minPx = Math.min(dragState.startPx, dragState.endPx)
    const maxPx = Math.max(dragState.startPx, dragState.endPx)
    const startMin = snapMinutes(pxToMinutes(minPx))
    const endMin = snapMinutes(pxToMinutes(maxPx))
    return {
      top: minPx,
      height: Math.max(maxPx - minPx, 4),
      startStr: minutesToStr(startMin),
      endStr: minutesToStr(Math.max(startMin + 15, endMin))
    }
  })()

  const isAnyDragging = !!moveTask || !!resizeTask

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <div className="text-center flex items-center gap-2">
          <span className="text-base font-bold text-slate-800">{dateStr}</span>
          {dateStr === today && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">오늘</span>
          )}
        </div>
        <button onClick={nextDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
      </div>

      {/* 미배정 할일 — 드래그로 타임라인에 배치 */}
      {untimedTasks.length > 0 && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-400 mb-1.5">⏳ 시간 미배정 ({untimedTasks.length}) · 아래로 드래그해서 시간 배정</p>
          <div className="flex flex-wrap gap-1">
            {untimedTasks.map(t => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(t.id))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onEditTask(t)}
                title="드래그: 시간 배정 · 클릭: 편집"
                className={`text-xs px-2 py-0.5 rounded-full border cursor-grab active:cursor-grabbing select-none transition-colors ${
                  t.is_completed
                    ? 'bg-slate-100 text-slate-400 line-through border-slate-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                }`}
              >
                {t.title.length > 14 ? t.title.slice(0, 14) + '…' : t.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 타임 그리드 */}
      <div className="flex-1 overflow-y-auto select-none">
        <div className="relative flex" style={{ height: totalHeight }}>
          {/* 시간 레이블 */}
          <div className="w-14 flex-shrink-0 relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-xs text-slate-400"
                style={{ top: (h - 6) * PX_PER_HOUR - 8 }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* 그리드 + 블록 */}
          <div
            ref={gridRef}
            className={`flex-1 relative border-l border-slate-200 ${isAnyDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onMouseDown={handleGridMouseDown}
            onMouseMove={handleGridMouseMove}
            onMouseUp={handleGridMouseUp}
            onDragOver={handleGridDragOver}
            onDrop={handleGridDrop}
          >
            {/* 정각선 */}
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full border-t border-slate-100 pointer-events-none"
                style={{ top: (h - 6) * PX_PER_HOUR }}
              />
            ))}

            {/* 30분 점선 */}
            {HOURS.map(h => (
              <div
                key={`${h}-half`}
                className="absolute w-full border-t border-dashed border-slate-50 pointer-events-none"
                style={{ top: (h - 6) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
              />
            ))}

            {/* 현재 시간 표시선 */}
            {dateStr === today && nowMinutes >= 6 * 60 && nowMinutes < 24 * 60 && (
              <div
                className="absolute w-full z-20 pointer-events-none"
                style={{ top: (nowMinutes - 6 * 60) * PX_PER_MIN }}
              >
                <div className="w-full border-t-2 border-red-400 relative">
                  <span className="absolute -left-1 -top-1.5 w-2.5 h-2.5 bg-red-400 rounded-full" />
                </div>
              </div>
            )}

            {/* 새 블록 생성 프리뷰 */}
            {preview && (
              <div
                className="absolute left-1 right-3 bg-indigo-200 border-l-4 border-indigo-400 rounded-md px-2 py-0.5 opacity-75 z-30 pointer-events-none"
                style={{ top: preview.top, height: preview.height }}
              >
                <p className="text-xs text-indigo-800 font-semibold leading-tight truncate">
                  {preview.startStr} ~ {preview.endStr}
                </p>
              </div>
            )}

            {/* 이동 프리뷰 */}
            {moveTask && moveTask.moved && (
              <div
                className="absolute left-1 right-3 bg-indigo-300 border-l-4 border-indigo-500 rounded-md px-2 py-0.5 opacity-80 z-30 pointer-events-none"
                style={{
                  top: minutesToPx(moveTask.previewStart),
                  height: Math.max(moveTask.duration * PX_PER_MIN, 22)
                }}
              >
                <p className="text-xs text-indigo-900 font-semibold leading-tight">
                  {minutesToStr(moveTask.previewStart)} ~ {minutesToStr(moveTask.previewEnd)}
                </p>
              </div>
            )}

            {/* 할일 블록 */}
            {timedTasks.map(task => {
              const startMin = timeToMinutes(task.start_time)
              const taskIsMoving = moveTask?.taskId === task.id
              const taskIsResizing = resizeTask?.taskId === task.id
              const endMin = taskIsResizing
                ? resizeTask.previewEnd
                : (timeToMinutes(task.end_time) || startMin + 60)

              const top = minutesToPx(startMin)
              const height = Math.max((endMin - startMin) * PX_PER_MIN, 22)
              if (top < 0 || top > totalHeight) return null
              const colorClass = task.color ? BLOCK_COLORS[task.color] : DEFAULT_BLOCK

              return (
                <div
                  key={task.id}
                  onMouseDown={(e) => startMove(task, e)}
                  className={`absolute left-1 right-3 rounded-md border-l-4 px-2 py-0.5 overflow-hidden z-10 select-none ${colorClass} ${task.is_completed ? 'opacity-50' : ''} ${
                    taskIsMoving && moveTask.moved
                      ? 'opacity-25 pointer-events-none'
                      : 'cursor-grab active:cursor-grabbing hover:brightness-95 transition-all'
                  }`}
                  style={{ top, height }}
                >
                  <p className="text-xs font-semibold truncate leading-tight">{task.title}</p>
                  <p className="text-xs opacity-60 leading-tight">
                    {task.start_time}
                    {task.end_time
                      ? ` ~ ${taskIsResizing ? minutesToStr(resizeTask.previewEnd) : task.end_time}`
                      : ''}
                  </p>
                  {/* 리사이즈 핸들 */}
                  <div
                    onMouseDown={(e) => startResize(task, e)}
                    title="드래그로 종료 시간 조절"
                    className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-end justify-center pb-0.5"
                  >
                    <div className="w-8 h-0.5 bg-current opacity-25 rounded-full" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 하단 요약 */}
      <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-slate-400">
          총 {tasks.length}개 · 완료 {tasks.filter(t => t.is_completed).length}개 · 시간블록 {timedTasks.length}개
        </span>
        <span className="text-xs text-slate-300">· 드래그로 생성 · 블록 이동/크기조절</span>
      </div>
    </div>
  )
}
