import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee, FlowStep } from '../types'

export default function MenteeEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()

  const [mentee, setMentee] = useState<Mentee | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [flowStepId, setFlowStepId] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // De-activate / Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dangerMsg, setDangerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchMentee() {
      try {
        const { data, error } = await supabase
          .from('mentees')
          .select('*')
          .eq('id', id!)
          .single()

        if (error) {
          setFetchError(error.message)
          return
        }

        const m = data as Mentee
        setMentee(m)
        setFirstName(m.first_name)
        setLastName(m.last_name)
        setEmail(m.email)
        setPhone(m.phone ?? '')
        setStreet(m.street ?? '')
        setCity(m.city ?? '')
        setState(m.state ?? '')
        setZip(m.zip ?? '')
        setCountry(m.country ?? '')
        setFlowStepId(m.flow_step_id ?? '')

        // Fetch org's mentee flow
        const { data: orgData } = await supabase
          .from('organizations')
          .select('mentee_flow')
          .eq('id', m.organization_id)
          .single()

        if (orgData?.mentee_flow) {
          setFlowSteps((orgData.mentee_flow as { steps: FlowStep[] }).steps ?? [])
        }
      } catch (err) {
        setFetchError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchMentee()
  }, [id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!mentee) return
    setMsg(null)
    setSaving(true)

    const { error } = await supabase
      .from('mentees')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        street: street.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        country: country.trim() || null,
      })
      .eq('id', mentee.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    setMentee({ ...mentee, first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() })
    if (currentUser) logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'mentee', entity_id: mentee.id, details: { name: `${firstName.trim()} ${lastName.trim()}` } })
    setMsg({ type: 'success', text: 'Mentee information has been updated.' })
  }

  async function handleDeactivate() {
    if (!mentee || !currentUser) return
    const isDeactivated = !!mentee.archived_at
    const now = isDeactivated ? null : new Date().toISOString()
    const { error } = await supabase.from('mentees').update({ archived_at: now }).eq('id', mentee.id)
    if (error) { setDangerMsg({ type: 'error', text: error.message }); return }
    setMentee({ ...mentee, archived_at: now } as Mentee)
    logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: isDeactivated ? 'reactivated' : 'deactivated', entity_type: 'mentee', entity_id: mentee.id })
    setDangerMsg({ type: 'success', text: isDeactivated ? 'Mentee re-activated.' : 'Mentee de-activated.' })
  }

  async function handleDeleteMentee() {
    if (!mentee || !currentUser) return
    setDeleting(true)
    const { error } = await supabase.from('mentees').delete().eq('id', mentee.id)
    setDeleting(false)
    if (error) { setDangerMsg({ type: 'error', text: error.message }); return }
    logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: 'deleted', entity_type: 'mentee', entity_id: mentee.id })
    navigate('/mentees')
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (fetchError || !mentee) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Mentee not found.'}
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const hasAuthAccount = mentee.user_id !== null

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/mentees')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
            {mentee.first_name[0]}{mentee.last_name[0]}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {mentee.first_name} {mentee.last_name}
            </h1>
            <p className="text-xs text-gray-500">Mentee</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Personal Info */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Personal Information</h2>

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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
                  <input id="mFirstName" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mLastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
                  <input id="mLastName" type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mEmail" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input id="mEmail" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mPhone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input id="mPhone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="mStreet" className="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
                <input id="mStreet" type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="Optional" className={inputClass} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="mCity" className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                  <input id="mCity" type="text" value={city} onChange={e => setCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mState" className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
                  <input id="mState" type="text" value={state} onChange={e => setState(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mZip" className="block text-sm font-medium text-gray-700 mb-1.5">ZIP</label>
                  <input id="mZip" type="text" value={zip} onChange={e => setZip(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="mCountry" className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <input id="mCountry" type="text" value={country} onChange={e => setCountry(e.target.value)} className={inputClass} />
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

        {/* Right column */}
        <div className="space-y-6">
          {/* Program Status */}
          {flowSteps.length > 0 && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Program Status</h2>

              {statusMsg && (
                <div className={`flex items-start gap-3 rounded border px-3 py-2 text-xs mb-3 ${
                  statusMsg.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <span>{statusMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                  {statusMsg.text}
                </div>
              )}

              {/* Current status display */}
              {flowStepId && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Current status</p>
                  <p className="text-sm font-medium text-gray-900">
                    {flowSteps.find(s => s.id === flowStepId)?.name ?? 'Unknown'}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="flowStep" className="block text-xs font-medium text-gray-700 mb-1">
                  {flowStepId ? 'Change status' : 'Set status'}
                </label>
                <select id="flowStep" value={flowStepId}
                  onChange={e => setFlowStepId(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white">
                  <option value="">No status set</option>
                  {flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order).length > 0 && (
                    <optgroup label="Program flow">
                      {flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {flowSteps.filter(s => !s.in_flow).length > 0 && (
                    <optgroup label="Other statuses">
                      {flowSteps.filter(s => !s.in_flow).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <button type="button" disabled={statusSaving}
                onClick={async () => {
                  if (!mentee) return
                  setStatusMsg(null)
                  setStatusSaving(true)
                  const { error } = await supabase
                    .from('mentees')
                    .update({ flow_step_id: flowStepId || null })
                    .eq('id', mentee.id)
                  setStatusSaving(false)
                  if (error) {
                    setStatusMsg({ type: 'error', text: error.message })
                    return
                  }
                  if (currentUser) logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'mentee', entity_id: mentee.id, details: { fields: 'status', status: flowSteps.find(s => s.id === flowStepId)?.name ?? 'cleared' } })
                  setStatusMsg({ type: 'success', text: 'Status updated.' })
                }}
                className="mt-3 w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition">
                {statusSaving ? 'Saving…' : 'Save status'}
              </button>
            </div>
          )}

          {/* Account */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-block w-2 h-2 rounded-full ${hasAuthAccount ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">
                {hasAuthAccount ? 'Login enabled' : 'No login account'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Added: {new Date(mentee.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-md border border-red-200 px-6 py-6">
            <h2 className="text-base font-semibold text-red-600 mb-4">Danger Zone</h2>

            {dangerMsg && (
              <div className={`flex items-start gap-3 rounded border px-3 py-2 text-xs mb-3 ${
                dangerMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <span>{dangerMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                {dangerMsg.text}
              </div>
            )}

            <div className="space-y-3">
              {/* De-activate / Re-activate */}
              <div>
                <button type="button" onClick={handleDeactivate}
                  className={`w-full rounded border px-4 py-2.5 text-sm font-medium transition-colors text-left ${mentee.archived_at ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                  {mentee.archived_at ? 'Re-activate this mentee' : 'De-activate this mentee'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {mentee.archived_at
                    ? 'Re-activating will return them to active mentee lists.'
                    : 'De-activating hides them from active lists. Can be re-activated later.'}
                </p>
              </div>

              {/* Delete */}
              {!showDeleteConfirm ? (
                <div>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
                    Delete this mentee
                  </button>
                  <p className="text-xs text-gray-400 mt-1 px-1">Permanently remove this mentee and all their data.</p>
                </div>
              ) : (
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure?</p>
                  <p className="text-xs text-red-600">
                    This will permanently delete <strong>{mentee.first_name} {mentee.last_name}</strong> and all associated data. This action cannot be undone.
                  </p>
                  <p className="text-xs text-gray-500">
                    Would you rather <button type="button" onClick={() => { handleDeactivate(); setShowDeleteConfirm(false) }} className="text-amber-600 font-medium underline hover:text-amber-700">de-activate</button> them instead? De-activated mentees can be re-activated later.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" disabled={deleting} onClick={handleDeleteMentee}
                      className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {deleting ? 'Deleting…' : 'Yes, permanently delete'}
                    </button>
                    <button type="button" onClick={() => setShowDeleteConfirm(false)}
                      className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
