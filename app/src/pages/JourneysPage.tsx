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
import type { JourneyFlow, JourneyFolder, ViewMode } from '../types'

interface FlowWithCounts extends JourneyFlow {
  node_count: number
  connector_count: number
}

const VIEW_STORAGE_KEY = 'mentordesk_journeys_view'

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'list' || v === 'grid' ? v : 'grid'
}

export default function JourneysPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<FlowWithCounts[]>([])
  const [folders, setFolders] = useState<JourneyFolder[]>([])
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
        const [flowsRes, foldersRes] = await Promise.all([
          supabaseRestGet<JourneyFlow>(
            'journey_flows',
            `select=*&organization_id=eq.${orgId}&order=updated_at.desc`,
            { label: 'flows:list' },
          ),
          supabaseRestGet<JourneyFolder>(
            'flow_folders',
            `select=*&organization_id=eq.${orgId}&order=order_index.asc`,
            { label: 'flows:folders' },
          ),
        ])
        if (flowsRes.error)   { setError(flowsRes.error.message); return }
        if (foldersRes.error) { setError(foldersRes.error.message); return }
        setFolders(foldersRes.data ?? [])
        setItems((flowsRes.data ?? []).map(f => ({
          ...f,
          node_count: f.content?.nodes?.length ?? 0,
          connector_count: f.content?.connectors?.length ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[FlowsPage] loadAll error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id])

  async function moveFlowToFolder(flowId: string, folderId: string | null) {
    setItems(prev => prev.map(f => f.id === flowId ? { ...f, folder_id: folderId } : f))
    const { error: err } = await supabaseRestCall(
      'journey_flows',
      'PATCH',
      { folder_id: folderId },
      `id=eq.${flowId}`,
    )
    if (err) console.error('[FlowsPage] moveFlowToFolder error:', err)
  }

  const visibleItems = items
    .filter(f => showArchived ? true : !f.archived_at)
    .filter(f => (f.folder_id ?? null) === currentFolderId)
  const canCreate = profile?.role === 'admin' || profile?.role === 'operations' || profile?.role === 'course_creator'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Journeys</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {visibleItems.length} journey{visibleItems.length === 1 ? '' : 's'}
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
            <Button onClick={() => navigate('/journeys/new')}>+ Create Journey</Button>
          )}
        </div>
      </div>

      {profile?.organization_id && (
        <FolderManager<JourneyFolder>
          folders={folders}
          setFolders={setFolders}
          currentFolderId={currentFolderId}
          setCurrentFolderId={setCurrentFolderId}
          orgId={profile.organization_id}
          folderTable="flow_folders"
          itemTable="journey_flows"
          dragKey="flow-id"
          rootLabel="All Journeys"
          onMoveItem={moveFlowToFolder}
        />
      )}

      {loading ? (
        <Skeleton count={5} className="h-16 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : visibleItems.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No journeys yet.</p>
          <p className="text-xs text-gray-400 mt-1">Create a journey to build a reusable template for mentees.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleItems.map(f => (
            <FlowGridCard key={f.id} flow={f} onOpen={() => navigate(`/journeys/${f.id}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {visibleItems.map(f => (
            <FlowListRow key={f.id} flow={f} onOpen={() => navigate(`/journeys/${f.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FlowListRow({ flow, onOpen }: { flow: FlowWithCounts; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('flow-id', flow.id)}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white font-bold shrink-0">
        {flow.name[0]?.toUpperCase() ?? 'J'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{flow.name}</p>
          {flow.archived_at && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Archived
            </span>
          )}
        </div>
        {flow.description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{flow.description}</p>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs tabular-nums text-gray-500">
          {flow.node_count} node{flow.node_count === 1 ? '' : 's'}
        </span>
        <span className="text-xs text-gray-400">
          Updated {formatDate(flow.updated_at)}
        </span>
      </div>
    </div>
  )
}

function FlowGridCard({ flow, onOpen }: { flow: FlowWithCounts; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('flow-id', flow.id)}
      onClick={onOpen}
      className="group bg-white rounded-md border border-gray-200/80 px-5 py-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {flow.name[0]?.toUpperCase() ?? 'J'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand transition-colors">
              {flow.name}
            </h3>
            {flow.archived_at && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                Archived
              </span>
            )}
          </div>
          {flow.description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{flow.description}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-gray-500">
        <span className="tabular-nums">
          <span className="font-semibold text-violet-600">{flow.node_count}</span>{' '}
          node{flow.node_count === 1 ? '' : 's'}
          {' · '}
          <span className="font-semibold text-violet-600">{flow.connector_count}</span>{' '}
          connector{flow.connector_count === 1 ? '' : 's'}
        </span>
        <span className="text-gray-400">Updated {formatDate(flow.updated_at)}</span>
      </div>
    </div>
  )
}
