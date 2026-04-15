import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet, supabaseRestCall } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import FolderManager from '../components/FolderManager'
import ListGridToggle from '../components/ListGridToggle'
import { formatDate } from '../lib/format'
import type { Canvas, CanvasFolder, ViewMode } from '../types'

interface CanvasWithNames extends Canvas {
  mentor_name: string
  mentee_name: string
  note_count: number
}

const VIEW_STORAGE_KEY = 'mentordesk_canvases_view'

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'list' || v === 'grid' ? v : 'grid'
}

export default function CanvasesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<CanvasWithNames[]>([])
  const [folders, setFolders] = useState<CanvasFolder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState<ViewMode>(readStoredView)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  function changeView(next: ViewMode) {
    setView(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    }
  }

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [canvasesRes, foldersRes] = await Promise.all([
          supabaseRestGet<Canvas & {
            mentor: { first_name: string; last_name: string } | null
            mentee: { first_name: string; last_name: string } | null
          }>(
            'canvases',
            `select=*,mentor:staff!canvases_mentor_id_fkey(first_name,last_name),mentee:mentees!canvases_mentee_id_fkey(first_name,last_name)&organization_id=eq.${orgId}&order=updated_at.desc`,
            { label: 'canvases:list' },
          ),
          supabaseRestGet<CanvasFolder>(
            'canvas_folders',
            `select=*&organization_id=eq.${orgId}&order=order_index.asc`,
            { label: 'canvases:folders' },
          ),
        ])
        if (canvasesRes.error) { setError(canvasesRes.error.message); return }
        if (foldersRes.error)  { setError(foldersRes.error.message); return }
        setFolders(foldersRes.data ?? [])
        setItems((canvasesRes.data ?? []).map(c => ({
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

  async function moveCanvasToFolder(canvasId: string, folderId: string | null) {
    setItems(prev => prev.map(c => c.id === canvasId ? { ...c, folder_id: folderId } : c))
    const { error: err } = await supabaseRestCall(
      'canvases',
      'PATCH',
      { folder_id: folderId },
      `id=eq.${canvasId}`,
    )
    if (err) console.error('[CanvasesPage] moveCanvasToFolder error:', err)
  }

  const visibleItems = items
    .filter(c => showArchived ? true : !c.archived_at)
    .filter(c => (c.folder_id ?? null) === currentFolderId)
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
          <ListGridToggle value={view} onChange={changeView} />
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

      {profile?.organization_id && (
        <FolderManager<CanvasFolder>
          folders={folders}
          setFolders={setFolders}
          currentFolderId={currentFolderId}
          setCurrentFolderId={setCurrentFolderId}
          orgId={profile.organization_id}
          folderTable="canvas_folders"
          itemTable="canvases"
          dragKey="canvas-id"
          rootLabel="All Canvases"
          onMoveItem={moveCanvasToFolder}
        />
      )}

      {loading ? (
        <Skeleton count={5} className="h-16 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : visibleItems.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No canvases yet.</p>
          <p className="text-xs text-gray-400 mt-1">Create a canvas to start a shared sticky-note workspace for a mentor / mentee pair.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleItems.map(c => (
            <CanvasGridCard key={c.id} canvas={c} onOpen={() => navigate(`/canvases/${c.id}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {visibleItems.map(c => (
            <CanvasListRow key={c.id} canvas={c} onOpen={() => navigate(`/canvases/${c.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function CanvasListRow({ canvas, onOpen }: { canvas: CanvasWithNames; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('canvas-id', canvas.id)}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
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
    </div>
  )
}

function CanvasGridCard({ canvas, onOpen }: { canvas: CanvasWithNames; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('canvas-id', canvas.id)}
      onClick={onOpen}
      className="group bg-white rounded-md border border-gray-200/80 px-5 py-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-fuchsia-400 to-fuchsia-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {canvas.title[0]?.toUpperCase() ?? 'C'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand transition-colors">
              {canvas.title}
            </h3>
            {canvas.archived_at && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                Archived
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {canvas.mentor_name} &amp; {canvas.mentee_name}
          </p>
          {canvas.description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{canvas.description}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-gray-500">
        <span className="tabular-nums">
          <span className="font-semibold text-fuchsia-600">{canvas.note_count}</span>{' '}
          note{canvas.note_count === 1 ? '' : 's'}
        </span>
        <span className="text-gray-400">Updated {formatDate(canvas.updated_at)}</span>
      </div>
    </div>
  )
}
