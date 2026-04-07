import { useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'

/**
 * Global error tracker — listens for uncaught JS errors, unhandled
 * promise rejections, and network failures, then logs them to error_logs.
 * Also exposes window.__logError() for manual error logging from anywhere.
 *
 * Mount once at the app root. Renders nothing.
 */
export default function ErrorTracker() {
  const { session, activeRole, organizationId } = useRole()
  const contextRef = useRef({ session, activeRole, organizationId })

  // Keep context ref current without re-attaching listeners
  useEffect(() => {
    contextRef.current = { session, activeRole, organizationId }
  }, [session, activeRole, organizationId])

  useEffect(() => {
    // Deduplicate: don't log the same error message within 5 seconds
    const recentErrors = new Map()
    function isDuplicate(key) {
      const now = Date.now()
      if (recentErrors.has(key) && now - recentErrors.get(key) < 5000) return true
      recentErrors.set(key, now)
      // Prune old entries
      if (recentErrors.size > 50) {
        for (const [k, t] of recentErrors) {
          if (now - t > 10000) recentErrors.delete(k)
        }
      }
      return false
    }

    async function logError({ message, stack, source, severity = 'error' }) {
      const key = `${source}:${message}`
      if (isDuplicate(key)) return

      const ctx = contextRef.current
      try {
        await supabase.from('error_logs').insert({
          message: (message || 'Unknown error').slice(0, 2000),
          stack: stack ? stack.slice(0, 5000) : null,
          source,
          url: window.location.href,
          user_id: ctx.session?.user?.id || null,
          user_email: ctx.session?.user?.email || null,
          user_role: ctx.activeRole || null,
          organization_id: ctx.organizationId || null,
          user_agent: navigator.userAgent,
          screen_size: `${window.innerWidth}x${window.innerHeight}`,
          severity,
        })
      } catch {
        // Don't throw while logging
      }
    }

    // 1. Uncaught JS errors
    function handleError(event) {
      logError({
        message: event.message || 'Uncaught error',
        stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
        source: 'runtime',
      })
    }

    // 2. Unhandled promise rejections
    function handleRejection(event) {
      const reason = event.reason
      logError({
        message: reason?.message || String(reason) || 'Unhandled promise rejection',
        stack: reason?.stack || null,
        source: 'promise',
      })
    }

    // 3. Network / fetch failures — patch fetch to catch HTTP errors
    const originalFetch = window.fetch
    window.fetch = async function patchedFetch(...args) {
      try {
        const response = await originalFetch.apply(this, args)
        // Log server errors (5xx) but not client errors (4xx are often expected)
        if (response.status >= 500) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
          logError({
            message: `HTTP ${response.status}: ${response.statusText} — ${url.slice(0, 200)}`,
            stack: null,
            source: 'network',
            severity: 'warning',
          })
        }
        return response
      } catch (err) {
        // Network-level failure (CORS, DNS, offline)
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
        logError({
          message: `Network error: ${err.message} — ${url.slice(0, 200)}`,
          stack: err.stack,
          source: 'network',
          severity: 'error',
        })
        throw err
      }
    }

    // 4. Console.error interception (catches React warnings, library errors)
    const originalConsoleError = console.error
    console.error = function patchedConsoleError(...args) {
      originalConsoleError.apply(console, args)
      // Only log strings that look like actual errors, not React dev warnings
      const msg = args.map(a => (typeof a === 'string' ? a : a?.message || '')).join(' ')
      if (msg.length > 10 && !msg.includes('Warning:') && !msg.includes('React does not recognize')) {
        logError({
          message: msg.slice(0, 2000),
          stack: null,
          source: 'console',
          severity: 'warning',
        })
      }
    }

    // 5. Expose manual logger globally
    window.__logError = (message, extra = {}) => {
      logError({
        message,
        stack: extra.stack || new Error().stack,
        source: extra.source || 'manual',
        severity: extra.severity || 'error',
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
      window.fetch = originalFetch
      console.error = originalConsoleError
      delete window.__logError
    }
  }, [])

  return null
}
