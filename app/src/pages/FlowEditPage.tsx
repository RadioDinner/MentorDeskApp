import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestCall, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import { logAudit } from '../lib/audit'
import { useToast } from '../context/ToastContext'
import LoadingErrorState from '../components/LoadingErrorState'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import {
  WORKSPACE_SIZE,
  NODE_DEFAULTS,
  COLORS,
  migrateContent,
  createOfferingNode,
  createDecisionNode,
  createStatusNode,
  createEndNode,
  nodeSize,
  type NodeType,
} from '../lib/journeyFlow'
import type {
  JourneyFlow,
  JourneyNode,
  JourneyConnector,
  JourneyOfferingNode,
  JourneyDecisionNode,
  JourneyStatusNode,
  Offering,
} from '../types'

export default function FlowEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [flow, setFlow] = useState<JourneyFlow | null>(null)
  const [nodes, setNodes] = useState<JourneyNode[]>([])
  // Connectors are preserved across edits but the SVG render layer lands
  // in Block 10. Keeping them in state now so drag / add-node in Block 8
  // and 9 do not clobber them.
  const [connectors, setConnectors] = useState<JourneyConnector[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState<string | null>(null)
  const [showOfferingPicker, setShowOfferingPicker] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const dragStateRef = useRef<{
    nodeId: string
    startPointerX: number
    startPointerY: number
    startNodeX: number
    startNodeY: number
    moved: boolean
  } | null>(null)

  // ── Load flow + offerings ──────────────────────────────────────────────
  useEffect(() => {
    if (!id || !profile?.organization_id) return
    const orgId = profile.organization_id

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [flowRes, offeringsRes] = await Promise.all([
          supabase.from('journey_flows').select('*').eq('id', id!).single(),
          supabaseRestGet<Offering>(
            'offerings',
            `select=*&organization_id=eq.${orgId}&order=name.asc`,
            { label: 'flow:offerings' },
          ),
        ])
        if (flowRes.error) { setError(flowRes.error.message); return }
        const f = flowRes.data as JourneyFlow
        const normalized = migrateContent(f.content)
        setFlow({ ...f, content: normalized })
        setNodes(normalized.nodes)
        setConnectors(normalized.connectors)
        setDirty(false)
        if (!offeringsRes.error) setOfferings(offeringsRes.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[FlowEditPage] load error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = load
    load()
  }, [id, profile?.organization_id])

  // beforeunload warning when dirty
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ── Drag listeners (document-level while a drag is in progress) ───────
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragStateRef.current
      if (!drag) return
      const dx = e.clientX - drag.startPointerX
      const dy = e.clientY - drag.startPointerY
      if (dx === 0 && dy === 0) return
      drag.moved = true
      setNodes(prev => prev.map(n => {
        if (n.id !== drag.nodeId) return n
        const size = nodeSize(n.type)
        return {
          ...n,
          x: Math.max(0, Math.min(WORKSPACE_SIZE.width  - size.width,  drag.startNodeX + dx)),
          y: Math.max(0, Math.min(WORKSPACE_SIZE.height - size.height, drag.startNodeY + dy)),
        }
      }))
    }
    function handleUp() {
      if (!dragStateRef.current) return
      const ds = dragStateRef.current
      dragStateRef.current = null
      if (ds.moved) setDirty(true)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [])

  // ── Permission ─────────────────────────────────────────────────────────
  const canEdit = profile?.role === 'admin'
    || profile?.role === 'operations'
    || profile?.role === 'course_creator'

  // ── Node actions ───────────────────────────────────────────────────────
  function handleNodePointerDown(e: React.PointerEvent, node: JourneyNode) {
    if (!canEdit) return
    const target = e.target as HTMLElement
    if (target.closest('button, [data-no-drag]')) return
    dragStateRef.current = {
      nodeId: node.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      moved: false,
    }
    e.preventDefault()
  }

  /** Pick a reasonable spawn position for a new node: slightly offset from
   *  the workspace center, so multiple adds do not stack exactly on top of
   *  each other. Uses node count as a cheap stagger. */
  function spawnPosition(type: NodeType) {
    const size = NODE_DEFAULTS[type]
    const cx = Math.round(WORKSPACE_SIZE.width / 2) - size.width / 2
    const cy = Math.round(WORKSPACE_SIZE.height / 2) - size.height / 2
    const stagger = (nodes.length % 10) * 24
    return { x: cx + stagger, y: cy + stagger }
  }

  function addOfferingNode(offeringId: string) {
    const { x, y } = spawnPosition('offering')
    setNodes(prev => [...prev, createOfferingNode(x, y, offeringId)])
    setDirty(true)
    setShowOfferingPicker(false)
  }

  function addDecisionNode() {
    const { x, y } = spawnPosition('decision')
    setNodes(prev => [...prev, createDecisionNode(x, y, 'Decision')])
    setDirty(true)
  }

  function addStatusNode() {
    const { x, y } = spawnPosition('status')
    setNodes(prev => [...prev, createStatusNode(x, y, 'Status')])
    setDirty(true)
  }

  function addEndNode() {
    const { x, y } = spawnPosition('end')
    setNodes(prev => [...prev, createEndNode(x, y)])
    setDirty(true)
  }

  // ── Title / archive / delete (persist immediately) ─────────────────────
  async function saveTitle() {
    if (!flow || editingTitleValue === null) return
    const trimmed = editingTitleValue.trim()
    if (!trimmed || trimmed === flow.name) {
      setEditingTitleValue(null)
      return
    }
    const { error: err } = await supabaseRestCall(
      'journey_flows',
      'PATCH',
      { name: trimmed },
      `id=eq.${flow.id}`,
    )
    if (err) {
      toast.error(err.message)
      setEditingTitleValue(null)
      return
    }
    setFlow({ ...flow, name: trimmed })
    setEditingTitleValue(null)
  }

  async function toggleArchive() {
    if (!flow) return
    const nextArchivedAt = flow.archived_at ? null : new Date().toISOString()
    const { error: err } = await supabaseRestCall(
      'journey_flows',
      'PATCH',
      { archived_at: nextArchivedAt },
      `id=eq.${flow.id}`,
    )
    if (err) { toast.error(err.message); return }
    setFlow({ ...flow, archived_at: nextArchivedAt })
    toast.success(nextArchivedAt ? 'Flow archived' : 'Flow unarchived')
  }

  async function deleteFlow() {
    if (!flow) return
    if (!window.confirm(`Delete "${flow.name}"? This cannot be undone.`)) return
    const { error: err } = await supabaseRestCall(
      'journey_flows',
      'DELETE',
      {},
      `id=eq.${flow.id}`,
    )
    if (err) { toast.error(err.message); return }
    if (profile) {
      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'deleted',
        entity_type: 'journey_flow',
        entity_id: flow.id,
        details: { name: flow.name },
      })
    }
    toast.success('Flow deleted')
    navigate('/flows')
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl">
        <Skeleton count={6} className="h-11 w-full" gap="gap-3" />
      </div>
    )
  }
  if (error || !flow) {
    return <LoadingErrorState message={error ?? 'Flow not found'} onRetry={() => fetchRef.current()} />
  }

  return (
    <div className="max-w-6xl flex flex-col" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/flows')}
            className="text-sm text-gray-500 hover:text-gray-700 shrink-0"
          >
            &larr; Back
          </button>
          {editingTitleValue === null ? (
            <h1
              className="text-lg font-semibold text-gray-900 cursor-pointer hover:underline decoration-dotted truncate"
              onClick={() => canEdit && setEditingTitleValue(flow.name)}
            >
              {flow.name}
            </h1>
          ) : (
            <input
              autoFocus
              value={editingTitleValue}
              onChange={e => setEditingTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') setEditingTitleValue(null)
              }}
              className="text-lg font-semibold text-gray-900 border border-gray-300 rounded px-2 py-0.5 outline-none focus:border-brand"
            />
          )}
          {flow.archived_at && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Archived
            </span>
          )}
          {dirty && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Unsaved
            </span>
          )}
          <span className="text-[11px] text-gray-400 tabular-nums">
            {nodes.length} node{nodes.length === 1 ? '' : 's'} · {connectors.length} connector{connectors.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" onClick={toggleArchive}>
                {flow.archived_at ? 'Unarchive' : 'Archive'}
              </Button>
              <Button variant="danger" onClick={deleteFlow}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Add-node toolbar */}
      {canEdit && (
        <div className="flex items-center gap-2 mb-3 relative">
          <span className="text-xs text-gray-500 mr-2">Add:</span>
          <div className="relative">
            <Button variant="secondary" onClick={() => setShowOfferingPicker(v => !v)}>
              + Offering
            </Button>
            {showOfferingPicker && (
              <div
                className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg z-50"
                data-no-drag
              >
                {offerings.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">No offerings available.</div>
                ) : (
                  offerings.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      onClick={() => addOfferingNode(o.id)}
                    >
                      <div className="text-sm text-gray-900">{o.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{o.type}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={addDecisionNode}>+ Decision</Button>
          <Button variant="secondary" onClick={addStatusNode}>+ Status</Button>
          <Button variant="secondary" onClick={addEndNode}>+ End</Button>
        </div>
      )}

      {/* Workspace */}
      <div
        className="flex-1 overflow-auto rounded-md border border-gray-200 bg-gray-50 relative"
        style={{ minHeight: 400 }}
      >
        <div
          className="relative"
          style={{
            width: WORKSPACE_SIZE.width,
            height: WORKSPACE_SIZE.height,
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {nodes.map(n => (
            <NodeView
              key={n.id}
              node={n}
              offerings={offerings}
              onPointerDown={e => handleNodePointerDown(e, n)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Node renderers ───────────────────────────────────────────────────────

function NodeView({
  node,
  offerings,
  onPointerDown,
}: {
  node: JourneyNode
  offerings: Offering[]
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const size = NODE_DEFAULTS[node.type]
  const common: React.CSSProperties = {
    left: node.x,
    top: node.y,
    width: size.width,
    height: size.height,
  }

  if (node.type === 'start') {
    const c = COLORS.start
    return (
      <div
        onPointerDown={onPointerDown}
        className={`absolute rounded-full border-2 shadow-sm flex items-center justify-center select-none cursor-grab ${c.bg} ${c.border}`}
        style={common}
      >
        <span className={`text-sm font-semibold ${c.text}`}>Start</span>
      </div>
    )
  }

  if (node.type === 'end') {
    const c = COLORS.end
    return (
      <div
        onPointerDown={onPointerDown}
        className={`absolute rounded-full border-2 shadow-sm flex items-center justify-center select-none cursor-grab ${c.bg} ${c.border}`}
        style={common}
      >
        <span className={`text-sm font-semibold ${c.text}`}>End</span>
      </div>
    )
  }

  if (node.type === 'status') {
    return <StatusNodeView node={node} common={common} onPointerDown={onPointerDown} />
  }

  if (node.type === 'decision') {
    return <DecisionNodeView node={node} common={common} onPointerDown={onPointerDown} />
  }

  // offering
  return <OfferingNodeView node={node} offerings={offerings} common={common} onPointerDown={onPointerDown} />
}

function StatusNodeView({
  node,
  common,
  onPointerDown,
}: {
  node: JourneyStatusNode
  common: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const c = COLORS.status
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute rounded-md border-2 shadow-sm flex items-center justify-center px-3 select-none cursor-grab ${c.bg} ${c.border}`}
      style={common}
    >
      <span className={`text-sm font-medium truncate ${c.text}`}>{node.label || 'Status'}</span>
    </div>
  )
}

function DecisionNodeView({
  node,
  common,
  onPointerDown,
}: {
  node: JourneyDecisionNode
  common: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const c = COLORS.decision
  // A rotated square approximates a diamond. Inside it we counter-rotate
  // a label wrapper so the text stays upright.
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute flex items-center justify-center select-none cursor-grab"
      style={common}
    >
      <div
        className={`absolute inset-0 border-2 shadow-sm ${c.bg} ${c.border}`}
        style={{ transform: 'rotate(45deg) scale(0.72)', transformOrigin: 'center' }}
      />
      <span className={`relative text-xs font-medium text-center px-3 ${c.text}`}>
        {node.label || 'Decision'}
      </span>
    </div>
  )
}

function OfferingNodeView({
  node,
  offerings,
  common,
  onPointerDown,
}: {
  node: JourneyOfferingNode
  offerings: Offering[]
  common: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const c = COLORS.offering
  const offering = offerings.find(o => o.id === node.offeringId)
  const name = offering?.name ?? '(offering not found)'
  const kind = offering?.type === 'course' ? 'Course'
    : offering?.type === 'engagement' ? 'Engagement'
    : '—'
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute rounded-md border-2 shadow-sm px-3 py-2 flex flex-col justify-center select-none cursor-grab ${c.bg} ${c.border}`}
      style={common}
    >
      <div className={`text-[9px] font-semibold uppercase tracking-wider ${c.text}`}>{kind}</div>
      <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
    </div>
  )
}
