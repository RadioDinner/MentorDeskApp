import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import TimezoneSelect from '../components/TimezoneSelect'
import type { StaffMember, PayType, PayTypeSettings, RoleCategory, StaffRole, Offering } from '../types'
import { STAFF_ROLE_LABELS, STAFF_UMBRELLA_ROLES, PERCENTAGE_PAY_TYPES, OFFERING_LINKED_PAY_TYPES } from '../types'

const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: 'Hourly',
  salary: 'Salary',
  pct_monthly_profit: '% of monthly profit',
  pct_engagement_profit: '% of a specific engagement',
  pct_course_profit: '% of a specific course',
  pct_per_meeting: '% of each completed meeting',
}

const PAY_TYPE_HINTS: Record<PayType, string> = {
  hourly: 'Paid per hour worked.',
  salary: 'Fixed recurring amount.',
  pct_monthly_profit: 'A share of total monthly profit across all courses and engagements.',
  pct_engagement_profit: 'A share of the profit from one specific engagement. Select which engagement below.',
  pct_course_profit: 'A share of the profit from one specific course. Select which course below.',
  pct_per_meeting: 'A share of the per-meeting value (engagement price ÷ meetings per cycle) paid for every meeting the staff member completes with their paired mentees.',
}

function getRoleCategory(role: string): RoleCategory {
  if (role === 'mentor') return 'mentor'
  if (role === 'assistant_mentor') return 'assistant_mentor'
  // admin, operations, course_creator, and legacy 'staff' all fall under the
  // staff pay category.
  return 'staff'
}

