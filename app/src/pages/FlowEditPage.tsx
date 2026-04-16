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
  GRID_SIZE,
  NODE_DEFAULTS,
  HISTORY_LIMIT,
  COLORS,
  migrateContent,
  createOfferingNode,
  createDecisionNode,
  createConnector,
  nodeSize,
  snapToGrid,
  connectorPath,
  autoLayout,
  computeDepths,
  type NodeType,
} from '../lib/journeyFlow'
import type {
  JourneyFlow,
  JourneyNode,
  JourneyConnector,
  JourneyOfferingNode,
  JourneyDecisionNode,
  Offering,
  FlowLayoutMode,
} from '../types'

type HistorySnapshot = { nodes: JourneyNode[]; connectors: JourneyConnector[] }

export default function FlowEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [flow, setFlow] = useState<JourneyFlow | null>(null)
  const [nodes, setNodes] = useState<JourneyNode[]>([])
  const [connectors, setConnectors] = useState<JourneyConnector[]>([])
  // Undo stack: each entry is the { nodes, connectors } state BEFORE a
  // coarse action. Capped at HISTORY_LIMIT.
  const [past, setPast] = useState<HistorySnapshot[]>([])
  const [saving, setSaving] = useState(false)
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState<string | null>(null)
  const [showOfferingPicker, setShowOfferingPicker] = useState(false)
  // Connect mode: null when off. sourceId is the first clicked node id
  // (null until the user picks one). Second click picks target and creates
  // the connector.
  const [connectorMode, setConnectorMode] = useState<{ sourceId: string | null } | null>(null)
  // Inline label edit state for connectors.
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState('')
  const [layoutMode, setLayoutMode] = useState<FlowLayoutMode>('freeform')

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
    historyPushed: boolean
    prevNodes: JourneyNode[]
    prevConnectors: JourneyConnector[]
  } | null>(null)

  // ── Load flow + offerings ──────────────────────────────────────────────
  useEffect(() => {
    if (!id || !profile?.organization_id) return
    const orgId = profile.organization_id

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [flowRes, offeringsRes, orgRes] = await Promise.all([
          supabase.from('journey_flows').select('*').eq('id', id!).single(),
          supabaseRestGet<Offering>(
            'offerings',
            `select=*&organization_id=eq.${orgId}&order=name.asc`,
            { label: 'flow:offerings' },
          ),
          supabase.from('organizations').select('flow_layout_mode').eq('id', orgId).single(),
        ])
        if (flowRes.error) { setError(flowRes.error.message); return }
        const f = flowRes.data as JourneyFlow
        const normalized = migrateContent(f.content)
        const mode: FlowLayoutMode = (orgRes.data as { flow_layout_mode?: FlowLayoutMode } | null)?.flow_layout_mode ?? 'freeform'
        setLayoutMode(mode)
        setFlow({ ...f, content: normalized })
        // In auto mode, apply auto-layout on load.
        setNodes(mode === 'auto' ? autoLayout(normalized.nodes, normalized.connectors) : normalized.nodes)
        setConnectors(normalized.connectors)
        setPast([])
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

  // Keep refs so the drag effect closure stays current.
  const layoutModeRef = useRef(layoutMode)
  layoutModeRef.current = layoutMode
  const connectorsRef = useRef(connectors)
  connectorsRef.current = connectors

  // ── Drag listeners (document-level while a drag is in progress) ───────
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragStateRef.current
      if (!drag) return
      const dx = e.clientX - drag.startPointerX
      const dy = e.clientY - drag.startPointerY
      if (dx === 0 && dy === 0) return
      drag.moved = true
      // Lazy-push: a pointerdown with no real movement does not consume
      // an undo slot.
      if (!drag.historyPushed) {
        setPast(prev => {
          const next = [...prev, { nodes: drag.prevNodes, connectors: drag.prevConnectors }]
          if (next.length > HISTORY_LIMIT) next.shift()
          return next
        })
        drag.historyPushed = true
      }
      setNodes(prev => prev.map(n => {
        if (n.id !== drag.nodeId) return n
        const size = nodeSize(n.type)
        const rawX = drag.startNodeX + dx
        if (layoutModeRef.current === 'auto') {
          // Auto mode: horizontal-only drag within the node's row.
          return {
            ...n,
            x: snapToGrid(Math.max(0, Math.min(WORKSPACE_SIZE.width - size.width, rawX))),
          }
        }
        // Freeform mode: full grid-snap drag.
        const rawY = drag.startNodeY + dy
        return {
          ...n,
          x: snapToGrid(Math.max(0, Math.min(WORKSPACE_SIZE.width  - size.width,  rawX))),
          y: snapToGrid(Math.max(0, Math.min(WORKSPACE_SIZE.height - size.height, rawY))),
        }
      }))
    }
    function handleUp() {
      if (!dragStateRef.current) return
      const ds = dragStateRef.current
      dragStateRef.current = null
      if (!ds.moved) return
      setDirty(true)
      if (layoutModeRef.current === 'auto') {
        // After horizontal reorder, re-run autoLayout to snap everything
        // clean. The node array order (which autoLayout uses for within-row
        // ordering) is updated by sorting nodes at the same depth by their
        // current x position before passing to autoLayout.
        setNodes(prev => {
          const depths = computeDepths(prev, connectorsRef.current)
          const sorted = [...prev].sort((a, b) => {
            const da = depths.get(a.id) ?? 999
            const db = depths.get(b.id) ?? 999
            if (da !== db) return da - db
            return a.x - b.x
          })
          return autoLayout(sorted, connectorsRef.current)
        })
      }
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

  // ── Undo history ───────────────────────────────────────────────────────
  function pushHistory() {
    setPast(prev => {
      const next = [...prev, { nodes, connectors }]
      if (next.length > HISTORY_LIMIT) next.shift()
      return next
    })
  }

  function undo() {
    if (past.length === 0) return
    const snapshot = past[past.length - 1]
    setPast(prev => prev.slice(0, -1))
    setNodes(layoutMode === 'auto' ? autoLayout(snapshot.nodes, snapshot.connectors) : snapshot.nodes)
    setConnectors(snapshot.connectors)
    // Any in-progress label edit or connect mode should be closed so the
    // restored content sticks.
    setEditingConnectorId(null)
    setEditingLabelValue('')
    setConnectorMode(null)
    setDirty(true)
  }

  // ── Connector mode ─────────────────────────────────────────────────────
  function startConnectMode() {
    if (!canEdit) return
    setConnectorMode({ sourceId: null })
    setEditingConnectorId(null)
  }

  function handleConnectClick(nodeId: string) {
    if (!connectorMode) return
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    if (!connectorMode.sourceId) {
      // An 'end' node cannot be a source.
      if (node.type === 'end') return
      setConnectorMode({ sourceId: nodeId })
      return
    }
    // Clicking the source again cancels the in-progress connector.
    if (connectorMode.sourceId === nodeId) {
      setConnectorMode(null)
      return
    }
    // A 'start' node cannot be a target.
    if (node.type === 'start') return
    const src = connectorMode.sourceId
    // Directed dedup: don't add A→B if one already exists.
    const alreadyExists = connectors.some(
      c => c.fromNodeId === src && c.toNodeId === nodeId,
    )
    if (!alreadyExists) {
      pushHistory()
      const newConn = createConnector(src, nodeId)
      const nextConnectors = [...connectors, newConn]
      setConnectors(nextConnectors)
      setDirty(true)
      relayoutIfAuto(nodes, nextConnectors)
    }
    setConnectorMode(null)
  }

  function deleteConnector(connectorId: string) {
    if (!canEdit) return
    if (editingConnectorId === connectorId) {
      setEditingConnectorId(null)
      setEditingLabelValue('')
    }
    pushHistory()
    const nextConnectors = connectors.filter(c => c.id !== connectorId)
    setConnectors(nextConnectors)
    setDirty(true)
    relayoutIfAuto(nodes, nextConnectors)
  }

  function beginEditLabel(connector: JourneyConnector) {
    if (!canEdit) return
    if (connectorMode) return
    setEditingConnectorId(connector.id)
    setEditingLabelValue(connector.label)
  }

  function saveConnectorLabel(connectorId: string) {
    const trimmed = editingLabelValue.trim()
    const existing = connectors.find(c => c.id === connectorId)
    if (existing && existing.label !== trimmed) {
      pushHistory()
      setConnectors(prev =>
        prev.map(c => (c.id === connectorId ? { ...c, label: trimmed } : c)),
      )
      setDirty(true)
    }
    setEditingConnectorId(null)
    setEditingLabelValue('')
  }

  // Keyboard shortcuts:
  //   Escape          — cancel connect mode or label editing
  //   Cmd/Ctrl + Z    — undo
  //   Cmd/Ctrl + S    — save (only if dirty and not already saving)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack keys while the user is typing in an input/textarea.
      const target = e.target as HTMLElement | null
      const inField = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && !saving) void saveFlow()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (inField) return
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 'Escape') {
        if (connectorMode) {
          setConnectorMode(null)
          return
        }
        if (editingConnectorId) {
          setEditingConnectorId(null)
          setEditingLabelValue('')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorMode, editingConnectorId, past, nodes, connectors, dirty, saving])

  // ── Node actions ───────────────────────────────────────────────────────
  function handleNodePointerDown(e: React.PointerEvent, node: JourneyNode) {
    if (!canEdit) return
    const target = e.target as HTMLElement
    if (target.closest('button, [data-no-drag]')) return
    // In connect mode a pointerdown on a node is interpreted as a click
    // for building the connector, NOT as a drag.
    if (connectorMode) {
      handleConnectClick(node.id)
      e.preventDefault()
      return
    }
    dragStateRef.current = {
      nodeId: node.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      moved: false,
      historyPushed: false,
      prevNodes: nodes,
      prevConnectors: connectors,
    }
    e.preventDefault()
  }

  /** Pick a spawn position for a new node. Places it below the lowest
   *  existing node (or centered if the canvas is empty), snapped to the grid.
   *  Horizontally centered relative to the workspace. */
  function spawnPosition(type: NodeType) {
    const size = NODE_DEFAULTS[type]
    const cx = snapToGrid(Math.round(WORKSPACE_SIZE.width / 2) - size.width / 2)
    if (nodes.length === 0) {
      return { x: cx, y: snapToGrid(GRID_SIZE * 2) }
    }
    // Find the bottom edge of the lowest node and place below it with a gap.
    const bottommost = nodes.reduce((max, n) => {
      const bottom = n.y + nodeSize(n.type).height
      return bottom > max ? bottom : max
    }, 0)
    return { x: cx, y: snapToGrid(bottommost + GRID_SIZE * 2) }
  }

  /** In auto mode, re-run autoLayout after a mutation. Call this AFTER
   *  updating nodes/connectors state with the setter callback form so
   *  the latest state is used. */
  function relayoutIfAuto(nextNodes?: JourneyNode[], nextConnectors?: JourneyConnector[]) {
    if (layoutMode !== 'auto') return
    // Use provided arrays (for cases where we have the new state) or
    // schedule a setNodes with the latest state.
    if (nextNodes && nextConnectors) {
      setNodes(autoLayout(nextNodes, nextConnectors))
    } else {
      setNodes(prev => autoLayout(prev, connectorsRef.current))
    }
  }

  function addOfferingNode(offeringId: string) {
    pushHistory()
    const { x, y } = spawnPosition('offering')
    const newNode = createOfferingNode(x, y, offeringId)
    const nextNodes = [...nodes, newNode]
    setNodes(nextNodes)
    setDirty(true)
    setShowOfferingPicker(false)
    relayoutIfAuto(nextNodes, connectors)
  }

  function addDecisionNode() {
    pushHistory()
    const { x, y } = spawnPosition('decision')
    const newNode = createDecisionNode(x, y, 'Decision')
    const nextNodes = [...nodes, newNode]
    setNodes(nextNodes)
    setDirty(true)
    relayoutIfAuto(nextNodes, connectors)
  }

  function toggleEndNode(nodeId: string) {
    pushHistory()
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, isEnd: !n.isEnd } : n,
    ))
    setDirty(true)
  }

  function handleAutoLayout() {
    if (nodes.length === 0) return
    pushHistory()
    setNodes(autoLayout(nodes, connectors))
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

  // ── Save flow content ──────────────────────────────────────────────────
  async function saveFlow() {
    if (!flow || !canEdit || saving) return
    setSaving(true)
    try {
      const content = { nodes, connectors }
      const { error: err } = await supabaseRestCall(
        'journey_flows',
        'PATCH',
        { content },
        `id=eq.${flow.id}`,
      )
      if (err) {
        toast.error(err.message)
        return
      }
      setFlow({ ...flow, content, updated_at: new Date().toISOString() })
      setDirty(false)
      if (profile) {
        await logAudit({
          organization_id: profile.organization_id,
          actor_id: profile.id,
          action: 'updated',
          entity_type: 'journey_flow',
          entity_id: flow.id,
          details: {
            sub: 'content',
            node_count: nodes.length,
            connector_count: connectors.length,
          },
        })
      }
      toast.success('Saved')
    } finally {
      setSaving(false)
    }
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
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${layoutMode === 'auto' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
            {layoutMode === 'auto' ? 'Auto layout' : 'Freeform'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button
                variant="primary"
                onClick={saveFlow}
                disabled={!dirty || saving}
                title="Save (⌘S)"
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
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
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <Button
            variant="secondary"
            onClick={connectorMode ? () => setConnectorMode(null) : startConnectMode}
            className={connectorMode ? 'ring-2 ring-brand' : ''}
          >
            {connectorMode ? 'Cancel connect' : 'Connect'}
          </Button>
          <Button
            variant="secondary"
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (⌘Z)"
          >
            Undo
          </Button>
          {layoutMode === 'freeform' && (
            <>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <Button
                variant="secondary"
                onClick={handleAutoLayout}
                disabled={nodes.length === 0}
                title="Auto-arrange nodes by graph depth"
              >
                Auto-arrange
              </Button>
            </>
          )}
        </div>
      )}

      {connectorMode && (
        <div className="mb-2 text-xs text-brand bg-brand/5 border border-brand/20 rounded px-3 py-1.5">
          {connectorMode.sourceId
            ? 'Click a target node to create the connector — Esc to cancel.'
            : 'Click the source node to start a connector — Esc to cancel.'}
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
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            cursor: connectorMode ? 'crosshair' : undefined,
          }}
        >
          {/* Connector SVG layer — lives beneath nodes (z-index 0) so nodes
              stay clickable. The SVG itself has pointer-events: none; only
              the invisible wide hit-lines opt back in for click-to-delete. */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={WORKSPACE_SIZE.width}
            height={WORKSPACE_SIZE.height}
            style={{ zIndex: 0 }}
          >
            <defs>
              <marker
                id="journey-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>
            {connectors.map(c => {
              const from = nodes.find(n => n.id === c.fromNodeId)
              const to = nodes.find(n => n.id === c.toNodeId)
              if (!from || !to) return null
              const fs = nodeSize(from.type)
              const ts = nodeSize(to.type)
              const x1 = from.x + fs.width / 2
              const y1 = from.y + fs.height / 2
              const x2 = to.x + ts.width / 2
              const y2 = to.y + ts.height / 2
              const d = connectorPath(x1, y1, x2, y2)
              return (
                <g key={c.id}>
                  <path
                    d={d}
                    stroke="#64748b"
                    strokeWidth={2}
                    fill="none"
                    markerEnd="url(#journey-arrow)"
                  />
                  {canEdit && !connectorMode && (
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth={14}
                      fill="none"
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); deleteConnector(c.id) }}
                    >
                      <title>Click to delete connector</title>
                    </path>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Connector label layer — HTML (not SVG) so we can reuse inputs
              and hover affordances. Hidden while connect mode is active so
              clicks reach the underlying nodes. */}
          {!connectorMode && connectors.map(c => {
            const from = nodes.find(n => n.id === c.fromNodeId)
            const to = nodes.find(n => n.id === c.toNodeId)
            if (!from || !to) return null
            const fs = nodeSize(from.type)
            const ts = nodeSize(to.type)
            const mx = ((from.x + fs.width / 2) + (to.x + ts.width / 2)) / 2
            const my = ((from.y + fs.height / 2) + (to.y + ts.height / 2)) / 2
            const isEditing = editingConnectorId === c.id
            if (isEditing) {
              return (
                <input
                  key={c.id}
                  autoFocus
                  data-no-drag
                  value={editingLabelValue}
                  onChange={e => setEditingLabelValue(e.target.value)}
                  onBlur={() => saveConnectorLabel(c.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveConnectorLabel(c.id) }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingConnectorId(null)
                      setEditingLabelValue('')
                    }
                  }}
                  placeholder="label"
                  className="absolute text-xs px-1.5 py-0.5 bg-white border border-brand rounded shadow-sm outline-none"
                  style={{
                    left: mx,
                    top: my,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2,
                    width: 140,
                  }}
                />
              )
            }
            return (
              <div
                key={c.id}
                className="absolute flex items-center gap-1"
                style={{
                  left: mx,
                  top: my,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 2,
                }}
                data-no-drag
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); beginEditLabel(c) }}
                  disabled={!canEdit}
                  className={
                    'text-[11px] px-1.5 py-0.5 rounded border shadow-sm max-w-[160px] truncate ' +
                    (c.label
                      ? 'bg-white border-gray-300 text-gray-700 hover:border-brand'
                      : 'bg-gray-50 border-dashed border-gray-300 text-gray-400 hover:border-brand')
                  }
                  title={canEdit ? 'Click to edit label' : undefined}
                >
                  {c.label || 'label'}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteConnector(c.id) }}
                    className="text-[11px] leading-none w-4 h-4 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 hover:border-rose-400 hover:text-rose-600 shadow-sm"
                    title="Delete connector"
                  >
                    &times;
                  </button>
                )}
              </div>
            )
          })}

          {nodes.map(n => (
            <NodeView
              key={n.id}
              node={n}
              offerings={offerings}
              connectors={connectors}
              canEdit={canEdit}
              isConnectSource={connectorMode?.sourceId === n.id}
              connectorMode={!!connectorMode}
              onPointerDown={e => handleNodePointerDown(e, n)}
              onToggleEnd={() => toggleEndNode(n.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Node renderers ───────────────────────────────────────────────────────

/** Small badge shown when a node is marked as the end of the flow. */
function EndBadge() {
  return (
    <span className="absolute -top-2 -right-2 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 shadow-sm z-10">
      End
    </span>
  )
}

function NodeView({
  node,
  offerings,
  connectors,
  canEdit,
  isConnectSource,
  connectorMode,
  onPointerDown,
  onToggleEnd,
}: {
  node: JourneyNode
  offerings: Offering[]
  connectors: JourneyConnector[]
  canEdit: boolean
  isConnectSource: boolean
  connectorMode: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onToggleEnd: () => void
}) {
  const size = NODE_DEFAULTS[node.type]
  const common: React.CSSProperties = {
    left: node.x,
    top: node.y,
    width: size.width,
    minHeight: size.height,
    cursor: connectorMode ? 'crosshair' : 'grab',
    zIndex: 1,
  }
  const ringClass = isConnectSource ? `ring-2 ${COLORS[node.type].ring}` : ''
  const endBorder = node.isEnd ? 'border-rose-400' : ''

  if (node.type === 'start') {
    const c = COLORS.start
    return (
      <div
        onPointerDown={onPointerDown}
        className={`absolute rounded-full border-2 shadow-sm flex items-center justify-center select-none ${c.bg} ${c.border} ${ringClass}`}
        style={common}
      >
        <span className={`text-sm font-semibold ${c.text}`}>Start</span>
      </div>
    )
  }

  // Legacy end nodes — still renderable for old flows.
  if (node.type === 'end') {
    const c = COLORS.end
    return (
      <div
        onPointerDown={onPointerDown}
        className={`absolute rounded-full border-2 shadow-sm flex items-center justify-center select-none ${c.bg} ${c.border} ${ringClass}`}
        style={common}
      >
        <span className={`text-sm font-semibold ${c.text}`}>End</span>
      </div>
    )
  }

  // Legacy status nodes — still renderable for old flows.
  if (node.type === 'status') {
    const c = COLORS.status
    return (
      <div
        onPointerDown={onPointerDown}
        className={`absolute rounded-md border-2 shadow-sm flex items-center justify-center px-3 select-none ${c.bg} ${endBorder || c.border} ${ringClass}`}
        style={common}
      >
        {node.isEnd && <EndBadge />}
        <span className={`text-sm font-medium truncate ${c.text}`}>{node.label || 'Status'}</span>
        {canEdit && !connectorMode && (
          <button type="button" data-no-drag onClick={e => { e.stopPropagation(); onToggleEnd() }}
            className={`absolute -bottom-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full border shadow-sm z-10 ${node.isEnd ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-white text-gray-400 border-gray-200 hover:text-rose-500 hover:border-rose-300'}`}
            title={node.isEnd ? 'Remove as end point' : 'Mark as end point'}
          >{node.isEnd ? 'End ✓' : 'Set end'}</button>
        )}
      </div>
    )
  }

  if (node.type === 'decision') {
    return (
      <DecisionNodeView node={node} connectors={connectors} canEdit={canEdit}
        common={common} ringClass={ringClass} endBorder={endBorder}
        connectorMode={connectorMode} onPointerDown={onPointerDown} onToggleEnd={onToggleEnd} />
    )
  }

  // offering
  return (
    <OfferingNodeView node={node} offerings={offerings} canEdit={canEdit}
      common={common} ringClass={ringClass} endBorder={endBorder}
      connectorMode={connectorMode} onPointerDown={onPointerDown} onToggleEnd={onToggleEnd} />
  )
}

function DecisionNodeView({
  node,
  connectors,
  canEdit,
  common,
  ringClass,
  endBorder,
  connectorMode,
  onPointerDown,
  onToggleEnd,
}: {
  node: JourneyDecisionNode
  connectors: JourneyConnector[]
  canEdit: boolean
  common: React.CSSProperties
  ringClass: string
  endBorder: string
  connectorMode: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onToggleEnd: () => void
}) {
  const c = COLORS.decision
  // Outgoing connectors from this decision node.
  const outcomes = connectors.filter(cn => cn.fromNodeId === node.id)
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute rounded-md border-2 shadow-sm px-3 py-2 flex flex-col justify-center select-none ${c.bg} ${endBorder || c.border} ${ringClass}`}
      style={common}
    >
      {node.isEnd && <EndBadge />}
      <div className={`text-[9px] font-semibold uppercase tracking-wider ${c.text}`}>Decision</div>
      <div className="text-sm font-medium text-gray-900 truncate">{node.label || 'Untitled'}</div>
      {outcomes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5" data-no-drag>
          {outcomes.map(o => (
            <span key={o.id} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 truncate max-w-[90px]">
              {o.label || '...'}
            </span>
          ))}
        </div>
      )}
      {canEdit && !connectorMode && (
        <button type="button" data-no-drag onClick={e => { e.stopPropagation(); onToggleEnd() }}
          className={`absolute -bottom-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full border shadow-sm z-10 ${node.isEnd ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-white text-gray-400 border-gray-200 hover:text-rose-500 hover:border-rose-300'}`}
          title={node.isEnd ? 'Remove as end point' : 'Mark as end point'}
        >{node.isEnd ? 'End ✓' : 'Set end'}</button>
      )}
    </div>
  )
}

function OfferingNodeView({
  node,
  offerings,
  canEdit,
  common,
  ringClass,
  endBorder,
  connectorMode,
  onPointerDown,
  onToggleEnd,
}: {
  node: JourneyOfferingNode
  offerings: Offering[]
  canEdit: boolean
  common: React.CSSProperties
  ringClass: string
  endBorder: string
  connectorMode: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onToggleEnd: () => void
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
      className={`absolute rounded-md border-2 shadow-sm px-3 py-2 flex flex-col justify-center select-none ${c.bg} ${endBorder || c.border} ${ringClass}`}
      style={common}
    >
      {node.isEnd && <EndBadge />}
      <div className={`text-[9px] font-semibold uppercase tracking-wider ${c.text}`}>{kind}</div>
      <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
      {canEdit && !connectorMode && (
        <button type="button" data-no-drag onClick={e => { e.stopPropagation(); onToggleEnd() }}
          className={`absolute -bottom-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full border shadow-sm z-10 ${node.isEnd ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-white text-gray-400 border-gray-200 hover:text-rose-500 hover:border-rose-300'}`}
          title={node.isEnd ? 'Remove as end point' : 'Mark as end point'}
        >{node.isEnd ? 'End ✓' : 'Set end'}</button>
      )}
    </div>
  )
}
