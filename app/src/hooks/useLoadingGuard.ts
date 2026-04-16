import { useEffect, useRef } from 'react'

/**
 * Safety guard against stuck loading states.
 *
 * Two-phase approach:
 *  1. After `softMs` (default 10s): calls `onSlow` if provided — use this to
 *     show a "still loading" message without killing the request.
 *  2. After `hardMs` (default 30s): calls `onTimeout` — the request is
 *     genuinely stuck, bail out.
 *
 * Both timers reset when `loading` goes back to false.
 */
export function useLoadingGuard(
  loading: boolean,
  onTimeout: () => void,
  hardMs = 30000,
  onSlow?: () => void,
  softMs = 10000,
) {
  const hardRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const softRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loading) {
      if (onSlow) {
        softRef.current = setTimeout(() => {
          onSlow()
        }, softMs)
      }
      hardRef.current = setTimeout(() => {
        onTimeout()
      }, hardMs)
    } else {
      if (hardRef.current) { clearTimeout(hardRef.current); hardRef.current = null }
      if (softRef.current) { clearTimeout(softRef.current); softRef.current = null }
    }

    return () => {
      if (hardRef.current) { clearTimeout(hardRef.current); hardRef.current = null }
      if (softRef.current) { clearTimeout(softRef.current); softRef.current = null }
    }
  }, [loading, hardMs, softMs, onTimeout, onSlow])
}
