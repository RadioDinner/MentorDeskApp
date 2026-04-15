import type {
  CanvasNote,
  CanvasStickyNote,
  CanvasChecklistNote,
  CanvasChecklistItem,
  CanvasLinkNote,
  CanvasConnector,
  CanvasContent,
  CanvasNoteColor,
  CanvasLinkType,
} from '../types'

// ── ID generation ───────────────────────────────────────────────────────

/** Non-crypto id generator. Good enough for client-side note / connector ids. */
export function clientId(prefix = 'n'): string {
  const t = Date.now().toString(16)
  const r = Math.random().toString(16).slice(2, 10)
  return `${prefix}_${t}_${r}`
}

// ── Constants ───────────────────────────────────────────────────────────

export const NOTE_DEFAULTS = { width: 220, height: 180 } as const
export const NOTE_MIN = { width: 140, height: 100 } as const
export const WORKSPACE_SIZE = { width: 2400, height: 1800 } as const
export const HISTORY_LIMIT = 50

export const COLORS: { key: CanvasNoteColor; bg: string; border: string; ring: string }[] = [
  { key: 'yellow', bg: 'bg-yellow-100', border: 'border-yellow-300', ring: 'ring-yellow-400' },
  { key: 'pink',   bg: 'bg-pink-100',   border: 'border-pink-300',   ring: 'ring-pink-400' },
  { key: 'blue',   bg: 'bg-blue-100',   border: 'border-blue-300',   ring: 'ring-blue-400' },
  { key: 'green',  bg: 'bg-green-100',  border: 'border-green-300',  ring: 'ring-green-400' },
  { key: 'purple', bg: 'bg-purple-100', border: 'border-purple-300', ring: 'ring-purple-400' },
  { key: 'orange', bg: 'bg-orange-100', border: 'border-orange-300', ring: 'ring-orange-400' },
]

export function colorClasses(c: CanvasNoteColor) {
  return COLORS.find(x => x.key === c) ?? COLORS[0]
}

// ── Factories ───────────────────────────────────────────────────────────

function baseAt(x: number, y: number, color: CanvasNoteColor, z: number) {
  return {
    id: clientId('note'),
    x, y,
    width: NOTE_DEFAULTS.width,
    height: NOTE_DEFAULTS.height,
    color,
    z,
  }
}

export function createStickyNote(x: number, y: number, color: CanvasNoteColor, z: number): CanvasStickyNote {
  return { ...baseAt(x, y, color, z), type: 'sticky', text: '' }
}

export function createChecklistNote(x: number, y: number, color: CanvasNoteColor, z: number): CanvasChecklistNote {
  return {
    ...baseAt(x, y, color, z),
    type: 'checklist',
    title: 'Checklist',
    items: [createChecklistItem('')],
  }
}

export function createLinkNote(x: number, y: number, color: CanvasNoteColor, z: number): CanvasLinkNote {
  return {
    ...baseAt(x, y, color, z),
    type: 'link',
    label: '',
    linkType: 'url',
    linkId: null,
    linkUrl: null,
  }
}

export function createChecklistItem(text: string): CanvasChecklistItem {
  return { id: clientId('item'), text, done: false }
}

export function createConnector(fromNoteId: string, toNoteId: string, label = ''): CanvasConnector {
  return { id: clientId('con'), fromNoteId, toNoteId, label }
}

// ── Migration of legacy shapes ──────────────────────────────────────────

/**
 * Legacy notes (pre-refactor) stored { id, x, y, width, height, text, color, z }
 * with no `type` discriminator. Treat them as sticky notes.
 */
function migrateNote(raw: unknown): CanvasNote | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  const base = {
    id: o.id,
    x: typeof o.x === 'number' ? o.x : 0,
    y: typeof o.y === 'number' ? o.y : 0,
    width: typeof o.width === 'number' ? o.width : NOTE_DEFAULTS.width,
    height: typeof o.height === 'number' ? o.height : NOTE_DEFAULTS.height,
    color: (o.color as CanvasNoteColor) ?? 'yellow',
    z: typeof o.z === 'number' ? o.z : 0,
  }
  const type = (o.type as string) ?? 'sticky'
  if (type === 'checklist') {
    return {
      ...base,
      type: 'checklist',
      title: typeof o.title === 'string' ? o.title : 'Checklist',
      items: Array.isArray(o.items)
        ? (o.items as unknown[]).map(migrateChecklistItem).filter(Boolean) as CanvasChecklistItem[]
        : [],
    }
  }
  if (type === 'link') {
    return {
      ...base,
      type: 'link',
      label: typeof o.label === 'string' ? o.label : '',
      linkType: (o.linkType as CanvasLinkType) ?? 'url',
      linkId: typeof o.linkId === 'string' ? o.linkId : null,
      linkUrl: typeof o.linkUrl === 'string' ? o.linkUrl : null,
    }
  }
  // default: sticky
  return {
    ...base,
    type: 'sticky',
    text: typeof o.text === 'string' ? o.text : '',
  }
}

function migrateChecklistItem(raw: unknown): CanvasChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  return {
    id: o.id,
    text: typeof o.text === 'string' ? o.text : '',
    done: o.done === true,
  }
}

function migrateConnector(raw: unknown): CanvasConnector | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.fromNoteId !== 'string' || typeof o.toNoteId !== 'string') return null
  return { id: o.id, fromNoteId: o.fromNoteId, toNoteId: o.toNoteId, label: typeof o.label === 'string' ? o.label : '' }
}

export function migrateContent(raw: unknown): CanvasContent {
  if (!raw || typeof raw !== 'object') return { notes: [], connectors: [] }
  const o = raw as Record<string, unknown>
  const notes = Array.isArray(o.notes)
    ? (o.notes as unknown[]).map(migrateNote).filter(Boolean) as CanvasNote[]
    : []
  const connectors = Array.isArray(o.connectors)
    ? (o.connectors as unknown[]).map(migrateConnector).filter(Boolean) as CanvasConnector[]
    : []
  return { notes, connectors }
}

// ── Tiny markdown renderer ──────────────────────────────────────────────
//
// Supports three things only:
//   **bold**
//   *italic*
//   lines starting with "- " or "* " become bullets
//
// Input is HTML-escaped BEFORE any replacement, so the output is safe to
// inject via dangerouslySetInnerHTML even for untrusted user text.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function processInline(line: string): string {
  // bold first, then italic, so `**foo**` doesn't become `<em><em>foo</em></em>`
  return line
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  const escaped = escapeHtml(text)
  const lines = escaped.split('\n')
  let html = ''
  let inList = false
  for (const raw of lines) {
    const line = raw
    const bulletMatch = /^(?:-|\*) (.*)$/.exec(line)
    if (bulletMatch) {
      if (!inList) { html += '<ul class="list-disc pl-4">'; inList = true }
      html += `<li>${processInline(bulletMatch[1])}</li>`
      continue
    }
    if (inList) { html += '</ul>'; inList = false }
    if (line.trim() === '') {
      html += '<div class="h-2"></div>'
    } else {
      html += `<div>${processInline(line)}</div>`
    }
  }
  if (inList) html += '</ul>'
  return html
}
