import type { ViewMode } from '../types'

interface Props {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

/**
 * Two-button toggle for flipping a page between "list" and "grid"
 * view modes. The parent owns the value (typically backed by a
 * page-specific localStorage key, e.g. `mentordesk_habits_view`) and
 * passes it in as a controlled prop.
 */
export default function ListGridToggle({ value, onChange }: Props) {
  const btnBase =
    'px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5'
  const activeCls  = 'bg-brand text-white'
  const inactiveCls = 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'

  return (
    <div className="inline-flex items-center rounded-md border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`${btnBase} ${value === 'grid' ? activeCls : inactiveCls}`}
        title="Grid view"
        aria-pressed={value === 'grid'}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        Grid
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`${btnBase} ${value === 'list' ? activeCls : inactiveCls}`}
        title="List view"
        aria-pressed={value === 'list'}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        List
      </button>
    </div>
  )
}
