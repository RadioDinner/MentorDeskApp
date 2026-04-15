/**
 * Skeleton placeholder — animated shimmer shown while content is loading.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-10 w-full rounded-lg" />
 *   <Skeleton count={3} className="h-4 w-full" gap="gap-2" />
 */

interface SkeletonProps {
  /** Tailwind classes for width, height, rounded, etc. Defaults to h-4 w-full. */
  className?: string
  /** Repeat the skeleton N times in a vertical stack. */
  count?: number
  /** Gap between repeated skeletons (Tailwind gap-* class). Default: gap-3. */
  gap?: string
}

export default function Skeleton({ className = 'h-4 w-full', count = 1, gap = 'gap-3' }: SkeletonProps) {
  if (count <= 1) {
    return <div className={`rounded bg-gray-200 animate-pulse ${className}`} />
  }

  return (
    <div className={`flex flex-col ${gap}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`rounded bg-gray-200 animate-pulse ${className}`} />
      ))}
    </div>
  )
}
