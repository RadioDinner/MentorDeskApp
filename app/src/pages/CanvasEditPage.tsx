import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestCall, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import LoadingErrorState from '../components/LoadingErrorState'
import { formatDateTime } from '../lib/format'
import {
  migrateContent,
  COLORS,
  colorClasses,
  createStickyNote,
  createChecklistNote,
  createChecklistItem,
  createLinkNote,
  createConnector,
  renderMarkdown,
  WORKSPACE_SIZE,
  NOTE_MIN,
  HISTORY_LIMIT,
} from '../lib/canvas'
import type {
  Canvas,
  CanvasConnector,
  CanvasNote,
  CanvasStickyNote,
  CanvasChecklistNote,
  CanvasLinkNote,
  CanvasLinkType,
  CanvasNoteColor,
} from '../types'

type HistorySnapshot = { notes: CanvasNote[]; connectors: CanvasConnector[] }
type LinkOption = { id: string; label: string }
type LinkOptionsCache = {
  course?: LinkOption[]
  habit?: LinkOption[]
  canvas?: LinkOption[]
}

// ── Component ─────────────────────────────────────────────────────────

export default function CanvasEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, menteeProfile, isMenteeMode } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [canvas, setCanvas] = useState<Canvas | null>(null)
  const [notes, setNotes] = useState<CanvasNote[]>([])
  const [connectors, setConnectors] = useState<CanvasConnector[]>([])
  const [past, setPast] = useState<HistorySnapshot[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Connector mode — null means not in connect-mode. sourceId is the first
  // note the user clicked after pressing the "Connect" toolbar button.
  const [connectorMode, setConnectorMode] = useState<{ sourceId: string | null } | null>(null)
  // Lazy cache of picker option lists for link notes. Loaded on first open.
  const [linkOptions, setLinkOptions] = useState<LinkOptionsCache>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [lastEditorLabel, setLastEditorLabel] = useState<string>('')

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    // The note the pointer went down on — used for narrow-on-click.
    clickedNoteId: string
    startX: number
    startY: number
    // Pre-drag positions for EVERY note being moved (one entry per note
    // in the current multi-selection). Moving many notes at once applies
    // the same dx/dy to each entry here.
    noteStartPositions: Record<string, { x: number; y: number }>
    // Snapshot of pre-drag state, pushed onto the undo stack only if the
    // user actually moves the pointer (so a plain click doesn't consume
    // an undo slot).
    prevNotes: CanvasNote[]
    prevConnectors: CanvasConnector[]
    historyPushed: boolean
  } | null>(null)
  const resizeStateRef = useRef<{
    noteId: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    prevNotes: CanvasNote[]
    prevConnectors: CanvasConnector[]
    historyPushed: boolean
  } | null>(null)
  // Ref to the currently-focused sticky-note textarea (if any). Used by
  // the markdown toolbar to wrap the active selection in bold / italic
  // / bullet markers.
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Latest-ref for the keyboard shortcut handler. The document-level
  // listener is installed once and always calls through this ref, so
  // every key press sees the most recent closure over component state
  // without needing a dep array on the effect.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  const backRoute = isMenteeMode ? '/my-canvases' : '/canvases'

  // Load canvas + last editor name
  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('canvases')
          .select('*')
          .eq('id', id!)
          .single()
        if (err) { setError(err.message); return }
        const c = data as Canvas
        // Normalize content through migrateContent so legacy rows (pre-
        // Session 019 note-type union) get sticky notes upgraded in memory.
        const normalized = migrateContent(c.content)
        const cNormalized: Canvas = { ...c, content: normalized }
        setCanvas(cNormalized)
        setNotes(normalized.notes)
        setConnectors(normalized.connectors)
        setPast([])
        setSelectedIds(new Set())
        setConnectorMode(null)
        setLinkOptions({})
        setDirty(false)

        // Look up last editor name (best effort)
        if (c.updated_by_uid) {
          const [staffRes, menteeRes] = await Promise.all([
            supabaseRestGet<{ first_name: string; last_name: string }>(
              'staff',
              `select=first_name,last_name&user_id=eq.${c.updated_by_uid}&limit=1`,
              { label: 'canvas:editor:staff' },
            ),
            supabaseRestGet<{ first_name: string; last_name: string }>(
              'mentees',
              `select=first_name,last_name&user_id=eq.${c.updated_by_uid}&limit=1`,
              { label: 'canvas:editor:mentee' },
            ),
          ])
          const who = staffRes.data?.[0] ?? menteeRes.data?.[0]
          if (who) setLastEditorLabel(`${who.first_name} ${who.last_name}`)
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchRef.current = load
    load()
  }, [id])

  // Warn on page unload if there are unsaved changes
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Drag + resize listeners (attached to document while either gesture
  // is in progress). Both gestures use the same lazy-history pattern:
  // the pre-gesture snapshot is pushed onto the undo stack only on the
  // first real pointermove, so a plain pointerdown with no movement
  // does not consume an undo slot.
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragStateRef.current
      if (drag) {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        if (dx === 0 && dy === 0) return
        if (!drag.historyPushed) {
          setPast(prev => {
            const next = [...prev, { notes: drag.prevNotes, connectors: drag.prevConnectors }]
            if (next.length > HISTORY_LIMIT) next.shift()
            return next
          })
          drag.historyPushed = true
        }
        setNotes(prev => prev.map(n => {
          const start = drag.noteStartPositions[n.id]
          if (!start) return n
          return {
            ...n,
            x: Math.max(0, Math.min(WORKSPACE_SIZE.width - n.width, start.x + dx)),
            y: Math.max(0, Math.min(WORKSPACE_SIZE.height - n.height, start.y + dy)),
          }
        }))
        return
      }
      const rs = resizeStateRef.current
      if (rs) {
        const dx = e.clientX - rs.startX
        const dy = e.clientY - rs.startY
        if (dx === 0 && dy === 0) return
        if (!rs.historyPushed) {
          setPast(prev => {
            const next = [...prev, { notes: rs.prevNotes, connectors: rs.prevConnectors }]
            if (next.length > HISTORY_LIMIT) next.shift()
            return next
          })
          rs.historyPushed = true
        }
        setNotes(prev => prev.map(n => {
          if (n.id !== rs.noteId) return n
          const maxW = WORKSPACE_SIZE.width - n.x
          const maxH = WORKSPACE_SIZE.height - n.y
          return {
            ...n,
            width: Math.max(NOTE_MIN.width, Math.min(maxW, rs.startWidth + dx)),
            height: Math.max(NOTE_MIN.height, Math.min(maxH, rs.startHeight + dy)),
          }
        }))
      }
    }
    function handleUp() {
      if (dragStateRef.current) {
        const ds = dragStateRef.current
        dragStateRef.current = null
        if (ds.historyPushed) {
          // Real drag occurred — persist the new positions.
          setDirty(true)
        } else {
          // No movement: this was a click on a note. Narrow the selection
          // to just the clicked note. (If the clicked note was already
          // the sole selection, this is a no-op.)
          setSelectedIds(new Set([ds.clickedNoteId]))
        }
      }
      if (resizeStateRef.current) {
        resizeStateRef.current = null
        setDirty(true)
      }
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [])

  // Keyboard shortcuts — installed once, dispatches through keyHandlerRef.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  // ── Permission check ────────────────────────────────────────────────
  const actorUserId = profile?.user_id ?? menteeProfile?.user_id ?? null
  const canEdit = (() => {
    if (!canvas) return false
    if (isMenteeMode) {
      return menteeProfile?.id === canvas.mentee_id
    }
    if (!profile) return false
    if (profile.role === 'admin' || profile.role === 'operations') return true
    return profile.id === canvas.mentor_id
  })()

  // ── History ─────────────────────────────────────────────────────────
  //
  // Snapshot the current { notes, connectors } onto the undo stack BEFORE
  // any coarse action (add, delete, drag start, color change, starting a
  // text edit, etc.). We deliberately do NOT snapshot on every keystroke
  // inside a text editor — the "start editing" event already saved the
  // pre-edit state, so undo walks back to there in one step.

  function pushHistory() {
    setPast(prev => {
      const next = [...prev, { notes, connectors }]
      if (next.length > HISTORY_LIMIT) next.shift()
      return next
    })
  }

  function undo() {
    if (past.length === 0) return
    const snapshot = past[past.length - 1]
    setPast(prev => prev.slice(0, -1))
    setNotes(snapshot.notes)
    setConnectors(snapshot.connectors)
    // Close any in-progress edit so the restored text sticks.
    setEditingNoteId(null)
    setDirty(true)
  }

  // ── Mutations (local state only) ────────────────────────────────────

  function addNote() {
    if (!canEdit) return
    pushHistory()
    const topZ = notes.reduce((m, n) => Math.max(m, n.z), 0)
    // Place near top-left of the current viewport
    const scrollLeft = workspaceRef.current?.scrollLeft ?? 0
    const scrollTop = workspaceRef.current?.scrollTop ?? 0
    const newNote = createStickyNote(
      scrollLeft + 40 + (notes.length % 5) * 20,
      scrollTop + 40 + (notes.length % 5) * 20,
      COLORS[notes.length % COLORS.length].key,
      topZ + 1,
    )
    setNotes(prev => [...prev, newNote])
    setEditingNoteId(newNote.id)
    setDirty(true)
  }

  function deleteNote(noteId: string) {
    if (!canEdit) return
    pushHistory()
    setNotes(prev => prev.filter(n => n.id !== noteId))
    if (editingNoteId === noteId) setEditingNoteId(null)
    setSelectedIds(prev => {
      if (!prev.has(noteId)) return prev
      const next = new Set(prev)
      next.delete(noteId)
      return next
    })
    setDirty(true)
  }

  function deleteSelected() {
    if (!canEdit || selectedIds.size === 0) return
    pushHistory()
    const ids = selectedIds
    setNotes(prev => prev.filter(n => !ids.has(n.id)))
    if (editingNoteId !== null && ids.has(editingNoteId)) setEditingNoteId(null)
    setSelectedIds(new Set())
    setDirty(true)
  }

  // ── Checklist / link note creation ─────────────────────────────────

  function nextNotePlacement() {
    const scrollLeft = workspaceRef.current?.scrollLeft ?? 0
    const scrollTop = workspaceRef.current?.scrollTop ?? 0
    const topZ = notes.reduce((m, n) => Math.max(m, n.z), 0)
    return {
      x: scrollLeft + 40 + (notes.length % 5) * 20,
      y: scrollTop + 40 + (notes.length % 5) * 20,
      color: COLORS[notes.length % COLORS.length].key,
      z: topZ + 1,
    }
  }

  function addChecklistNoteAction() {
    if (!canEdit) return
    pushHistory()
    const p = nextNotePlacement()
    const newNote = createChecklistNote(p.x, p.y, p.color, p.z)
    setNotes(prev => [...prev, newNote])
    setSelectedIds(new Set([newNote.id]))
    setDirty(true)
  }

  function addLinkNoteAction() {
    if (!canEdit) return
    pushHistory()
    const p = nextNotePlacement()
    const newNote = createLinkNote(p.x, p.y, p.color, p.z)
    setNotes(prev => [...prev, newNote])
    setSelectedIds(new Set([newNote.id]))
    setDirty(true)
  }

  // ── Checklist note mutations ───────────────────────────────────────

  function updateChecklistTitle(noteId: string, title: string) {
    setNotes(prev => prev.map(n =>
      n.id === noteId && n.type === 'checklist' ? { ...n, title } : n,
    ))
    setDirty(true)
  }

  function toggleChecklistItem(noteId: string, itemId: string) {
    pushHistory()
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'checklist') return n
      return {
        ...n,
        items: n.items.map(it => it.id === itemId ? { ...it, done: !it.done } : it),
      }
    }))
    setDirty(true)
  }

  function updateChecklistItemText(noteId: string, itemId: string, text: string) {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'checklist') return n
      return {
        ...n,
        items: n.items.map(it => it.id === itemId ? { ...it, text } : it),
      }
    }))
    setDirty(true)
  }

  function addChecklistItemRow(noteId: string) {
    pushHistory()
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'checklist') return n
      return { ...n, items: [...n.items, createChecklistItem('')] }
    }))
    setDirty(true)
  }

  function deleteChecklistItemRow(noteId: string, itemId: string) {
    pushHistory()
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'checklist') return n
      return { ...n, items: n.items.filter(it => it.id !== itemId) }
    }))
    setDirty(true)
  }

  // ── Link note mutations ────────────────────────────────────────────

  function setLinkNoteType(noteId: string, linkType: CanvasLinkType) {
    pushHistory()
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'link') return n
      return { ...n, linkType, linkId: null, linkUrl: null, label: '' }
    }))
    setDirty(true)
    // Warm the options cache for the new type.
    void loadLinkOptions(linkType)
  }

  function setLinkNoteTarget(noteId: string, linkId: string, defaultLabel: string) {
    pushHistory()
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'link') return n
      const label = n.label && n.label.trim() !== '' ? n.label : defaultLabel
      return { ...n, linkId, label }
    }))
    setDirty(true)
  }

  function setLinkNoteUrl(noteId: string, linkUrl: string) {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'link') return n
      return { ...n, linkUrl }
    }))
    setDirty(true)
  }

  function setLinkNoteLabel(noteId: string, label: string) {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || n.type !== 'link') return n
      return { ...n, label }
    }))
    setDirty(true)
  }

  async function loadLinkOptions(type: CanvasLinkType) {
    if (type === 'url') return
    if (!canvas) return
    if (linkOptions[type]) return
    const orgId = canvas.organization_id
    try {
      if (type === 'course') {
        const { data } = await supabaseRestGet<{ id: string; name: string }>(
          'offerings',
          `select=id,name&organization_id=eq.${orgId}&type=eq.course&order=name.asc`,
          { label: 'canvas:link:courses' },
        )
        setLinkOptions(prev => ({
          ...prev,
          course: (data ?? []).map(o => ({ id: o.id, label: o.name })),
        }))
      } else if (type === 'habit') {
        const { data } = await supabaseRestGet<{ id: string; name: string }>(
          'habits',
          `select=id,name&organization_id=eq.${orgId}&is_active=eq.true&order=name.asc`,
          { label: 'canvas:link:habits' },
        )
        setLinkOptions(prev => ({
          ...prev,
          habit: (data ?? []).map(h => ({ id: h.id, label: h.name })),
        }))
      } else if (type === 'canvas') {
        const { data } = await supabaseRestGet<{ id: string; title: string }>(
          'canvases',
          `select=id,title&organization_id=eq.${orgId}&id=neq.${canvas.id}&archived_at=is.null&order=title.asc`,
          { label: 'canvas:link:canvases' },
        )
        setLinkOptions(prev => ({
          ...prev,
          canvas: (data ?? []).map(c => ({ id: c.id, label: c.title })),
        }))
      }
    } catch (err) {
      toast.error((err as Error).message || `Failed to load ${type} list`)
    }
  }

  function openLinkTarget(note: CanvasLinkNote) {
    if (note.linkType === 'url') {
      if (note.linkUrl) window.open(note.linkUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (!note.linkId) return
    if (note.linkType === 'course') {
      navigate(isMenteeMode ? `/my-courses/${note.linkId}` : `/courses/${note.linkId}/edit`)
    } else if (note.linkType === 'habit') {
      navigate(isMenteeMode ? `/my-habits/${note.linkId}` : `/habits/${note.linkId}/edit`)
    } else if (note.linkType === 'canvas') {
      navigate(isMenteeMode ? `/my-canvases/${note.linkId}` : `/canvases/${note.linkId}`)
    }
  }

  // ── Connector mode ─────────────────────────────────────────────────

  function startConnectMode() {
    if (!canEdit) return
    setConnectorMode({ sourceId: null })
    setSelectedIds(new Set())
  }

  function handleConnectClick(noteId: string) {
    if (!connectorMode) return
    if (!connectorMode.sourceId) {
      setConnectorMode({ sourceId: noteId })
      return
    }
    if (connectorMode.sourceId === noteId) {
      // Clicking the source again cancels the in-progress connector.
      setConnectorMode(null)
      return
    }
    // Don't add a duplicate of an existing edge.
    const src = connectorMode.sourceId
    const alreadyExists = connectors.some(c =>
      (c.fromNoteId === src && c.toNoteId === noteId) ||
      (c.fromNoteId === noteId && c.toNoteId === src),
    )
    if (!alreadyExists) {
      pushHistory()
      setConnectors(prev => [...prev, createConnector(src, noteId)])
      setDirty(true)
    }
    setConnectorMode(null)
  }

  function deleteConnector(connectorId: string) {
    if (!canEdit) return
    pushHistory()
    setConnectors(prev => prev.filter(c => c.id !== connectorId))
    setDirty(true)
  }

  // ── Markdown toolbar helpers (sticky note edit mode) ───────────────

  function wrapSelection(noteId: string, marker: string) {
    const ta = activeTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value
    const selected = value.slice(start, end)
    const newText = value.slice(0, start) + marker + selected + marker + value.slice(end)
    updateNoteText(noteId, newText)
    // Restore the selection inside the new marker pair on next tick.
    setTimeout(() => {
      if (!ta || activeTextareaRef.current !== ta) return
      ta.focus()
      ta.setSelectionRange(start + marker.length, end + marker.length)
    }, 0)
  }

  function prefixLineBullet(noteId: string) {
    const ta = activeTextareaRef.current
    if (!ta) return
    const value = ta.value
    const caret = ta.selectionStart
    // Find the start of the current line.
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1
    const newText = value.slice(0, lineStart) + '- ' + value.slice(lineStart)
    updateNoteText(noteId, newText)
    setTimeout(() => {
      if (!ta || activeTextareaRef.current !== ta) return
      ta.focus()
      ta.setSelectionRange(caret + 2, caret + 2)
    }, 0)
  }

  // Refresh the keyboard handler ref every render so the installed
  // document-level listener always sees the latest state closure.
  //
  //   N                — add a sticky note
  //   Delete / Backspace — delete the current selection
  //   Cmd/Ctrl + Z     — undo
  //
  // Any keypress whose target is an <input>, <textarea>, or
  // contenteditable element is ignored so native text editing
  // (including the browser's own undo inside a textarea) still works.
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (!canEdit) return
    const target = e.target as HTMLElement | null
    const inTextInput = !!target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
    // Escape works from anywhere (including while typing): it cancels
    // connector mode first, then clears selection.
    if (e.key === 'Escape') {
      if (connectorMode) {
        e.preventDefault()
        setConnectorMode(null)
        return
      }
      if (selectedIds.size > 0 && !inTextInput) {
        e.preventDefault()
        setSelectedIds(new Set())
        return
      }
    }

    if (inTextInput) return

    // Cmd/Ctrl+Z — undo.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
      return
    }

    // Everything below is plain-key, no modifiers.
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      addNote()
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIds.size === 0) return
      e.preventDefault()
      deleteSelected()
      return
    }
  }

  function updateNoteText(noteId: string, text: string) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, text } : n))
    setDirty(true)
  }

  function updateNoteColor(noteId: string, color: CanvasNoteColor) {
    pushHistory()
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, color } : n))
    setDirty(true)
  }

  function bringToFront(noteId: string) {
    setNotes(prev => {
      const topZ = prev.reduce((m, n) => Math.max(m, n.z), 0)
      const target = prev.find(n => n.id === noteId)
      if (!target || target.z >= topZ) return prev
      return prev.map(n => n.id === noteId ? { ...n, z: topZ + 1 } : n)
    })
  }

  function handleResizePointerDown(e: React.PointerEvent, note: CanvasNote) {
    if (!canEdit) return
    if (editingNoteId === note.id) return
    e.stopPropagation()
    e.preventDefault()
    resizeStateRef.current = {
      noteId: note.id,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: note.width,
      startHeight: note.height,
      prevNotes: notes,
      prevConnectors: connectors,
      historyPushed: false,
    }
  }

  function handleNotePointerDown(e: React.PointerEvent, note: CanvasNote) {
    if (!canEdit) return
    if (editingNoteId === note.id) return // don't drag while text-editing
    // Don't start a drag from inputs, textareas, buttons, or anything
    // marked data-no-drag (e.g. the resize handle or the control bar).
    const target = e.target as HTMLElement
    if (target.closest('input, select, textarea, button, a, [data-no-drag]')) return

    // In connector mode a pointerdown on a note is interpreted as a
    // click for building the connector, NOT as a drag.
    if (connectorMode) {
      e.preventDefault()
      e.stopPropagation()
      handleConnectClick(note.id)
      return
    }

    // Shift-click toggles this note's membership in the selection and
    // does NOT start a drag. Matches Figma / Miro convention.
    if (e.shiftKey) {
      e.preventDefault()
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(note.id)) next.delete(note.id)
        else next.add(note.id)
        return next
      })
      return
    }

    // If the note is already part of the selection, preserve the whole
    // selection so the drag moves every selected note together. If it
    // is NOT in the selection, narrow to just this note now.
    const preserveSelection = selectedIds.has(note.id)
    const dragIds: Set<string> = preserveSelection
      ? selectedIds
      : new Set([note.id])
    if (!preserveSelection) {
      setSelectedIds(new Set([note.id]))
    }

    bringToFront(note.id)

    const noteStartPositions: Record<string, { x: number; y: number }> = {}
    for (const n of notes) {
      if (dragIds.has(n.id)) noteStartPositions[n.id] = { x: n.x, y: n.y }
    }
    dragStateRef.current = {
      clickedNoteId: note.id,
      startX: e.clientX,
      startY: e.clientY,
      noteStartPositions,
      prevNotes: notes,
      prevConnectors: connectors,
      historyPushed: false,
    }
    e.preventDefault()
  }

  // ── Server sync ─────────────────────────────────────────────────────

  async function saveCanvas() {
    if (!canvas || !canEdit) return
    setSaving(true)
    try {
      const { error: err } = await supabaseRestCall(
        'canvases',
        'PATCH',
        { content: { notes, connectors }, updated_by_uid: actorUserId },
        `id=eq.${canvas.id}`,
      )
      if (err) {
        reportSupabaseError(err, { component: 'CanvasEditPage', action: 'save' })
        toast.error(err.message)
        return
      }
      setDirty(false)
      setCanvas({ ...canvas, content: { notes, connectors }, updated_at: new Date().toISOString(), updated_by_uid: actorUserId })
      if (profile) {
        setLastEditorLabel(`${profile.first_name} ${profile.last_name}`)
      } else if (menteeProfile) {
        setLastEditorLabel(`${menteeProfile.first_name} ${menteeProfile.last_name}`)
      }
      if (profile) {
        await logAudit({
          organization_id: canvas.organization_id,
          actor_id: profile.id,
          action: 'updated',
          entity_type: 'canvas',
          entity_id: canvas.id,
          details: { sub: 'content', note_count: notes.length },
        })
      }
      toast.success('Saved')
    } finally {
      setSaving(false)
    }
  }

  async function saveTitle() {
    if (!canvas || !canEdit || editingTitleValue === null) return
    const newTitle = editingTitleValue.trim()
    if (!newTitle || newTitle === canvas.title) {
      setEditingTitleValue(null)
      return
    }
    const { error: err } = await supabaseRestCall(
      'canvases',
      'PATCH',
      { title: newTitle },
      `id=eq.${canvas.id}`,
    )
    if (err) { toast.error(err.message); return }
    setCanvas({ ...canvas, title: newTitle })
    setEditingTitleValue(null)
    if (profile) {
      await logAudit({
        organization_id: canvas.organization_id,
        actor_id: profile.id,
        action: 'updated',
        entity_type: 'canvas',
        entity_id: canvas.id,
        details: { sub: 'title', title: newTitle },
      })
    }
    toast.success('Title updated')
  }

  async function toggleArchive() {
    if (!canvas || !profile) return
    const next = canvas.archived_at ? null : new Date().toISOString()
    const { error: err } = await supabaseRestCall(
      'canvases',
      'PATCH',
      { archived_at: next },
      `id=eq.${canvas.id}`,
    )
    if (err) { toast.error(err.message); return }
    setCanvas({ ...canvas, archived_at: next })
    await logAudit({
      organization_id: canvas.organization_id,
      actor_id: profile.id,
      action: next ? 'archived' : 'restored',
      entity_type: 'canvas',
      entity_id: canvas.id,
    })
    toast.success(next ? 'Canvas archived' : 'Canvas restored')
  }

  async function handleDelete() {
    if (!canvas || !profile) return
    if (!confirm(`Delete "${canvas.title}"? This cannot be undone.`)) return
    const { error: err } = await supabase.from('canvases').delete().eq('id', canvas.id)
    if (err) { toast.error(err.message); return }
    await logAudit({
      organization_id: canvas.organization_id,
      actor_id: profile.id,
      action: 'deleted',
      entity_type: 'canvas',
      entity_id: canvas.id,
      details: { title: canvas.title },
    })
    toast.success('Canvas deleted')
    navigate(backRoute)
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) return <Skeleton count={5} className="h-14 w-full" gap="gap-3" />
  if (error || !canvas) {
    return (
      <div className="max-w-2xl">
        <button onClick={() => navigate(backRoute)} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          &larr; Back
        </button>
        <LoadingErrorState message={error ?? 'Canvas not found.'} onRetry={() => fetchRef.current()} />
      </div>
    )
  }

  const canDelete = !!profile && (profile.role === 'admin' || profile.role === 'operations')

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-3">
        <button
          onClick={() => {
            if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return
            navigate(backRoute)
          }}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        {editingTitleValue === null ? (
          <h1
            className="text-lg font-semibold text-gray-900 cursor-pointer hover:underline decoration-dotted"
            onClick={() => canEdit && setEditingTitleValue(canvas.title)}
            title={canEdit ? 'Click to rename' : undefined}
          >
            {canvas.title}
          </h1>
        ) : (
          <input
            type="text"
            autoFocus
            value={editingTitleValue}
            onChange={e => setEditingTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitleValue(null) }}
            className="text-lg font-semibold text-gray-900 border-b border-brand outline-none px-1"
          />
        )}
        {canvas.archived_at && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            Archived
          </span>
        )}
        {dirty && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Button type="button" onClick={addNote} disabled={!canEdit}>+ Note</Button>
        <Button type="button" variant="secondary" onClick={addChecklistNoteAction} disabled={!canEdit}>
          + Checklist
        </Button>
        <Button type="button" variant="secondary" onClick={addLinkNoteAction} disabled={!canEdit}>
          + Link
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={connectorMode ? () => setConnectorMode(null) : startConnectMode}
          disabled={!canEdit}
          className={connectorMode ? 'ring-2 ring-brand' : ''}
        >
          {connectorMode ? 'Cancel connect' : 'Connect'}
        </Button>
        <Button type="button" variant="secondary" onClick={undo} disabled={!canEdit || past.length === 0}>
          Undo
        </Button>
        <Button type="button" onClick={saveCanvas} disabled={!canEdit || !dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => fetchRef.current()}>
          Refresh
        </Button>
        {!isMenteeMode && profile && (profile.role === 'admin' || profile.role === 'operations' || profile.id === canvas.mentor_id) && (
          <Button type="button" variant="secondary" onClick={toggleArchive}>
            {canvas.archived_at ? 'Restore' : 'Archive'}
          </Button>
        )}
        {canDelete && (
          <Button type="button" variant="secondary" onClick={handleDelete}>
            Delete
          </Button>
        )}
        <div className="ml-auto text-xs text-gray-400">
          Updated {formatDateTime(canvas.updated_at)}
          {lastEditorLabel && ` by ${lastEditorLabel}`}
        </div>
      </div>

      {canvas.description && (
        <p className="text-xs text-gray-500 mb-3">{canvas.description}</p>
      )}
      {!canEdit && (
        <p className="text-xs text-amber-600 mb-3">
          You're in read-only mode. Only the assigned mentor, the mentee, and admins can edit this canvas.
        </p>
      )}
      {connectorMode && (
        <p className="text-xs text-brand mb-3">
          {connectorMode.sourceId
            ? 'Now click a second note to connect — Esc to cancel.'
            : 'Click the first note to start a connector — Esc to cancel.'}
        </p>
      )}

      {/* Workspace */}
      <div
        ref={workspaceRef}
        className="flex-1 overflow-auto rounded-md border border-gray-200 bg-gray-50 relative"
        style={{ minHeight: 400 }}
      >
        <div
          className="relative"
          onPointerDown={e => {
            // Clicking empty workspace clears the selection. Ignore clicks
            // that bubble up from notes (target !== currentTarget).
            if (e.target === e.currentTarget) {
              setSelectedIds(new Set())
              if (connectorMode) setConnectorMode(null)
            }
          }}
          style={{
            width: WORKSPACE_SIZE.width,
            height: WORKSPACE_SIZE.height,
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            cursor: connectorMode ? 'crosshair' : undefined,
          }}
        >
          {/* Connector overlay — lives beneath notes (z-index 0) so notes
              stay clickable. Notes themselves get z >= 1 from bringToFront.
              The SVG itself has pointer-events: none; only the invisible
              wide hit-lines opt back in so they can be clicked to delete. */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={WORKSPACE_SIZE.width}
            height={WORKSPACE_SIZE.height}
            style={{ zIndex: 0 }}
          >
            {connectors.map(c => {
              const from = notes.find(n => n.id === c.fromNoteId)
              const to = notes.find(n => n.id === c.toNoteId)
              if (!from || !to) return null
              const x1 = from.x + from.width / 2
              const y1 = from.y + from.height / 2
              const x2 = to.x + to.width / 2
              const y2 = to.y + to.height / 2
              return (
                <g key={c.id}>
                  {canEdit && (
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth={14}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); deleteConnector(c.id) }}
                    >
                      <title>Click to delete connector</title>
                    </line>
                  )}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={2} />
                </g>
              )
            })}
          </svg>

          {notes.map(note => {
            const cc = colorClasses(note.color)
            const isEditing = note.type === 'sticky' && editingNoteId === note.id
            const isSelected = selectedIds.has(note.id)
            const isConnectSource = connectorMode?.sourceId === note.id
            const ringClass = isConnectSource
              ? 'ring-2 ring-brand'
              : isEditing || isSelected
                ? 'ring-2 ' + cc.ring
                : ''
            return (
              <div
                key={note.id}
                onPointerDown={e => handleNotePointerDown(e, note)}
                className={`absolute rounded shadow-md border ${cc.bg} ${cc.border} select-none overflow-hidden ${ringClass}`}
                style={{
                  left: note.x,
                  top: note.y,
                  width: note.width,
                  height: note.height,
                  zIndex: note.z,
                  cursor: connectorMode ? 'crosshair' : (isEditing ? 'text' : 'grab'),
                }}
              >
                {/* Shared top controls bar */}
                {canEdit && (
                  <div className="flex items-center justify-between px-2 py-1 border-b border-black/10" data-no-drag>
                    <div className="flex items-center gap-1">
                      {COLORS.map(c => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); updateNoteColor(note.id, c.key) }}
                          className={`w-3 h-3 rounded-full border border-black/20 ${c.bg} ${note.color === c.key ? 'ring-1 ring-offset-1 ' + c.ring : ''}`}
                          title={c.key}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                      className="text-gray-500 hover:text-red-600 text-sm leading-none"
                      title="Delete note"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Type-specific body */}
                {note.type === 'sticky' && renderStickyBody(note)}
                {note.type === 'checklist' && renderChecklistBody(note)}
                {note.type === 'link' && renderLinkBody(note)}

                {/* Resize handle (bottom-right corner) */}
                {canEdit && (
                  <div
                    data-no-drag
                    onPointerDown={e => handleResizePointerDown(e, note)}
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
                    style={{
                      background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.25) 50%)',
                    }}
                    title="Drag to resize"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // ── Body renderers (scoped inside CanvasEditPage so they close over
  //    all the state + handlers) ─────────────────────────────────────

  function renderStickyBody(note: CanvasStickyNote) {
    const isEditing = editingNoteId === note.id
    if (isEditing) {
      return (
        <div className="h-[calc(100%-28px)] flex flex-col" data-no-drag>
          {/* Markdown toolbar */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-black/5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); wrapSelection(note.id, '**') }}
              className="px-1.5 py-0.5 text-xs font-bold text-gray-600 hover:bg-black/10 rounded"
              title="Bold (**text**)"
            >
              B
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); wrapSelection(note.id, '*') }}
              className="px-1.5 py-0.5 text-xs italic text-gray-600 hover:bg-black/10 rounded"
              title="Italic (*text*)"
            >
              I
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prefixLineBullet(note.id) }}
              className="px-1.5 py-0.5 text-xs text-gray-600 hover:bg-black/10 rounded"
              title="Bullet (- item)"
            >
              •
            </button>
          </div>
          <textarea
            autoFocus
            ref={(el) => { if (el) activeTextareaRef.current = el }}
            value={note.text}
            onChange={e => updateNoteText(note.id, e.target.value)}
            onBlur={() => {
              if (activeTextareaRef.current && editingNoteId === note.id) {
                activeTextareaRef.current = null
              }
              setEditingNoteId(null)
            }}
            placeholder="Type here…"
            className="flex-1 w-full bg-transparent outline-none resize-none px-3 py-2 text-sm text-gray-800 placeholder-gray-400"
          />
        </div>
      )
    }
    return (
      <div
        className="w-full overflow-auto px-3 py-2 text-sm text-gray-800 break-words"
        style={{ height: canEdit ? 'calc(100% - 28px)' : '100%' }}
        onDoubleClick={() => {
          if (!canEdit) return
          pushHistory()
          setEditingNoteId(note.id)
        }}
      >
        {note.text
          ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(note.text) }} />
          : <span className="text-gray-400 italic">Double-click to edit</span>}
      </div>
    )
  }

  function renderChecklistBody(note: CanvasChecklistNote) {
    const done = note.items.filter(it => it.done).length
    const total = note.items.length
    return (
      <div
        className="flex flex-col px-2 py-1.5 text-sm text-gray-800"
        style={{ height: canEdit ? 'calc(100% - 28px)' : '100%' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <input
            type="text"
            value={note.title}
            onChange={e => updateChecklistTitle(note.id, e.target.value)}
            onFocus={() => { if (canEdit) pushHistory() }}
            disabled={!canEdit}
            placeholder="Checklist title"
            className="flex-1 bg-transparent outline-none font-semibold placeholder-gray-400 disabled:cursor-default"
          />
          <span className="text-[10px] text-gray-500 font-medium">{done}/{total}</span>
        </div>
        <div className="flex-1 overflow-auto space-y-1 pr-1">
          {note.items.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 group">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleChecklistItem(note.id, item.id)}
                disabled={!canEdit}
                className="accent-brand"
              />
              <input
                type="text"
                value={item.text}
                onChange={e => updateChecklistItemText(note.id, item.id, e.target.value)}
                onFocus={() => { if (canEdit) pushHistory() }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addChecklistItemRow(note.id)
                  }
                }}
                disabled={!canEdit}
                placeholder="Item"
                className={`flex-1 bg-transparent outline-none placeholder-gray-400 disabled:cursor-default ${item.done ? 'line-through text-gray-400' : ''}`}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteChecklistItemRow(note.id, item.id) }}
                  className="text-gray-400 hover:text-red-600 text-xs leading-none opacity-0 group-hover:opacity-100"
                  title="Remove item"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); addChecklistItemRow(note.id) }}
            className="mt-1 text-[11px] text-brand hover:underline self-start"
          >
            + Add item
          </button>
        )}
      </div>
    )
  }

  function renderLinkBody(note: CanvasLinkNote) {
    const picker = note.linkType !== 'url' ? linkOptions[note.linkType] : undefined
    const resolved = note.linkType === 'url'
      ? !!note.linkUrl
      : !!note.linkId
    return (
      <div
        className="flex flex-col px-2 py-1.5 gap-1.5 text-sm text-gray-800"
        style={{ height: canEdit ? 'calc(100% - 28px)' : '100%' }}
      >
        {canEdit ? (
          <>
            <div className="flex items-center gap-1">
              <select
                value={note.linkType}
                onChange={e => setLinkNoteType(note.id, e.target.value as CanvasLinkType)}
                className="text-xs bg-white/70 border border-black/10 rounded px-1 py-0.5"
              >
                <option value="url">URL</option>
                <option value="course">Course</option>
                <option value="habit">Habit</option>
                <option value="canvas">Canvas</option>
              </select>
            </div>
            {note.linkType === 'url' ? (
              <input
                type="text"
                value={note.linkUrl ?? ''}
                onChange={e => setLinkNoteUrl(note.id, e.target.value)}
                onFocus={() => { if (canEdit) pushHistory() }}
                placeholder="https://…"
                className="bg-transparent outline-none border-b border-black/10 text-xs placeholder-gray-400"
              />
            ) : (
              <select
                value={note.linkId ?? ''}
                onFocus={() => void loadLinkOptions(note.linkType)}
                onChange={e => {
                  const id = e.target.value
                  const opt = (picker ?? []).find(o => o.id === id)
                  if (opt) setLinkNoteTarget(note.id, opt.id, opt.label)
                }}
                className="text-xs bg-white/70 border border-black/10 rounded px-1 py-0.5"
              >
                <option value="">
                  {picker
                    ? picker.length === 0
                      ? `No ${note.linkType}s found`
                      : `Select a ${note.linkType}…`
                    : `Click to load ${note.linkType}s…`}
                </option>
                {(picker ?? []).map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={note.label}
              onChange={e => setLinkNoteLabel(note.id, e.target.value)}
              onFocus={() => { if (canEdit) pushHistory() }}
              placeholder="Label (shown on the card)"
              className="bg-transparent outline-none text-xs border-b border-black/10 placeholder-gray-400"
            />
            {resolved && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openLinkTarget(note) }}
                className="self-start text-[11px] text-brand hover:underline mt-auto"
              >
                Open ↗
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col h-full">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{note.linkType}</div>
            <div className="font-semibold text-sm break-words">{note.label || '(no label)'}</div>
            {resolved && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openLinkTarget(note) }}
                className="self-start text-[11px] text-brand hover:underline mt-auto"
              >
                Open ↗
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
}
