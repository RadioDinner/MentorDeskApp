import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

interface PersonOption {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function AssignmentCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [mentors, setMentors] = useState<PersonOption[]>([])
  const [mentees, setMentees] = useState<PersonOption[]>([])
  const [mentorId, setMentorId] = useState('')
  const [menteeId, setMenteeId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchOptions() {
      const [mentorRes, menteeRes] = await Promise.all([
        supabase
          .from('staff')
          .select('id, first_name, last_name, email')
          .eq('organization_id', profile!.organization_id)
          .eq('role', 'mentor')
          .order('first_name'),
        supabase
          .from('mentees')
          .select('id, first_name, last_name, email')
          .eq('organization_id', profile!.organization_id)
          .order('first_name'),
      ])

      if (mentorRes.data) setMentors(mentorRes.data)
      if (menteeRes.data) setMentees(menteeRes.data)
      setLoadingOptions(false)
    }

    fetchOptions()
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !mentorId || !menteeId) return
    setMsg(null)
    setSaving(true)

    const { error } = await supabase
      .from('assignments')
      .insert({
        organization_id: profile.organization_id,
        mentor_id: mentorId,
        mentee_id: menteeId,
        notes: notes.trim() || null,
      })

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    navigate('/assignments')
  }

  const selectClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition bg-white'

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/assignments')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Assign Mentee to Mentor</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-8 py-8">
        {loadingOptions ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {msg && (
              <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                msg.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
                {msg.text}
              </div>
            )}

            {/* Mentor select */}
            <div>
              <label htmlFor="mentorSelect" className="block text-sm font-medium text-gray-700 mb-1.5">
                Mentor
              </label>
              {mentors.length === 0 ? (
                <p className="text-sm text-gray-500">No mentors available. <button type="button" onClick={() => navigate('/mentors/new')} className="text-indigo-600 hover:underline">Create one first.</button></p>
              ) : (
                <select id="mentorSelect" required value={mentorId}
                  onChange={e => setMentorId(e.target.value)} className={selectClass}>
                  <option value="">Select a mentor...</option>
                  {mentors.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Mentee select */}
            <div>
              <label htmlFor="menteeSelect" className="block text-sm font-medium text-gray-700 mb-1.5">
                Mentee
              </label>
              {mentees.length === 0 ? (
                <p className="text-sm text-gray-500">No mentees available. <button type="button" onClick={() => navigate('/mentees/new')} className="text-indigo-600 hover:underline">Create one first.</button></p>
              ) : (
                <select id="menteeSelect" required value={menteeId}
                  onChange={e => setMenteeId(e.target.value)} className={selectClass}>
                  <option value="">Select a mentee...</option>
                  {mentees.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="assignNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
                Notes
              </label>
              <textarea id="assignNotes" rows={3} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional — any context about this assignment"
                className={inputClass + ' resize-none'} />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving || mentors.length === 0 || mentees.length === 0}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
                {saving ? 'Assigning…' : 'Create Assignment'}
              </button>
              <button type="button" onClick={() => navigate('/assignments')}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
