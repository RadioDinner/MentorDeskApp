import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Canonical button variants for the app. Each variant corresponds
 * exactly to a style pattern that was previously repeated inline
 * across 30+ pages:
 *
 *   primary   — filled brand button (create / save / confirm)
 *   secondary — outlined neutral button (cancel / back / edit)
 *   ghost     — text-only action (modal cancel, table row actions)
 *   danger    — filled red button (delete / archive confirm)
 *   dangerGhost — outlined red (destructive secondary actions)
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full-width block button. */
  block?: boolean
  /** Optional leading icon (rendered before children). */
  leadingIcon?: ReactNode
  /** Optional trailing icon (rendered after children). */
  trailingIcon?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium transition focus:outline-none ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-hover focus:ring-2 focus:ring-brand focus:ring-offset-2',
  secondary:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 ' +
    'focus:ring-2 focus:ring-brand/30',
  ghost:
    'text-gray-600 hover:text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-brand/20',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
  dangerGhost:
    'border border-red-200 bg-white text-red-600 hover:bg-red-50 focus:ring-2 focus:ring-red-300',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

/**
 * Shared Button primitive. Replaces dozens of inline className strings
 * like `rounded bg-brand px-4 py-2 text-sm font-medium text-white ...`.
 *
 * Usage:
 *   <Button onClick={save}>Save</Button>
 *   <Button variant="secondary" onClick={cancel}>Cancel</Button>
 *   <Button variant="danger" onClick={del}>Delete</Button>
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  leadingIcon,
  trailingIcon,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    BASE,
    VARIANTS[variant],
    SIZES[size],
    block ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  )
}
