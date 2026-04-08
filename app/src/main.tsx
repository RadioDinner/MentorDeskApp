import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { reportError } from './lib/errorReporter.ts'

// Catch unhandled promise rejections (e.g. async errors not in try/catch)
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message ?? String(event.reason)
  reportError({
    error_message: message,
    error_stack: event.reason?.stack,
    action: 'unhandled_promise_rejection',
  })
})

// Catch uncaught errors
window.addEventListener('error', (event) => {
  reportError({
    error_message: event.message,
    error_stack: event.error?.stack,
    action: 'uncaught_error',
    metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno },
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
