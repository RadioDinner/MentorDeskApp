import { useEffect, useRef, useCallback } from 'react'
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export interface ModalProps {
  /** Whether the modal is currently visible. Parent owns this state. */
  open: boolean
  /** Called when user dismisses via Escape, overlay click, or close button. */
  onClose: () => void
  /** Dialog title — rendered in the header and used for aria-labelledby. */
  title: ReactNode
  /** Optional subtitle rendered under the title. */
  subtitle?: ReactNode
  /** Optional footer area (typically action buttons). */
  footer?: ReactNode
  /** Max-width class. Defaults to `md` (max-w-lg). */
  size?: ModalSize
  /** If true, clicking the dimmed overlay will not close the modal. */
  disableOverlayClose?: boolean
  /** Body content. */
  children: ReactNode
}

/**
 * Accessible modal dialog. Adds the behaviors that the old inline
 * modals (InvoiceEditModal, TimeCardModal, EngagementManageModal) were
 * missing:
 *
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Escape key dismisses
 *   - Focus restores to the previously focused element on close
 *   - Auto-focuses the close button on open (basic focus capture)
 *   - Body scroll is locked while the modal is open
 *
 * Intentionally simple — not a full focus trap, but a big a11y step up
 * from the prior pattern (which had nothing).
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = 'md',
  disableOverlayClose = false,
  children,
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Save + restore focus across open/close.
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    // Focus the close button on open so keyboard users can immediately
    // press Enter/Space to dismiss.
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(t)
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  // Escape-to-close.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (disableOverlayClose) return
      if (e.target === e.currentTarget) onClose()
    },
    [disableOverlayClose, onClose],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full ${SIZES[size]} max-h-[90vh] flex flex-col`}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base font-semibold text-gray-900 truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-gray-500 truncate">{subtitle}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-brand/30"
            aria-label="Close dialog"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
