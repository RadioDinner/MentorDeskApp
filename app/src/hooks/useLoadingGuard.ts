import { useEffect, useRef } from 'react'

/**
 * Safety guard against stuck loading states.
 * If `loading` stays true for longer than `timeoutMs`, calls `onTimeout`.
 * Resets when loading goes back to false.
 */
export function useLoadingGuard(
  loading: boolean,
  onTimeout: () => void,
  timeoutMs = 8000,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loading) {
      timerRef.current = setTimeout(() => {
        console.warn('[useLoadingGuard] Loading timed out after', timeoutMs, 'ms')
        onTimeout()
      }, timeoutMs)
    } else if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [loading, timeoutMs])
}
