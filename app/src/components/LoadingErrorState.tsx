interface LoadingErrorStateProps {
  message: string
  onRetry?: () => void
}

/**
 * Shared error + retry UI for page-load failures. Shows the error message
 * and a Retry button that re-invokes the caller's fetch handler without a
 * full page reload.
 */
export default function LoadingErrorState({ message, onRetry }: LoadingErrorStateProps) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700">Failed to load</p>
          <p className="text-xs text-red-600 mt-0.5 break-words">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
