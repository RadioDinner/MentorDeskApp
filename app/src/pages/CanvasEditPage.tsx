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
import type { Canvas, CanvasNote, CanvasNoteColor } from '../types'

// ── Color palette ──────────────────────────────────────────────────────

const COLORS: { key: CanvasNoteColor; bg: string; border: string; ring: string }[] = [
  { key: 'yellow', bg: 'bg-yellow-100', border: 'border-yellow-300', ring: 'ring-yellow-400' },
  { key: 'pink',   bg: 'bg-pink-100',   border: 'border-pink-300',   ring: 'ring-pink-400' },
  { key: 'blue',   bg: 'bg-blue-100',   border: 'border-blue-300',   ring: 'ring-blue-400' },
  { key: 'green',  bg: 'bg-green-100',  border: 'border-green-300',  ring: 'ring-green-400' },
  { key: 'purple', bg: 'bg-purple-100', border: 'border-purple-300', ring: 'ring-purple-400' },
  { key: 'orange', bg: 'bg-orange-100', border: 'border-orange-300', ring: 'ring-orange-400' },
]

function colorClasses(c: CanvasNoteColor) {
  return COLORS.find(x => x.key === c) ?? COLORS[0]
}

// Non-crypto uuid v4-ish — good enough for client-side note ids.
function clientId(): string {
  const t = Date.now().toString(16)
  const r = Math.random().toString(16).slice(2, 10)
  return `n_${t}_${r}`
}

const NOTE_DEFAULTS = { width: 200, height: 160 } as const
const WORKSPACE_SIZE = { width: 2400, height: 1800 }

// ── Component ─────────────────────────────────────────────────────────

export default function CanvasEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, menteeProfile, isMenteeMode } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [canvas, setCanvas] = useState<Canvas | null>(null)
  const [notes, setNotes] = useState<CanvasNote[]>([])
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
        setCanvas(c)
        setNotes(c.content?.notes ?? [])
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

  // Drag listeners (attached to document while a drag is in progress)
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const s = dragStateRef.current
      if (!s) return
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      setNotes(prev => prev.map(n => n.id === s.noteId
        ? {
            ...n,
            x: Math.max(0, Math.min(WORKSPACE_SIZE.width - n.width, s.noteStartX + dx)),
            y: Math.max(0, Math.min(WORKSPACE_SIZE.height - n.height, s.noteStartY + dy)),
          }
        : n))
    }
    function handleUp() {
      if (dragStateRef.current) {
        dragStateRef.current = null
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

  // ── Mutations (local state only) ────────────────────────────────────

  function addNote() {
    if (!canEdit) return
    const topZ = notes.reduce((m, n) => Math.max(m, n.z), 0)
    // Place near top-left of the current viewport
    const scrollLeft = workspaceRef.current?.scrollLeft ?? 0
    const scrollTop = workspaceRef.current?.scrollTop ?? 0
    const newNote: CanvasNote = {
      id: clientId(),
      x: scrollLeft + 40 + (notes.length % 5) * 20,
      y: scrollTop + 40 + (notes.length % 5) * 20,
      width: NOTE_DEFAULTS.width,
      height: NOTE_DEFAULTS.height,
      text: '',
      color: COLORS[notes.length % COLORS.length].key,
      z: topZ + 1,
    }
    setNotes(prev => [...prev, newNote])
    setEditingNoteId(newNote.id)
    setDirty(true)
  }

  function deleteNote(noteId: string) {
    if (!canEdit) return
    setNotes(prev => prev.filter(n => n.id !== noteId))
    if (editingNoteId === noteId) setEditingNoteId(null)
    setDirty(true)
  }

  function updateNoteText(noteId: string, text: string) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, text } : n))
    setDirty(true)
  }

  function updateNoteColor(noteId: string, color: CanvasNoteColor) {
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
        { content: { notes }, updated_by_uid: actorUserId },
        `id=eq.${canvas.id}`,
      )
      if (err) {
        reportSupabaseError(err, { component: 'CanvasEditPage', action: 'save' })
        toast.error(err.message)
        return
      }
      setDirty(false)
      setCanvas({ ...canvas, content: { notes }, updated_at: new Date().toISOString(), updated_by_uid: actorUserId })
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
                    onDoubleClick={() => canEdit && setEditingNoteId(note.id)}
                  >
                    {note.text || <span className="text-gray-400 italic">Double-click to edit</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
