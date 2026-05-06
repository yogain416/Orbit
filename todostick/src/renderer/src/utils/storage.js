// localStorage 기반 UI 상태 저장 (접힘/펴짐 등). DB 마이그레이션 불필요.
import { useState, useEffect } from 'react'

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 무시 — quota 초과 등
  }
}

// React 훅: localStorage에 자동 저장되는 state
export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => loadJSON(key, defaultValue))
  useEffect(() => { saveJSON(key, value) }, [key, value])
  return [value, setValue]
}
