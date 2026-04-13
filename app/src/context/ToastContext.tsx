/**
 * ToastContext — global ephemeral notification system.
 *
 * Usage (in any component):
 *   const { toast } = useToast()
 *   toast.success('Saved!')
 *   toast.error('Failed to save.')
 *   toast.info('Copied to clipboard.')
 *
 * Wire up once in App.tsx by wrapping the tree with <ToastProvider>.
 * The toast stack is rendered into a portal at the bottom-right corner.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

interface ToastAPI {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastAPI | null>(null)

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts(prev => [...prev, { id, kind, message }])
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    timers.current.set(id, timer)
  }, [dismiss])

  const api: ToastAPI = {
    success: (msg) => push('success', msg),
    error:   (msg) => push('error',   msg),
    info:    (msg) => push('info',    msg),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ─── Toast Stack ─────────────────────────────────────────────────────────────

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-green-600 text-white',
  error:   'bg-red-600 text-white',
  info:    'bg-gray-800 text-white',
}

const KIND_ICONS: Record<ToastKind, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${KIND_STYLES[t.kind]} flex items-start gap-2.5 rounded-lg shadow-lg px-4 py-3 text-sm font-medium pointer-events-auto`}
        >
          <span className="shrink-0 leading-none mt-0.5">{KIND_ICONS[t.kind]}</span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity leading-none mt-0.5 text-base"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
