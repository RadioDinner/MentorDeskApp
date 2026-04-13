import type { ReactNode } from 'react'

/**
 * Semantic badge variants. Status-specific variants (paid, overdue, etc.)
 * are centralized here so every list page that shows an invoice / pairing /
 * engagement status uses the exact same color map instead of redefining it.
 */
export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  brand:   'bg-brand/10 text-brand',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger:  'bg-red-50 text-red-700',
  info:    'bg-blue-50 text-blue-700',
  muted:   'bg-gray-100 text-gray-400',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** Render as a pill (fully rounded) instead of rounded-sm. Defaults to true. */
  pill?: boolean
  /** Strike-through text (used for cancelled statuses). */
  strike?: boolean
  className?: string
  children: ReactNode
}

/**
 * Small inline status pill. Use `tone` for the semantic color and pass
 * the label as children. If you need a non-status label, prefer
 * `<Badge tone="neutral">`.
 */
export default function Badge({
  tone = 'neutral',
  pill = true,
  strike = false,
  className = '',
  children,
}: BadgeProps) {
  const classes = [
    'inline-flex items-center px-2 py-0.5 text-xs font-medium',
    pill ? 'rounded-full' : 'rounded',
    TONES[tone],
    strike ? 'line-through' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{children}</span>
}

/**
 * Map a status string to a semantic BadgeTone. Used by invoices,
 * pairings, engagements — anywhere the same status vocabulary appears.
 * Unknown statuses fall back to `neutral`.
 */
export function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case 'paid':
    case 'active':
    case 'completed':
    case 'matched':
      return 'success'
    case 'sent':
    case 'in_progress':
    case 'scheduled':
      return 'info'
    case 'overdue':
    case 'failed':
      return 'danger'
    case 'pending':
    case 'waiting':
    case 'draft':
      return 'neutral'
    case 'cancelled':
    case 'archived':
      return 'muted'
    default:
      return 'neutral'
  }
}
