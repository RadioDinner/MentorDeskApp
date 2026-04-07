import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AssignmentStatus } from '../types'

interface AssignmentDetail {
  id: string
  status: AssignmentStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  mentor: { id: string; first_name: string; last_name: string; email: string }
  mentee: { id: string; first_name: string; last_name: string; email: string }
}

const STATUSES: { value: AssignmentStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
]

export default function AssignmentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [status, setStatus] = useState<AssignmentStatus>('active')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchAssignment() {
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id, status, started_at, ended_at, notes, created_at,
          mentor:staff!assignments_mentor_id_fkey ( id, first_name, last_name, email ),
          mentee:mentees!assignments_mentee_id_fkey ( id, first_name, last_name, email )
        `)
        .eq('id', id!)
        .single()

      if (error) {
        setFetchError(error.message)
        setLoading(false)
        return
      }

      const a = data as unknown as AssignmentDetail
      setAssignment(a)
      setStatus(a.status)
      setNotes(a.notes ?? '')
      setLoading(false)
    }

    fetchAssignment()
  }, [id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!assignment) return
    setMsg(null)
    setSaving(true)

    const updates: Record<string, unknown> = {
      status,
      notes: notes.trim() || null,
    }

    if (status === 'ended' && !assignment.ended_at) {
      updates.ended_at = new Date().toISOString()
    }
    if (status !== 'ended') {
      updates.ended_at = null
    }

    const { error } = await supabase
      .from('assignments')
      .update(updates)
      .eq('id', assignment.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    setMsg({ type: 'success', text: 'Assignment updated.' })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (fetchError || !assignment) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Assignment not found.'}
        </div>
      </div>
    )
  }

  const selectClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/assignments')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Edit Assignment</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Edit */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Assignment Details</h2>

            <form onSubmit={handleSave} className="space-y-5">
              {msg && (
                <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm ${
                  msg.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
                  {msg.text}
                </div>
              )}

              <div>
                <label htmlFor="editStatus" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Status
                </label>
                <select id="editStatus" value={status}
                  onChange={e => setStatus(e.target.value as AssignmentStatus)} className={selectClass}>
                  {STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Notes
                </label>
                <textarea id="editNotes" rows={4} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional"
                  className={inputClass + ' resize-none'} />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={saving}
                  className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right — Pairing info */}
        <div className="space-y-6">
          {/* Mentor card */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Mentor</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-600 shrink-0">
                {assignment.mentor.first_name[0]}{assignment.mentor.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {assignment.mentor.first_name} {assignment.mentor.last_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{assignment.mentor.email}</p>
              </div>
            </div>
          </div>

          {/* Mentee card */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Mentee</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-xs font-semibold text-green-600 shrink-0">
                {assignment.mentee.first_name[0]}{assignment.mentee.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {assignment.mentee.first_name} {assignment.mentee.last_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{assignment.mentee.email}</p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Info</p>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p>Started: <span className="font-medium text-gray-700">{new Date(assignment.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
              {assignment.ended_at && (
                <p>Ended: <span className="font-medium text-gray-700">{new Date(assignment.ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
              )}
              <p>Created: <span className="font-medium text-gray-700">{new Date(assignment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
