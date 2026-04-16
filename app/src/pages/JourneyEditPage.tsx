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
  PORT_RADIUS,
  migrateContent,
  createOfferingNode,
  createDecisionNode,
  createStatusNode,
  createConnector,
  nodeSize,
  snapToGrid,
  connectorPath,
  autoLayout,
  computeDepths,
  inputPortPos,
  outputPortPos,
  decisionOutputPorts,
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

export default function JourneyEditPage() {
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
  // Inline label edit state for connectors.
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState('')
  // Inline label edit state for node labels (decision nodes).
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingNodeLabel, setEditingNodeLabel] = useState('')
  const [layoutMode, setLayoutMode] = useState<FlowLayoutMode>('freeform')

  // Drag-to-connect: when the user drags from an output port, we track
  // the source node id and the current mouse position for the temp wire.
  const [drawingWire, setDrawingWire] = useState<{
    sourceNodeId: string
    mouseX: number
    mouseY: number
    portX: number   // origin port position
    portY: number
  } | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

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

  // ── Wire-drawing mouse tracking ───────────────────────────────────────
  useEffect(() => {
    if (!drawingWire) return
    function handleWireMove(e: PointerEvent) {
      const ws = workspaceRef.current
      if (!ws) return
      const rect = ws.getBoundingClientRect()
      setDrawingWire(prev => prev ? {
        ...prev,
        mouseX: e.clientX - rect.left + ws.scrollLeft,
        mouseY: e.clientY - rect.top + ws.scrollTop,
      } : null)
    }
    function handleWireUp(e: PointerEvent) {
      // Check if we landed on a node's input port area (top half of node)
      const ws = workspaceRef.current
      if (!ws) { setDrawingWire(null); return }
      const rect = ws.getBoundingClientRect()
      const mx = e.clientX - rect.left + ws.scrollLeft
      const my = e.clientY - rect.top + ws.scrollTop
      // Find the nearest node whose input port is within range
      const HIT_RADIUS = 24
      let bestNode: string | null = null
      let bestDist = HIT_RADIUS
      for (const n of nodesRef.current) {
        const ip = inputPortPos(n)
        const dx = mx - ip.x
        const dy = my - ip.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < bestDist) {
          bestDist = dist
          bestNode = n.id
        }
      }
      if (bestNode) {
        handlePortDragEnd(bestNode)
      } else {
        setDrawingWire(null)
      }
    }
    document.addEventListener('pointermove', handleWireMove)
    document.addEventListener('pointerup', handleWireUp)
    return () => {
      document.removeEventListener('pointermove', handleWireMove)
      document.removeEventListener('pointerup', handleWireUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingWire])

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

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
    setDrawingWire(null)
    setDirty(true)
  }

  // ── Port-based drag-to-connect ──────────────────────────────────────
  function handlePortDragStart(nodeId: string, portX: number, portY: number, e: React.PointerEvent) {
    if (!canEdit) return
    e.stopPropagation()
    e.preventDefault()
    setDrawingWire({ sourceNodeId: nodeId, mouseX: portX, mouseY: portY, portX, portY })
  }

  function handlePortDragEnd(targetNodeId: string) {
    if (!drawingWire) return
    const srcId = drawingWire.sourceNodeId
    // Can't connect to self
    if (srcId === targetNodeId) { setDrawingWire(null); return }
    // Start node can't be a target
    const target = nodes.find(n => n.id === targetNodeId)
    if (target?.type === 'start') { setDrawingWire(null); return }
    // Dedup
    const alreadyExists = connectors.some(
      c => c.fromNodeId === srcId && c.toNodeId === targetNodeId,
    )
    if (!alreadyExists) {
      pushHistory()
      const newConn = createConnector(srcId, targetNodeId)
      const nextConnectors = [...connectors, newConn]
      setConnectors(nextConnectors)
      setDirty(true)
      relayoutIfAuto(nodes, nextConnectors)
    }
    setDrawingWire(null)
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

  function deleteNode(nodeId: string) {
    if (!canEdit) return
    const node = nodes.find(n => n.id === nodeId)
    if (!node || node.type === 'start') return // never delete start
    pushHistory()
    const nextNodes = nodes.filter(n => n.id !== nodeId)
    const nextConnectors = connectors.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId)
    setNodes(nextNodes)
    setConnectors(nextConnectors)
    setDirty(true)
    relayoutIfAuto(nextNodes, nextConnectors)
  }

  function beginEditLabel(connector: JourneyConnector) {
    if (!canEdit) return
    if (drawingWire) return
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

  function beginEditNodeLabel(node: JourneyNode) {
    if (!canEdit) return
    if (node.type !== 'decision' && node.type !== 'status') return
    setEditingNodeId(node.id)
    setEditingNodeLabel('label' in node ? (node as { label: string }).label : '')
  }

  function saveNodeLabel(nodeId: string) {
    const trimmed = editingNodeLabel.trim()
    const existing = nodes.find(n => n.id === nodeId)
    if (existing && 'label' in existing && (existing as { label: string }).label !== trimmed) {
      pushHistory()
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, label: trimmed } : n))
      setDirty(true)
    }
    setEditingNodeId(null)
    setEditingNodeLabel('')
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
        if (drawingWire) {
          setDrawingWire(null)
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
  }, [drawingWire, editingConnectorId, past, nodes, connectors, dirty, saving])

  // ── Node actions ───────────────────────────────────────────────────────
  function handleNodePointerDown(e: React.PointerEvent, node: JourneyNode) {
    if (!canEdit) return
    const target = e.target as HTMLElement
    if (target.closest('button, [data-no-drag], [data-port]')) return
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

  function addStatusNode() {
    pushHistory()
    const { x, y } = spawnPosition('status')
    const newNode = createStatusNode(x, y, 'Status')
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
    toast.success(nextArchivedAt ? 'Journey archived' : 'Journey unarchived')
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
    toast.success('Journey deleted')
    navigate('/journeys')
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
    return <LoadingErrorState message={error ?? 'Journey not found'} onRetry={() => fetchRef.current()} />
  }

  return (
    <div className="max-w-6xl flex flex-col" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/journeys')}
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
          <Button variant="secondary" onClick={addStatusNode}>+ Status</Button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <Button
            variant="secondary"
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Cmd+Z)"
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

      {drawingWire && (
        <div className="mb-2 text-xs text-brand bg-brand/5 border border-brand/20 rounded px-3 py-1.5">
          Drag to a node's input port (top circle) to connect. Release elsewhere or press Esc to cancel.
        </div>
      )}

      {/* Workspace */}
      <div
        ref={workspaceRef}
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
          }}
        >
          {/* SVG layer for connectors + drawing wire */}
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
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
              <marker
                id="journey-arrow-drawing"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
              </marker>
            </defs>

            {/* Existing connectors: port-to-port */}
            {connectors.map(c => {
              const from = nodes.find(n => n.id === c.fromNodeId)
              const to = nodes.find(n => n.id === c.toNodeId)
              if (!from || !to) return null
              let srcPort: { x: number; y: number }
              if (from.type === 'decision') {
                const outgoing = connectors.filter(cn => cn.fromNodeId === from.id)
                const idx = outgoing.indexOf(c)
                const ports = decisionOutputPorts(from, outgoing.length)
                srcPort = ports[idx] ?? outputPortPos(from)
              } else {
                srcPort = outputPortPos(from)
              }
              const tgtPort = inputPortPos(to)
              const d = connectorPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y)
              return (
                <g key={c.id}>
                  <path d={d} stroke="#94a3b8" strokeWidth={2} fill="none" markerEnd="url(#journey-arrow)" />
                  {canEdit && (
                    <path
                      d={d} stroke="transparent" strokeWidth={14} fill="none"
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); deleteConnector(c.id) }}
                    >
                      <title>Click to delete connector</title>
                    </path>
                  )}
                </g>
              )
            })}

            {/* Drawing wire (temp line while dragging from port) */}
            {drawingWire && (
              <path
                d={connectorPath(drawingWire.portX, drawingWire.portY, drawingWire.mouseX, drawingWire.mouseY)}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="none"
                markerEnd="url(#journey-arrow-drawing)"
              />
            )}
          </svg>

          {/* Connector labels (HTML layer) */}
          {connectors.map(c => {
            const from = nodes.find(n => n.id === c.fromNodeId)
            const to = nodes.find(n => n.id === c.toNodeId)
            if (!from || !to) return null
            let srcPort: { x: number; y: number }
            if (from.type === 'decision') {
              const outgoing = connectors.filter(cn => cn.fromNodeId === from.id)
              const idx = outgoing.indexOf(c)
              const ports = decisionOutputPorts(from, outgoing.length)
              srcPort = ports[idx] ?? outputPortPos(from)
            } else {
              srcPort = outputPortPos(from)
            }
            const tgtPort = inputPortPos(to)
            const mx = (srcPort.x + tgtPort.x) / 2
            const my = (srcPort.y + tgtPort.y) / 2

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
                    if (e.key === 'Escape') { e.preventDefault(); setEditingConnectorId(null); setEditingLabelValue('') }
                  }}
                  placeholder="label"
                  className="absolute text-xs px-1.5 py-0.5 bg-white border border-brand rounded shadow-sm outline-none"
                  style={{ left: mx, top: my, transform: 'translate(-50%, -50%)', zIndex: 5, width: 140 }}
                />
              )
            }
            return (
              <div
                key={c.id}
                className="absolute flex items-center gap-1"
                style={{ left: mx, top: my, transform: 'translate(-50%, -50%)', zIndex: 5 }}
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

          {/* Nodes with ports */}
          {nodes.map(n => {
            const size = NODE_DEFAULTS[n.type]
            const c = COLORS[n.type]
            const endBorder = n.isEnd ? 'border-rose-400' : ''
            const hasInput = n.type !== 'start'
            const isDecisionType = n.type === 'decision'
            const outgoing = connectors.filter(cn => cn.fromNodeId === n.id)
            const outPortCount = isDecisionType ? outgoing.length + 1 : 1
            const outPorts = isDecisionType
              ? decisionOutputPorts(n, outPortCount)
              : [outputPortPos(n)]

            let label: string
            let sublabel: string | null = null
            if (n.type === 'start') { label = 'Start' }
            else if (n.type === 'end') { label = 'End' }
            else if (n.type === 'status') { label = (n as unknown as { label: string }).label || 'Status'; sublabel = 'STATUS' }
            else if (n.type === 'decision') { label = (n as JourneyDecisionNode).label || 'Untitled'; sublabel = 'DECISION' }
            else {
              const off = offerings.find(o => o.id === (n as JourneyOfferingNode).offeringId)
              label = off?.name ?? '(offering not found)'
              sublabel = off?.type === 'course' ? 'COURSE' : off?.type === 'engagement' ? 'ENGAGEMENT' : 'OFFERING'
            }

            const isRound = n.type === 'start' || n.type === 'end'

            return (
              <div key={n.id}>
                {/* The node body */}
                <div
                  onPointerDown={e => handleNodePointerDown(e, n)}
                  className={`absolute ${isRound ? 'rounded-full' : 'rounded-lg'} border-2 shadow-sm select-none group ${c.bg} ${endBorder || c.border}`}
                  style={{
                    left: n.x,
                    top: n.y,
                    width: size.width,
                    minHeight: size.height,
                    cursor: 'grab',
                    zIndex: 1,
                  }}
                >
                  {n.isEnd && !isRound && (
                    <span className="absolute -top-2 -right-2 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 shadow-sm z-10">
                      End
                    </span>
                  )}

                  {canEdit && n.type !== 'start' && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={e => { e.stopPropagation(); deleteNode(n.id) }}
                      className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-400 hover:bg-rose-50 hover:border-rose-400 hover:text-rose-600 flex items-center justify-center text-xs shadow-sm z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete node"
                    >
                      &times;
                    </button>
                  )}

                  {canEdit && !isRound && (
                    <button type="button" data-no-drag onClick={e => { e.stopPropagation(); toggleEndNode(n.id) }}
                      className={`absolute -bottom-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full border shadow-sm z-10 opacity-0 group-hover:opacity-100 transition-opacity ${n.isEnd ? 'bg-rose-100 text-rose-600 border-rose-200 !opacity-100' : 'bg-white text-gray-400 border-gray-200 hover:text-rose-500 hover:border-rose-300'}`}
                      title={n.isEnd ? 'Remove as end point' : 'Mark as end point'}
                    >{n.isEnd ? 'End \u2713' : 'Set end'}</button>
                  )}

                  <div className={`flex flex-col justify-center ${isRound ? 'items-center text-center' : 'items-start'} h-full px-3 py-2`}>
                    {sublabel && (
                      <div className={`text-[9px] font-semibold uppercase tracking-wider ${c.text}`}>{sublabel}</div>
                    )}
                    {(isDecisionType || n.type === 'status') && editingNodeId === n.id ? (
                      <input
                        autoFocus
                        data-no-drag
                        value={editingNodeLabel}
                        onChange={e => setEditingNodeLabel(e.target.value)}
                        onBlur={() => saveNodeLabel(n.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveNodeLabel(n.id) }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingNodeId(null); setEditingNodeLabel('') }
                        }}
                        placeholder={isDecisionType ? 'Decision label...' : 'Status label...'}
                        className={`text-sm font-medium text-gray-900 bg-transparent border-b outline-none w-full ${isDecisionType ? 'border-amber-400' : 'border-gray-400'}`}
                      />
                    ) : (isDecisionType || n.type === 'status') ? (
                      <div
                        data-no-drag
                        onClick={e => { e.stopPropagation(); beginEditNodeLabel(n) }}
                        className="text-sm font-medium text-gray-900 truncate max-w-full cursor-text hover:underline decoration-dotted"
                        title="Click to edit"
                      >
                        {label}
                      </div>
                    ) : (
                      <div className={`text-sm ${isRound ? 'font-semibold' : 'font-medium'} ${isRound ? c.text : 'text-gray-900'} truncate max-w-full`}>
                        {label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Input port (top center) */}
                {hasInput && (() => {
                  const ip = inputPortPos(n)
                  return (
                    <div
                      data-port="input"
                      className={`absolute rounded-full border-2 border-gray-400 bg-white hover:border-brand hover:bg-brand/10 transition-colors ${drawingWire ? 'scale-125 border-brand' : ''}`}
                      style={{
                        left: ip.x - PORT_RADIUS,
                        top: ip.y - PORT_RADIUS,
                        width: PORT_RADIUS * 2,
                        height: PORT_RADIUS * 2,
                        zIndex: 3,
                        cursor: 'default',
                      }}
                    />
                  )
                })()}

                {/* Output ports (bottom) */}
                {outPorts.map((op, idx) => (
                  <div
                    key={idx}
                    data-port="output"
                    onPointerDown={e => handlePortDragStart(n.id, op.x, op.y, e)}
                    className={`absolute rounded-full border-2 bg-white hover:bg-brand/10 hover:border-brand transition-colors ${
                      isDecisionType && idx === outPorts.length - 1 && outgoing.length > 0
                        ? 'border-dashed border-gray-300 hover:border-brand'
                        : 'border-gray-400'
                    }`}
                    style={{
                      left: op.x - PORT_RADIUS,
                      top: op.y - PORT_RADIUS,
                      width: PORT_RADIUS * 2,
                      height: PORT_RADIUS * 2,
                      zIndex: 3,
                      cursor: canEdit ? 'crosshair' : 'default',
                    }}
                    title={canEdit ? 'Drag to connect' : undefined}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
