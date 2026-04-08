import React from 'react'

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

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-md border border-red-200  p-8 text-center">
            <p className="text-sm font-semibold text-red-600 mb-2">Something went wrong</p>
            <p className="text-xs text-gray-500 font-mono break-all">{this.state.error.message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
