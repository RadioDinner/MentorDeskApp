import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { reportError } from './lib/errorReporter.ts'

// ── Stale-chunk auto-recovery ─────────────────────────────────────────
// After a new deploy, a user's open tab still holds the previous HTML,
// which references chunk filenames that no longer exist on the CDN. The
// next route-level lazy import then fails with "error loading
// dynamically imported module". Reload once to pick up the new HTML and
// new chunk filenames. Guarded against loops: if we already reloaded in
// the last 10s, don't reload again (it's probably a real bug).
const RELOAD_KEY = 'mentordesk.chunkReloadAt'
function looksLikeChunkLoadError(msg: string): boolean {
  return /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(msg)
}
function maybeReloadForChunkError(errMsg: string): boolean {
  if (!looksLikeChunkLoadError(errMsg)) return false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
    if (Date.now() - last < 10_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* sessionStorage unavailable */ }
  window.location.reload()
  return true
}

// Vite 5+ emits a dedicated event for module preload failures. Intercept
// so we don't even have to wait for React to render the boundary.
window.addEventListener('vite:preloadError', (event: Event) => {
  event.preventDefault()
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* ignore */ }
  window.location.reload()
})

// Catch unhandled promise rejections (e.g. async errors not in try/catch)
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message ?? String(event.reason)
  if (maybeReloadForChunkError(message)) return
  reportError({
    error_message: message,
    error_stack: event.reason?.stack,
    action: 'unhandled_promise_rejection',
  })
})

// Catch uncaught errors
window.addEventListener('error', (event) => {
  if (maybeReloadForChunkError(event.message)) return
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
