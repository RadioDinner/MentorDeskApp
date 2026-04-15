interface PageBarProps {
  /** 1-based current page number */
  page: number
  pageSize: number
  /** Total row count across all pages */
  total: number
  onPage: (page: number) => void
  className?: string
}

/**
 * Prev / Next pagination bar with "Showing X–Y of Z" summary.
 * Returns null when total is 0 (nothing to page through).
 */
export default function PageBar({ page, pageSize, total, onPage, className = '' }: PageBarProps) {
  if (total === 0) return null

  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)
  const totalPages = Math.ceil(total / pageSize)

  const btnClass =
    'px-3 py-1.5 rounded border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

  return (
    <div className={`flex items-center justify-between py-3 text-xs text-gray-500 ${className}`}>
      <span>
        Showing {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={btnClass}
        >
          ← Prev
        </button>
        <span className="tabular-nums text-gray-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className={btnClass}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
