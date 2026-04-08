import React from 'react'
import { reportError } from '../lib/errorReporter'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError({
      error_message: error.message,
      error_stack: error.stack ?? undefined,
      component: info.componentStack?.slice(0, 500) ?? undefined,
      action: 'react_error_boundary',
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-md border border-red-200 p-8 text-center">
            <p className="text-sm font-semibold text-red-600 mb-2">Something went wrong</p>
            <p className="text-xs text-gray-500 font-mono break-all mb-4">{this.state.error.message}</p>
            <p className="text-xs text-gray-400 mb-4">This error has been automatically reported.</p>
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
