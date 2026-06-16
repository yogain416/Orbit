import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initTheme } from './utils/theme'

// 렌더 전에 다크모드 적용 → FOUC(라이트 화면 깜빡임) 방지. 메인·스티커 두 창 모두에서 실행됨.
initTheme()

let attempts = 0

function mount() {
  attempts++

  if (typeof window.api !== 'undefined') {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
    return
  }

  // 2초(40회) 후에도 window.api 없으면 에러 화면 표시
  if (attempts > 40) {
    document.getElementById('root').innerHTML = `
      <div style="padding:40px;font-family:sans-serif;color:#ef4444">
        <h2>⚠️ preload 로드 실패</h2>
        <p style="margin-top:8px;color:#666">window.api를 찾을 수 없습니다.</p>
        <p style="margin-top:4px;color:#666">DevTools 콘솔에서 에러를 확인하세요.</p>
      </div>
    `
    return
  }

  setTimeout(mount, 50)
}

mount()
