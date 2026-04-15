import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import type { Canvas } from '../types'

interface CanvasWithNames extends Canvas {
  mentor_name: string
  mentee_name: string
  note_count: number
}

export default function CanvasesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<CanvasWithNames[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const res = await supabaseRestGet<Canvas & {
          mentor: { first_name: string; last_name: string } | null
          mentee: { first_name: string; last_name: string } | null
        }>(
          'canvases',
          `select=*,mentor:staff!canvases_mentor_id_fkey(first_name,last_name),mentee:mentees!canvases_mentee_id_fkey(first_name,last_name)&organization_id=eq.${orgId}&order=updated_at.desc`,
          { label: 'canvases:list' },
        )
        if (res.error) { setError(res.error.message); return }
        setItems((res.data ?? []).map(c => ({
          ...c,
          mentor_name: c.mentor ? `${c.mentor.first_name} ${c.mentor.last_name}` : '(unknown)',
          mentee_name: c.mentee ? `${c.mentee.first_name} ${c.mentee.last_name}` : '(unknown)',
          note_count: c.content?.notes?.length ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[CanvasesPage] loadAll error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id])

  const visibleItems = items.filter(c => showArchived ? true : !c.archived_at)
  const canCreate = profile?.role === 'admin' || profile?.role === 'operations' || profile?.role === 'mentor' || profile?.role === 'assistant_mentor'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Canvases</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {visibleItems.length} canvas{visibleItems.length === 1 ? '' : 'es'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
          {canCreate && (
            <Button onClick={() => navigate('/canvases/new')}>+ Create Canvas</Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton count={5} className="h-16 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : visibleItems.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No canvases yet.</p>
          <p className="text-xs text-gray-400 mt-1">Create a canvas to start a shared sticky-note workspace for a mentor / mentee pair.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {visibleItems.map(c => (
            <CanvasRow key={c.id} canvas={c} onOpen={() => navigate(`/canvases/${c.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function CanvasRow({ canvas, onOpen }: { canvas: CanvasWithNames; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fuchsia-400 to-fuchsia-600 flex items-center justify-center text-white font-bold shrink-0">
        {canvas.title[0]?.toUpperCase() ?? 'C'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{canvas.title}</p>
          {canvas.archived_at && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Archived
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {canvas.mentor_name} &amp; {canvas.mentee_name}
          {canvas.description ? ` · ${canvas.description}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs tabular-nums text-gray-500">
          {canvas.note_count} note{canvas.note_count === 1 ? '' : 's'}
        </span>
        <span className="text-xs text-gray-400">
          Updated {formatDate(canvas.updated_at)}
        </span>
      </div>
    </button>
  )
}
