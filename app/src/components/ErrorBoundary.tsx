import React from 'react'
import { reportError } from '../lib/errorReporter'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
  reporting: boolean
  reported: boolean
}

const RELOAD_KEY = 'mentordesk.chunkReloadAt'

function looksLikeChunkLoadError(msg: string): boolean {
  return /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(msg)
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, reporting: false, reported: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // If this is a stale-chunk error after a new deploy, reload once
    // instead of showing the boundary UI. Guarded against loops.
    if (looksLikeChunkLoadError(error.message)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
        if (Date.now() - last >= 10_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
          window.location.reload()
          return
        }
      } catch { /* sessionStorage unavailable */ }
    }

    // Actually wait for the insert to land so the user can't tab away
    // before the row hits the DB. reportError itself never throws.
    this.setState({ reporting: true })
    reportError({
      error_message: error.message,
      error_stack: error.stack ?? undefined,
      component: info.componentStack?.slice(0, 500) ?? undefined,
      action: 'react_error_boundary',
    }).finally(() => this.setState({ reporting: false, reported: true }))
  }

  render() {
    if (this.state.error) {
      const { reporting, reported } = this.state
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-md border border-red-200 p-8 text-center">
            <p className="text-sm font-semibold text-red-600 mb-2">Something went wrong</p>
            <p className="text-xs text-gray-500 font-mono break-all mb-4">{this.state.error.message}</p>
            <p className="text-xs text-gray-400 mb-4">
              {reporting ? 'Reporting this error…' : reported ? 'This error has been reported.' : 'This error will be reported.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
