import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
} catch (err) {
  console.error('React mount failed:', err)
  window.__appErrors = window.__appErrors || []
  window.__appErrors.push('Mount: ' + err.message)
  if (window.showError) window.showError()
}
