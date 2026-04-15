import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import { Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import type { Canvas } from '../types'

interface CanvasRow extends Canvas {
  note_count: number
}

export default function MenteeCanvasesPage() {
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [canvases, setCanvases] = useState<CanvasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }
    const menteeId = menteeProfile.id

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const res = await supabaseRestGet<Canvas>(
          'canvases',
          `select=*&mentee_id=eq.${menteeId}&archived_at=is.null&order=updated_at.desc`,
          { label: 'mentee:canvases' },
        )
        if (res.error) { setError(res.error.message); return }
        setCanvases((res.data ?? []).map(c => ({
          ...c,
          note_count: c.content?.notes?.length ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadData
    loadData()
  }, [menteeProfile?.id])

  if (loading) return <Skeleton count={4} className="h-20 w-full" gap="gap-3" />
  if (error) return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Canvases</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {canvases.length} canvas{canvases.length === 1 ? '' : 'es'}
        </p>
      </div>

      {canvases.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No canvases yet.</p>
          <p className="text-xs text-gray-400 mt-1">Canvases you're collaborating on with your mentor will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {canvases.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/my-canvases/${c.id}`)}
              className="w-full text-left bg-white rounded-md border border-gray-200/80 px-5 py-4 hover:border-brand/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 group-hover:text-brand transition-colors">
                  {c.title}
                </p>
                <span className="text-xs text-gray-400 tabular-nums">
                  {c.note_count} note{c.note_count === 1 ? '' : 's'}
                </span>
              </div>
              {c.description && (
                <p className="text-xs text-gray-400 line-clamp-2">{c.description}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                Updated {formatDate(c.updated_at)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