export default function PersonEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()

  const [person, setPerson] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Personal info form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffRole>('staff')
  const [timezone, setTimezone] = useState<string | null>(null)
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
  const [payOfferingId, setPayOfferingId] = useState<string | null>(null)
  const [orgOfferings, setOrgOfferings] = useState<Offering[]>([])
  const [availablePayTypes, setAvailablePayTypes] = useState<PayType[]>([])
  const [maxActiveMentees, setMaxActiveMentees] = useState('')
  const [compensationSaving, setCompensationSaving] = useState(false)
  const [compensationMsg, setCompensationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // System actions
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)

  // Archive / Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
      setRole(p.role)
      setTimezone(p.timezone ?? null)
      setStreet(p.street ?? '')
      setCity(p.city ?? '')
      setState(p.state ?? '')
      setZip(p.zip ?? '')
      setCountry(p.country ?? '')
      setPayType(p.pay_type ?? '')
      setPayRate(p.pay_rate != null ? String(p.pay_rate) : '')
      setPayOfferingId(p.pay_offering_id ?? null)
      setMaxActiveMentees(p.max_active_mentees != null ? String(p.max_active_mentees) : '')

      // Fetch org pay settings + offerings (for pay_offering_id dropdown) in parallel
      const [orgRes, offeringsRes] = await Promise.all([
        supabase.from('organizations').select('pay_type_settings').eq('id', p.organization_id).single(),
        supabase.from('offerings').select('*').eq('organization_id', p.organization_id).order('name'),
      ])
      setOrgOfferings((offeringsRes.data ?? []) as Offering[])

      const orgData = orgRes.data
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
        timezone: timezone,
        role: role,
      })
      .eq('id', person.id)

    setSaving(false)

    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
      return
    }

    const oldVals = { first_name: person.first_name, last_name: person.last_name, email: person.email, phone: person.phone, street: person.street, city: person.city, state: person.state, zip: person.zip, country: person.country }
    const newVals = { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(), phone: phone.trim() || null, street: street.trim() || null, city: city.trim() || null, state: state.trim() || null, zip: zip.trim() || null, country: country.trim() || null }

    setPerson({ ...person, ...newVals })
    if (currentUser) await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'staff', entity_id: person.id, details: { name: `${firstName.trim()} ${lastName.trim()}`, fields: 'personal_info' }, old_values: oldVals, new_values: newVals })
    setProfileMsg({ type: 'success', text: 'Personal information has been updated.' })
  }

  async function handleCompensationSave(e: FormEvent) {
    e.preventDefault()
    if (!person) return
    setCompensationMsg(null)
    setCompensationSaving(true)

    const rateNum = payRate ? parseFloat(payRate) : null
    const maxMentees = maxActiveMentees ? parseInt(maxActiveMentees) : null
    // Only persist pay_offering_id when the selected pay type actually uses it.
    const offeringIdToSave = payType && OFFERING_LINKED_PAY_TYPES.includes(payType as PayType)
      ? (payOfferingId || null)
      : null

    const { error } = await supabase
      .from('staff')
      .update({
        pay_type: payType || null,
        pay_rate: rateNum,
        pay_offering_id: offeringIdToSave,
        max_active_mentees: maxMentees,
      })
      .eq('id', person.id)

    setCompensationSaving(false)

    if (error) {
      setCompensationMsg({ type: 'error', text: error.message })
      return
    }

    const oldComp = { pay_type: person.pay_type, pay_rate: person.pay_rate, pay_offering_id: person.pay_offering_id, max_active_mentees: person.max_active_mentees }
    const newComp = { pay_type: (payType as PayType) || null, pay_rate: rateNum, pay_offering_id: offeringIdToSave, max_active_mentees: maxMentees }
    setPerson({ ...person, ...newComp })
    if (currentUser) await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'staff', entity_id: person.id, details: { name: `${person.first_name} ${person.last_name}`, fields: 'compensation' }, old_values: oldComp, new_values: newComp })
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

  async function handleArchive() {
    if (!person || !currentUser) return
    const isArchived = !!person.archived_at
    const now = isArchived ? null : new Date().toISOString()
    const { error } = await supabase.from('staff').update({ archived_at: now }).eq('id', person.id)
    if (error) { setActionMsg({ type: 'error', text: error.message }); return }
    setPerson({ ...person, archived_at: now } as StaffMember)
    await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: isArchived ? 'unarchived' : 'archived', entity_type: 'staff', entity_id: person.id })
    setActionMsg({ type: 'success', text: isArchived ? 'Record restored.' : 'Record archived.' })
  }

  async function handleDelete() {
    if (!person || !currentUser) return
    setDeleting(true)
    const { error } = await supabase.from('staff').delete().eq('id', person.id)
    setDeleting(false)
    if (error) { setActionMsg({ type: 'error', text: error.message }); return }
    await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: 'deleted', entity_type: 'staff', entity_id: person.id })
    navigate(-1)
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>
  }

  if (fetchError || !person) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Person not found.'}
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

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
          <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Personal Information</h2>

            <form onSubmit={handleSave} className="space-y-5">
              {profileMsg && (
                <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm ${
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

              {/* Timezone */}
              <div>
                <label htmlFor="editTimezone" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Timezone
                </label>
                <TimezoneSelect id="editTimezone" value={timezone} onChange={setTimezone} />
                <p className="text-[11px] text-gray-400 mt-1">Used to interpret their weekly availability and display meeting times.</p>
              </div>

              {/* Role — only editable for staff-umbrella roles. Mentors and
                   Assistant Mentors have their role pinned by the page they
                   were created from. */}
              {STAFF_UMBRELLA_ROLES.includes(person.role) && (
                <div>
                  <label htmlFor="editRole" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Role
                  </label>
                  <select id="editRole" value={role}
                    onChange={e => setRole(e.target.value as StaffRole)}
                    className={inputClass + ' bg-white'}>
                    {STAFF_UMBRELLA_ROLES.map(r => (
                      <option key={r} value={r}>
                        {STAFF_ROLE_LABELS[r]}
                        {r === 'staff' ? ' (legacy)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Admin grants full access. Operations and Course Creator are starting templates — fine-tune individual module access below.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button type="submit" disabled={saving}
                  className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
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
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Compensation</h2>

              <form onSubmit={handleCompensationSave} className="space-y-4">
                {compensationMsg && (
                  <div className={`flex items-start gap-3 rounded border px-3 py-2 text-xs ${
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
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                  >
                    <option value="">Not set</option>
                    {availablePayTypes.map(pt => (
                      <option key={pt} value={pt}>{PAY_TYPE_LABELS[pt]}</option>
                    ))}
                  </select>
                </div>

                {payType && (
                  <>
                    <p className="text-[11px] text-gray-400 -mt-2">{PAY_TYPE_HINTS[payType as PayType]}</p>
                    <div>
                      <label htmlFor="payRate" className="block text-xs font-medium text-gray-700 mb-1">
                        {PERCENTAGE_PAY_TYPES.includes(payType as PayType) ? 'Percentage (%)' : 'Rate ($)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          {PERCENTAGE_PAY_TYPES.includes(payType as PayType) ? '%' : '$'}
                        </span>
                        <input
                          id="payRate"
                          type="number"
                          step="any"
                          min="0"
                          value={payRate}
                          onChange={e => setPayRate(e.target.value)}
                          placeholder="0"
                          className="w-full rounded border border-gray-300 pl-8 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Linked offering — only for pct_engagement_profit / pct_course_profit */}
                {payType && OFFERING_LINKED_PAY_TYPES.includes(payType as PayType) && (() => {
                  const wantedType = payType === 'pct_engagement_profit' ? 'engagement' : 'course'
                  const filtered = orgOfferings.filter(o => o.type === wantedType)
                  return (
                    <div>
                      <label htmlFor="payOffering" className="block text-xs font-medium text-gray-700 mb-1">
                        Paid from
                      </label>
                      <select
                        id="payOffering"
                        value={payOfferingId ?? ''}
                        onChange={e => setPayOfferingId(e.target.value || null)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                      >
                        <option value="">Select {wantedType}...</option>
                        {filtered.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      {filtered.length === 0 && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          No {wantedType}s exist yet. Create one before assigning this pay type.
                        </p>
                      )}
                    </div>
                  )
                })()}

                {(person.role === 'mentor' || person.role === 'assistant_mentor') && (
                  <div>
                    <label htmlFor="maxMentees" className="block text-xs font-medium text-gray-700 mb-1">
                      Max active mentees
                    </label>
                    <input
                      id="maxMentees"
                      type="number"
                      min="1"
                      value={maxActiveMentees}
                      onChange={e => setMaxActiveMentees(e.target.value)}
                      placeholder="No limit"
                      className={inputClass + ' max-w-32'}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Leave blank for no limit. When this mentor reaches their cap, they'll be greyed out in the pairing screen.
                    </p>
                  </div>
                )}

                <button type="submit" disabled={compensationSaving}
                  className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {compensationSaving ? 'Saving…' : 'Save'}
                </button>
              </form>
            </div>
          )}

          {/* Availability — mentors and assistant mentors only */}
          {(person.role === 'mentor' || person.role === 'assistant_mentor') && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Availability Schedule</h2>
              <p className="text-xs text-gray-500 mb-4">Manage when {person.first_name} is available for mentee sessions.</p>
              <button
                type="button"
                onClick={() => navigate(`/people/${person.id}/availability`)}
                className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center justify-between"
              >
                <span>Edit Availability</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          )}

          {/* Account status */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
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
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">System Emails</h2>

            {actionMsg && (
              <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm mb-4 ${
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
                  className="w-full rounded border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
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
                  className="w-full rounded border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
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

          {/* Danger Zone */}
          <div className="bg-white rounded-md border border-red-200 px-6 py-6">
            <h2 className="text-base font-semibold text-red-600 mb-4">Danger Zone</h2>
            <div className="space-y-3">
              {/* Archive / Restore */}
              <div>
                <button type="button" onClick={handleArchive}
                  className={`w-full rounded border px-4 py-2.5 text-sm font-medium transition-colors text-left ${person.archived_at ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                  {person.archived_at ? 'Restore this person' : 'Archive this person'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {person.archived_at
                    ? 'Restoring will make them active again.'
                    : 'Archiving hides them from active lists. Can be restored later.'}
                </p>
              </div>

              {/* Delete */}
              {!showDeleteConfirm ? (
                <div>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
                    Delete this person
                  </button>
                  <p className="text-xs text-gray-400 mt-1 px-1">Permanently remove this person and all their data.</p>
                </div>
              ) : (
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure?</p>
                  <p className="text-xs text-red-600">
                    This will permanently delete <strong>{person.first_name} {person.last_name}</strong> and all associated data. This action cannot be undone.
                  </p>
                  <p className="text-xs text-gray-500">
                    Would you rather <button type="button" onClick={() => { handleArchive(); setShowDeleteConfirm(false) }} className="text-amber-600 font-medium underline hover:text-amber-700">archive</button> them instead? Archived records can be restored later.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" disabled={deleting} onClick={handleDelete}
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
