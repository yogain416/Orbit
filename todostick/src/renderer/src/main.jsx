import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// window.api가 로드될 때까지 대기 후 마운트
function mount() {
  if (typeof window.api === 'undefined') {
    setTimeout(mount, 50)
    return
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

mount()
