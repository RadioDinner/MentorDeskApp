import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'

export default function MenteeCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setMsg(null)
    setSaving(true)

    const { data, error } = await supabase
      .from('mentees')
      .insert({
        organization_id: profile.organization_id,
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
      .select('id')

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    if (data && data.length > 0) {
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'mentee', entity_id: data[0].id, details: { name: `${firstName.trim()} ${lastName.trim()}` } })
      navigate(`/mentees/${data[0].id}/edit`)
    } else {
      navigate('/mentees')
    }
  }

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/mentees')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Create Mentee Account</h1>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
              {saving ? 'Creating…' : 'Create Mentee Account'}
            </button>
            <button type="button" onClick={() => navigate('/mentees')}
              className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
