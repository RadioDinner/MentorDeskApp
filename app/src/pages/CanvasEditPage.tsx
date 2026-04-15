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
  WORKSPACE_SIZE,
  NOTE_MIN,
  HISTORY_LIMIT,
} from '../lib/canvas'
import type { Canvas, CanvasConnector, CanvasNote, CanvasNoteColor } from '../types'

type HistorySnapshot = { notes: CanvasNote[]; connectors: CanvasConnector[] }

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
    noteId: string
    startX: number
    startY: number
    noteStartX: number
    noteStartY: number
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
        setNotes(prev => prev.map(n => n.id === drag.noteId
          ? {
              ...n,
              x: Math.max(0, Math.min(WORKSPACE_SIZE.width - n.width, drag.noteStartX + dx)),
              y: Math.max(0, Math.min(WORKSPACE_SIZE.height - n.height, drag.noteStartY + dy)),
            }
          : n))
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
        dragStateRef.current = null
        setDirty(true)
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
    setDirty(true)
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
    // Don't start a drag from the textarea or buttons
    const target = e.target as HTMLElement
    if (target.closest('textarea, button, [data-no-drag]')) return
    bringToFront(note.id)
    dragStateRef.current = {
      noteId: note.id,
      startX: e.clientX,
      startY: e.clientY,
      noteStartX: note.x,
      noteStartY: note.y,
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
      <div className="flex items-center gap-3 mb-3">
        <Button type="button" onClick={addNote} disabled={!canEdit}>+ Note</Button>
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
            backgroundSize: '24px 24px',
          }}
        >
          {notes.map(note => {
            // V1 only supports sticky notes. Checklist and link variants
            // exist in the type union (Session 019 scaffolding) but the
            // editor UI for them ships next session. Skip any non-sticky
            // note defensively — there shouldn't be any in practice yet.
            if (note.type !== 'sticky') return null
            const cc = colorClasses(note.color)
            const isEditing = editingNoteId === note.id
            return (
              <div
                key={note.id}
                onPointerDown={e => handleNotePointerDown(e, note)}
                onClick={() => bringToFront(note.id)}
                className={`absolute rounded shadow-md border ${cc.bg} ${cc.border} select-none ${isEditing ? 'ring-2 ' + cc.ring : ''}`}
                style={{
                  left: note.x,
                  top: note.y,
                  width: note.width,
                  height: note.height,
                  zIndex: note.z,
                  cursor: isEditing ? 'text' : 'grab',
                }}
              >
                {/* Note controls (top) */}
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
                {/* Note text */}
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={note.text}
                    onChange={e => updateNoteText(note.id, e.target.value)}
                    onBlur={() => setEditingNoteId(null)}
                    placeholder="Type here…"
                    className="w-full h-[calc(100%-28px)] bg-transparent outline-none resize-none px-3 py-2 text-sm text-gray-800 placeholder-gray-400"
                  />
                ) : (
                  <div
                    className="w-full h-[calc(100%-28px)] overflow-auto px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words"
                    onDoubleClick={() => {
                      if (!canEdit) return
                      pushHistory()
                      setEditingNoteId(note.id)
                    }}
                  >
                    {note.text || <span className="text-gray-400 italic">Double-click to edit</span>}
                  </div>
                )}
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
}
