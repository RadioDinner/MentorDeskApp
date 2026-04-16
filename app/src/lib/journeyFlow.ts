import type {
  JourneyNode,
  JourneyStartNode,
  JourneyOfferingNode,
  JourneyDecisionNode,
  JourneyStatusNode,
  JourneyEndNode,
  JourneyConnector,
  JourneyContent,
} from '../types'

// ── ID generation ───────────────────────────────────────────────────────

/** Non-crypto id generator. Good enough for client-side node / connector ids. */
export function clientId(prefix = 'jn'): string {
  const t = Date.now().toString(16)
  const r = Math.random().toString(16).slice(2, 10)
  return `${prefix}_${t}_${r}`
}

// ── Constants ───────────────────────────────────────────────────────────

export const WORKSPACE_SIZE = { width: 2400, height: 1800 } as const
export const GRID_SIZE = 48
export const HISTORY_LIMIT = 50

export type NodeType = JourneyNode['type']

/**
 * Render size per node type. Journey nodes are NOT user-resizable — each
 * type renders at a fixed size, so lib exposes the size constants and the
 * FlowEditPage render layer reads them.
 */
export const NODE_DEFAULTS: Record<NodeType, { width: number; height: number }> = {
  start:    { width: 140, height: 56 },
  offering: { width: 220, height: 88 },
  decision: { width: 200, height: 72 },
  status:   { width: 180, height: 56 },
  end:      { width: 140, height: 56 },
}

/**
 * Tailwind classes per node type for the FlowEditPage render layer and
 * the add-node toolbar. Keeping them here (not in the editor) so Block 7
 * rendering and Block 9 toolbar share one source of truth.
 */
export const COLORS: Record<NodeType, { bg: string; border: string; ring: string; text: string }> = {
  start:    { bg: 'bg-green-50',  border: 'border-green-300',  ring: 'ring-green-400',  text: 'text-green-700' },
  offering: { bg: 'bg-violet-50', border: 'border-violet-300', ring: 'ring-violet-400', text: 'text-violet-700' },
  decision: { bg: 'bg-amber-50',  border: 'border-amber-300',  ring: 'ring-amber-400',  text: 'text-amber-700' },
  status:   { bg: 'bg-gray-50',   border: 'border-gray-300',   ring: 'ring-gray-400',   text: 'text-gray-700' },
  end:      { bg: 'bg-rose-50',   border: 'border-rose-300',   ring: 'ring-rose-400',   text: 'text-rose-700' },
}

// ── Factories ───────────────────────────────────────────────────────────

function baseAt(x: number, y: number) {
  return { id: clientId('node'), x, y }
}

export function createStartNode(x: number, y: number): JourneyStartNode {
  return { ...baseAt(x, y), type: 'start' }
}

export function createOfferingNode(x: number, y: number, offeringId: string): JourneyOfferingNode {
  return { ...baseAt(x, y), type: 'offering', offeringId }
}

export function createDecisionNode(x: number, y: number, label = ''): JourneyDecisionNode {
  return { ...baseAt(x, y), type: 'decision', label }
}

export function createStatusNode(x: number, y: number, label = ''): JourneyStatusNode {
  return { ...baseAt(x, y), type: 'status', label }
}

export function createEndNode(x: number, y: number): JourneyEndNode {
  return { ...baseAt(x, y), type: 'end' }
}

export function createConnector(fromNodeId: string, toNodeId: string, label = ''): JourneyConnector {
  return { id: clientId('con'), fromNodeId, toNodeId, label }
}

// ── Migration of loaded jsonb ───────────────────────────────────────────

function migrateNode(raw: unknown): JourneyNode | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  const x = typeof o.x === 'number' ? o.x : 0
  const y = typeof o.y === 'number' ? o.y : 0
  const type = o.type as string
  switch (type) {
    case 'start':
      return { id: o.id, x, y, type: 'start' }
    case 'offering':
      if (typeof o.offeringId !== 'string') return null
      return { id: o.id, x, y, type: 'offering', offeringId: o.offeringId }
    case 'decision':
      return { id: o.id, x, y, type: 'decision', label: typeof o.label === 'string' ? o.label : '' }
    case 'status':
      return { id: o.id, x, y, type: 'status', label: typeof o.label === 'string' ? o.label : '' }
    case 'end':
      return { id: o.id, x, y, type: 'end' }
    default:
      return null
  }
}

function migrateConnector(raw: unknown): JourneyConnector | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.fromNodeId !== 'string' || typeof o.toNodeId !== 'string') return null
  return {
    id: o.id,
    fromNodeId: o.fromNodeId,
    toNodeId: o.toNodeId,
    label: typeof o.label === 'string' ? o.label : '',
  }
}

/**
 * Normalize a raw jsonb blob loaded from the DB into a JourneyContent.
 * Silently drops rows that fail validation, so a malformed blob does not
 * brick the editor.
 */
export function migrateContent(raw: unknown): JourneyContent {
  if (!raw || typeof raw !== 'object') return { nodes: [], connectors: [] }
  const o = raw as Record<string, unknown>
  const nodes = Array.isArray(o.nodes)
    ? (o.nodes as unknown[]).map(migrateNode).filter(Boolean) as JourneyNode[]
    : []
  const connectors = Array.isArray(o.connectors)
    ? (o.connectors as unknown[]).map(migrateConnector).filter(Boolean) as JourneyConnector[]
    : []
  return { nodes, connectors }
}

/** Width/height for a given node type. Used by render + drag-clamp layers. */
export function nodeSize(type: NodeType): { width: number; height: number } {
  return NODE_DEFAULTS[type]
}

/** Snap a value to the nearest grid line. */
export function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE
}

/**
 * Compute an SVG cubic bezier path string between two node centers.
 * The curve bows vertically — the control point offset scales with
 * the vertical distance between nodes so the arc looks natural for
 * both short and long connections. When nodes are roughly horizontal,
 * the curve pushes downward slightly to avoid a flat line.
 */
export function connectorPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  // The control-point offset is proportional to the distance, clamped
  // so very short connections don't get wild curves and very long ones
  // don't overshoot.
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = Math.min(Math.max(Math.abs(dy) * 0.5, 40), dist * 0.4)
  // When the target is below the source, push control points downward
  // for a smooth downward arc. When above, flip.
  const cpY = dy >= 0 ? offset : -offset
  const cp1x = x1 + dx * 0.25
  const cp1y = y1 + cpY
  const cp2x = x1 + dx * 0.75
  const cp2y = y2 - cpY
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
}
