import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { StaffMember, PayType, PayTypeSettings, RoleCategory } from '../types'

const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: 'Hourly',
  salary: 'Salary',
  pct_monthly_profit: '% of monthly profit',
  pct_engagement_profit: '% of engagement profit',
}

function getRoleCategory(role: string): RoleCategory {
  if (role === 'mentor') return 'mentor'
  return 'staff'
}

export default function PersonEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [person, setPerson] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Personal info form
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
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Compensation
  const [payType, setPayType] = useState<PayType | ''>('')
  const [payRate, setPayRate] = useState('')
  const [availablePayTypes, setAvailablePayTypes] = useState<PayType[]>([])
  const [compensationSaving, setCompensationSaving] = useState(false)
  const [compensationMsg, setCompensationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // System actions
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)

  useEffect(() => {
    if (!id) return

    async function fetchPerson() {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('id', id!)
        .single()

      if (error) {
        setFetchError(error.message)
        setLoading(false)
        return
      }

      const p = data as StaffMember
      setPerson(p)
      setFirstName(p.first_name)
      setLastName(p.last_name)
      setEmail(p.email)
      setPhone(p.phone ?? '')
      setStreet(p.street ?? '')
      setCity(p.city ?? '')
      setState(p.state ?? '')
      setZip(p.zip ?? '')
      setCountry(p.country ?? '')
      setPayType(p.pay_type ?? '')
      setPayRate(p.pay_rate != null ? String(p.pay_rate) : '')

      // Fetch org pay settings to determine available types
      const { data: orgData } = await supabase
        .from('organizations')
        .select('pay_type_settings')
        .eq('id', p.organization_id)
        .single()

      if (orgData?.pay_type_settings) {
        const settings = orgData.pay_type_settings as PayTypeSettings
        const category = getRoleCategory(p.role)
        setAvailablePayTypes(settings[category] ?? [])
      }

      setLoading(false)
    }

    fetchPerson()
  }, [id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!person) return
    setProfileMsg(null)
    setSaving(true)

    const { error } = await supabase
      .from('staff')
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
      .eq('id', person.id)

    setSaving(false)

    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
      return
    }

    setPerson({
      ...person,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
    })
    setProfileMsg({ type: 'success', text: 'Personal information has been updated.' })
  }

  async function handleCompensationSave(e: FormEvent) {
    e.preventDefault()
    if (!person) return
    setCompensationMsg(null)
    setCompensationSaving(true)

    const rateNum = payRate ? parseFloat(payRate) : null

    const { error } = await supabase
      .from('staff')
      .update({
        pay_type: payType || null,
        pay_rate: rateNum,
      })
      .eq('id', person.id)

    setCompensationSaving(false)

    if (error) {
      setCompensationMsg({ type: 'error', text: error.message })
      return
    }

    setPerson({ ...person, pay_type: (payType as PayType) || null, pay_rate: rateNum })
    setCompensationMsg({ type: 'success', text: 'Compensation has been updated.' })
  }

  async function handlePasswordReset() {
    if (!person) return
    setActionMsg(null)
    setSendingReset(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: person.email }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const msg = body.msg || body.message || body.error_description || `Error ${response.status}`
        setActionMsg({ type: 'error', text: msg })
        return
      }

      setActionMsg({ type: 'success', text: `Password reset email sent to ${person.email}.` })
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
        : 'Unknown error'
      setActionMsg({ type: 'error', text: message })
    } finally {
      setSendingReset(false)
    }
  }

  async function handleInvite() {
    if (!person) return
    setActionMsg(null)
    setSendingInvite(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: person.email }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const msg = body.msg || body.message || body.error_description || `Error ${response.status}`
        setActionMsg({ type: 'error', text: msg })
        return
      }

      setActionMsg({ type: 'success', text: `Invitation sent to ${person.email}.` })
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
        : 'Unknown error'
      setActionMsg({ type: 'error', text: message })
    } finally {
      setSendingInvite(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>
  }

  if (fetchError || !person) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-lg border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Person not found.'}
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const hasAuthAccount = person.user_id !== null

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
            {person.first_name[0]}{person.last_name[0]}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {person.first_name} {person.last_name}
            </h1>
            <p className="text-xs text-gray-500 capitalize">{person.role}</p>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column — Personal Information (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Personal Information</h2>

            <form onSubmit={handleSave} className="space-y-5">
              {profileMsg && (
                <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                  profileMsg.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <span className="mt-0.5">{profileMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                  {profileMsg.text}
                </div>
              )}

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">
                    First name
                  </label>
                  <input id="firstName" type="text" required value={firstName}
                    onChange={e => setFirstName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Last name
                  </label>
                  <input id="lastName" type="text" required value={lastName}
                    onChange={e => setLastName(e.target.value)} className={inputClass} />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <input id="editEmail" type="email" required value={email}
                    onChange={e => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="editPhone" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phone
                  </label>
                  <input id="editPhone" type="tel" value={phone}
                    onChange={e => setPhone(e.target.value)} placeholder="Optional" className={inputClass} />
                </div>
              </div>

              {/* Street */}
              <div>
                <label htmlFor="editStreet" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Street address
                </label>
                <input id="editStreet" type="text" value={street}
                  onChange={e => setStreet(e.target.value)} placeholder="Optional" className={inputClass} />
              </div>

              {/* City / State / Zip */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="editCity" className="block text-sm font-medium text-gray-700 mb-1.5">
                    City
                  </label>
                  <input id="editCity" type="text" value={city}
                    onChange={e => setCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="editState" className="block text-sm font-medium text-gray-700 mb-1.5">
                    State
                  </label>
                  <input id="editState" type="text" value={state}
                    onChange={e => setState(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="editZip" className="block text-sm font-medium text-gray-700 mb-1.5">
                    ZIP
                  </label>
                  <input id="editZip" type="text" value={zip}
                    onChange={e => setZip(e.target.value)} className={inputClass} />
                </div>
              </div>

              {/* Country */}
              <div>
                <label htmlFor="editCountry" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Country
                </label>
                <input id="editCountry" type="text" value={country}
                  onChange={e => setCountry(e.target.value)} className={inputClass} />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={saving}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right column — System Actions (1/3 width) */}
        <div className="space-y-6">

          {/* Compensation */}
          {person.role !== 'admin' && availablePayTypes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-6 py-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Compensation</h2>

              <form onSubmit={handleCompensationSave} className="space-y-4">
                {compensationMsg && (
                  <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs ${
                    compensationMsg.type === 'success'
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    <span>{compensationMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                    {compensationMsg.text}
                  </div>
                )}

                <div>
                  <label htmlFor="payType" className="block text-xs font-medium text-gray-700 mb-1">
                    Pay type
                  </label>
                  <select
                    id="payType"
                    value={payType}
                    onChange={e => setPayType(e.target.value as PayType | '')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                  >
                    <option value="">Not set</option>
                    {availablePayTypes.map(pt => (
                      <option key={pt} value={pt}>{PAY_TYPE_LABELS[pt]}</option>
                    ))}
                  </select>
                </div>

                {payType && (
                  <div>
                    <label htmlFor="payRate" className="block text-xs font-medium text-gray-700 mb-1">
                      {payType === 'pct_monthly_profit' || payType === 'pct_engagement_profit'
                        ? 'Percentage (%)'
                        : 'Rate ($)'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        {payType === 'pct_monthly_profit' || payType === 'pct_engagement_profit' ? '%' : '$'}
                      </span>
                      <input
                        id="payRate"
                        type="number"
                        step="any"
                        min="0"
                        value={payRate}
                        onChange={e => setPayRate(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                      />
                    </div>
                  </div>
                )}

                <button type="submit" disabled={compensationSaving}
                  className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {compensationSaving ? 'Saving…' : 'Save compensation'}
                </button>
              </form>
            </div>
          )}

          {/* Account status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>

            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-block w-2 h-2 rounded-full ${hasAuthAccount ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">
                {hasAuthAccount ? 'Login enabled' : 'No login account'}
              </span>
            </div>

            <p className="text-xs text-gray-500 capitalize mb-1">
              Role: <span className="font-medium text-gray-700">{person.role}</span>
            </p>
            <p className="text-xs text-gray-500">
              Added: {new Date(person.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* System emails */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">System Emails</h2>

            {actionMsg && (
              <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm mb-4 ${
                actionMsg.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <span className="mt-0.5">{actionMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                {actionMsg.text}
              </div>
            )}

            <div className="space-y-3">
              {/* Password reset */}
              <div>
                <button
                  onClick={handlePasswordReset}
                  disabled={sendingReset || !hasAuthAccount}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                >
                  {sendingReset ? 'Sending…' : 'Send password reset'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {hasAuthAccount
                    ? 'Sends a password reset link to their email.'
                    : 'User needs a login account first.'}
                </p>
              </div>

              {/* Invite */}
              <div>
                <button
                  onClick={handleInvite}
                  disabled={sendingInvite || hasAuthAccount}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                >
                  {sendingInvite ? 'Sending…' : 'Send org invitation'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {hasAuthAccount
                    ? 'This person already has a login account.'
                    : 'Creates a login account and sends an invite email.'}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
