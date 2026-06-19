import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { toDateStr, getTodayStr } from '../utils/date'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6 ~ 23시
const PX_PER_HOUR = 64
const PX_PER_MIN = PX_PER_HOUR / 60

const BLOCK_COLORS = {
  red: 'bg-red-200 border-red-400 text-red-800 dark:bg-red-500/20 dark:border-red-500/40 dark:text-red-200',
  orange: 'bg-orange-200 border-orange-400 text-orange-800 dark:bg-orange-500/20 dark:border-orange-500/40 dark:text-orange-200',
  yellow: 'bg-yellow-200 border-yellow-400 text-yellow-800 dark:bg-yellow-500/20 dark:border-yellow-500/40 dark:text-yellow-200',
  green: 'bg-green-200 border-green-400 text-green-800 dark:bg-green-500/20 dark:border-green-500/40 dark:text-green-200',
  blue: 'bg-blue-200 border-blue-400 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-200',
  purple: 'bg-purple-200 border-purple-400 text-purple-800 dark:bg-purple-500/20 dark:border-purple-500/40 dark:text-purple-200',
}
const DEFAULT_BLOCK = 'bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-200'

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
  const [chipDropMin, setChipDropMin] = useState(null) // 미배정 칩 드래그 중 드롭 미리보기

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
  // 1시간 블록을 드롭 위치에 배치 (23:00 이후로는 시작 시간 clamp)
  const computeChipDrop = (clientY) => {
    const raw = snapMinutes(pxToMinutes(getGridPx(clientY)))
    const start = Math.min(23 * 60, raw)
    return { start, end: start + 60 }
  }

  const handleGridDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const { start } = computeChipDrop(e.clientY)
    if (start !== chipDropMin) setChipDropMin(start)
  }

  const handleGridDragLeave = () => setChipDropMin(null)

  const handleGridDrop = async (e) => {
    e.preventDefault()
    setChipDropMin(null)
    const taskId = e.dataTransfer.getData('text/plain') // ID는 문자열 (Date.toString(36)+random)
    if (!taskId) return
    const { start, end } = computeChipDrop(e.clientY)
    await window.api.tasks.update(taskId, {
      start_time: minutesToStr(start),
      end_time: minutesToStr(end)
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

  // 시간 충돌 → 가로 column 분할 (Google Calendar 스타일)
  // ① transitive 충돌 그룹 식별  ② 그룹 내 greedy column 배정 (끝난 column은 재사용)
  const layoutMap = useMemo(() => {
    const sorted = timedTasks
      .map(t => {
        const start = timeToMinutes(t.start_time)
        const endRaw = timeToMinutes(t.end_time)
        return { task: t, start, end: endRaw || (start + 60) }
      })
      .filter(it => it.start !== null)
      .sort((a, b) => a.start - b.start || a.end - b.end)

    const groups = []
    for (const item of sorted) {
      // 그룹 내 한 항목이라도 시간이 겹치면 같은 그룹 (transitive)
      const g = groups.find(gr => gr.items.some(gi => gi.start < item.end && gi.end > item.start))
      if (g) g.items.push(item)
      else groups.push({ items: [item] })
    }

    const map = new Map()
    for (const g of groups) {
      const colEnds = [] // colEnds[i] = i번째 column이 마지막으로 점유한 끝 시간
      for (const item of g.items) {
        // 이미 끝난 column 재사용 (item.start >= colEnd면 그 자리 비어있음)
        let col = colEnds.findIndex(end => end <= item.start)
        if (col === -1) {
          col = colEnds.length
          colEnds.push(item.end)
        } else {
          colEnds[col] = item.end
        }
        item.col = col
      }
      const totalCols = colEnds.length
      for (const item of g.items) {
        map.set(item.task.id, { col: item.col, totalCols })
      }
    }
    return map
  }, [timedTasks])

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
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400">‹</button>
        <div className="text-center flex items-center gap-2">
          <span className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{dateStr}</span>
          {dateStr === today && (
            <span className="text-xs bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full">오늘</span>
          )}
        </div>
        <button onClick={nextDay} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400">›</button>
      </div>

      {/* 미배정 할일 — 드래그로 타임라인에 배치 */}
      {untimedTasks.length > 0 && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1.5">⏳ 시간 미배정 ({untimedTasks.length}) · 아래로 드래그해서 시간 배정</p>
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
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 line-through border-slate-200 dark:border-slate-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300'
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
                className="absolute w-full text-right pr-2 text-xs text-slate-400 dark:text-slate-500"
                style={{ top: (h - 6) * PX_PER_HOUR - 8 }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* 그리드 + 블록 */}
          <div
            ref={gridRef}
            className={`flex-1 relative border-l border-slate-200 dark:border-slate-700 ${isAnyDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onMouseDown={handleGridMouseDown}
            onMouseMove={handleGridMouseMove}
            onMouseUp={handleGridMouseUp}
            onDragOver={handleGridDragOver}
            onDragLeave={handleGridDragLeave}
            onDrop={handleGridDrop}
          >
            {/* 정각선 */}
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full border-t border-slate-100 dark:border-slate-700 pointer-events-none"
                style={{ top: (h - 6) * PX_PER_HOUR }}
              />
            ))}

            {/* 30분 점선 */}
            {HOURS.map(h => (
              <div
                key={`${h}-half`}
                className="absolute w-full border-t border-dashed border-slate-50 dark:border-slate-700/40 pointer-events-none"
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

            {/* 미배정 칩 드롭 미리보기 (1시간 블록) */}
            {chipDropMin !== null && (
              <div
                className="absolute left-1 right-3 bg-emerald-200 dark:bg-emerald-500/15 border-2 border-dashed border-emerald-500 rounded-md px-2 py-1 z-30 pointer-events-none"
                style={{ top: minutesToPx(chipDropMin), height: 60 * PX_PER_MIN }}
              >
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 leading-tight">
                  📌 여기에 배치 → {minutesToStr(chipDropMin)} ~ {minutesToStr(chipDropMin + 60)}
                </p>
              </div>
            )}

            {/* 새 블록 생성 프리뷰 */}
            {preview && (
              <div
                className="absolute left-1 right-3 bg-indigo-200 dark:bg-indigo-500/20 border-l-4 border-indigo-400 rounded-md px-2 py-0.5 opacity-75 z-30 pointer-events-none"
                style={{ top: preview.top, height: preview.height }}
              >
                <p className="text-xs text-indigo-800 dark:text-indigo-300 font-semibold leading-tight truncate">
                  {preview.startStr} ~ {preview.endStr}
                </p>
              </div>
            )}

            {/* 이동 프리뷰 */}
            {moveTask && moveTask.moved && (
              <div
                className="absolute left-1 right-3 bg-indigo-300 dark:bg-indigo-500/20 border-l-4 border-indigo-500 rounded-md px-2 py-0.5 opacity-80 z-30 pointer-events-none"
                style={{
                  top: minutesToPx(moveTask.previewStart),
                  height: Math.max(moveTask.duration * PX_PER_MIN, 22)
                }}
              >
                <p className="text-xs text-indigo-900 dark:text-indigo-300 font-semibold leading-tight">
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
              // 15~30분 짧은 블록 — 한 줄에 시간+제목 인라인. 두 줄이면 22px에 안 들어감
              const isShort = height < 36
              const endTimeStr = taskIsResizing ? minutesToStr(resizeTask.previewEnd) : task.end_time

              // 시간 충돌 column 분할 — 단일 column이면 totalCols=1 → 전체 너비
              const layout = layoutMap.get(task.id) || { col: 0, totalCols: 1 }
              const LEFT_PAD = 4, RIGHT_PAD = 12, COL_GAP = 2
              const colWidth = `((100% - ${LEFT_PAD + RIGHT_PAD}px - ${(layout.totalCols - 1) * COL_GAP}px) / ${layout.totalCols})`
              const leftCss = `calc(${LEFT_PAD}px + ${layout.col} * (${colWidth} + ${COL_GAP}px))`
              const widthCss = `calc(${colWidth})`

              return (
                <div
                  key={task.id}
                  onMouseDown={(e) => startMove(task, e)}
                  className={`absolute rounded-md border-l-4 overflow-hidden z-10 select-none ${
                    isShort ? 'px-1.5 py-0' : 'px-2 py-0.5'
                  } ${colorClass} ${task.is_completed ? 'opacity-50' : ''} ${
                    taskIsMoving && moveTask.moved
                      ? 'opacity-25 pointer-events-none'
                      : 'cursor-grab active:cursor-grabbing hover:brightness-95 transition-all'
                  }`}
                  style={{ top, height, left: leftCss, width: widthCss }}
                >
                  {isShort ? (
                    <p className="text-[11px] font-semibold truncate leading-none mt-0.5">
                      <span className="opacity-60 mr-1">{task.start_time}</span>
                      {task.title}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold truncate leading-tight">{task.title}</p>
                      <p className="text-xs opacity-60 leading-tight">
                        {task.start_time}
                        {task.end_time ? ` ~ ${endTimeStr}` : ''}
                      </p>
                    </>
                  )}
                  {/* 리사이즈 핸들 — 짧은 블록에선 더 얇게 */}
                  <div
                    onMouseDown={(e) => startResize(task, e)}
                    title="드래그로 종료 시간 조절"
                    className={`absolute bottom-0 left-0 right-0 cursor-ns-resize flex items-end justify-center ${
                      isShort ? 'h-1.5' : 'h-3 pb-0.5'
                    }`}
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
      <div className="px-4 py-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          총 {tasks.length}개 · 완료 {tasks.filter(t => t.is_completed).length}개 · 시간블록 {timedTasks.length}개
        </span>
        <span className="text-xs text-slate-300 dark:text-slate-500">· 드래그로 생성 · 블록 이동/크기조절</span>
      </div>
    </div>
  )
}
