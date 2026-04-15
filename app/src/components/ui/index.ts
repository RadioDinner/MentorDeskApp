/**
 * Barrel export for shared UI primitives. Prefer importing from
 * `components/ui` rather than individual files so we have a single
 * entry point to track adoption.
 */
export { default as Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { default as Badge, toneForStatus } from './Badge'
export type { BadgeProps, BadgeTone } from './Badge'

export { default as Modal } from './Modal'
export type { ModalProps, ModalSize } from './Modal'

export { default as Skeleton } from './Skeleton'
export type {} from './Skeleton'

export { default as PageBar } from './PageBar'
