import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import TimezoneSelect from '../components/TimezoneSelect'
import Button from '../components/ui/Button'

const ROLE_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  admin:            { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', label: 'Admin' },
  staff:            { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Staff' },
  mentor:           { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400', label: 'Mentor' },
  assistant_mentor: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-400', label: 'Asst. Mentor' },
  mentee:           { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400', label: 'Mentee' },
}

const CREATABLE_ROLES: { role: string; label: string; desc: string; table: 'staff' | 'mentees' }[] = [
  { role: 'mentor', label: 'Mentor', desc: 'Access the mentor portal and manage your mentees', table: 'staff' },
  { role: 'assistant_mentor', label: 'Assistant Mentor', desc: 'Support mentors and shadow mentee sessions', table: 'staff' },
  { role: 'mentee', label: 'Mentee', desc: 'Test the mentee experience and view courses', table: 'mentees' },
]

export default function ProfilePage() {
  const { profile, session, refreshProfile, allProfiles, activeProfileId, switchProfile } = useAuth()

  // Profile form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Account creation
  const [creatingRole, setCreatingRole] = useState<string | null>(null)
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function createRoleAccount(role: string, table: 'staff' | 'mentees') {
    if (!profile || !session?.user) return
    setCreatingRole(role)
    setAccountMsg(null)

    try {
      const record: Record<string, unknown> = {
        organization_id: profile.organization_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        user_id: session.user.id,
      }
      if (table === 'staff') {
        record.role = role
      }

      const { error } = await supabase.from(table).insert(record)
      if (error) { setAccountMsg({ type: 'error', text: error.message }); return }

      await refreshProfile()
      setAccountMsg({ type: 'success', text: `${ROLE_STYLES[role]?.label ?? role} account created. You can now switch to it from the top bar.` })
    } catch (err) {
      setAccountMsg({ type: 'error', text: (err as Error).message || 'Failed to create account' })
    } finally {
      setCreatingRole(null)
    }
  }

  // Password form state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name)
      setLastName(profile.last_name)
      setEmail(profile.email)
      setPhone(profile.phone ?? '')
      setStreet(profile.street ?? '')
      setCity(profile.city ?? '')
      setState(profile.state ?? '')
      setZip(profile.zip ?? '')
      setCountry(profile.country ?? '')
      setTimezone(profile.timezone ?? null)
    }
  }, [profile?.organization_id])

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setProfileMsg(null)
    setProfileSaving(true)

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
      })
      .eq('id', profile.id)

    setProfileSaving(false)

    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
      return
    }

    await refreshProfile()
    if (profile) await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'staff', entity_id: profile.id, details: { fields: 'personal_info', self: true } })
    setProfileMsg({ type: 'success', text: 'Your profile has been updated successfully.' })
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setPasswordSaving(true)
    try {
      if (!session) {
        setPasswordMsg({ type: 'error', text: 'No active session. Please sign in again.' })
        return
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ password: newPassword }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const msg = body.msg || body.message || body.error_description || `Error ${response.status}`
        setPasswordMsg({ type: 'error', text: msg })
        return
      }

      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg({ type: 'success', text: 'Your password has been updated successfully. Use your new password next time you sign in.' })
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out after 15 seconds' : err.message)
        : 'Unknown error'
      console.error('[ProfilePage] Password update failed:', message)
      setPasswordMsg({ type: 'error', text: message })
    } finally {
      setPasswordSaving(false)
    }
  }

  if (!profile) return null

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-2xl space-y-8">

      {/* --- Profile Info --- */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h2>

        <form onSubmit={handleProfileSubmit} className="space-y-5">
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

          {/* Name row */}
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
              <label htmlFor="profileEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input id="profileEmail" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone
              </label>
              <input id="phone" type="tel" value={phone}
                onChange={e => setPhone(e.target.value)} placeholder="Optional" className={inputClass} />
            </div>
          </div>

          {/* Street */}
          <div>
            <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-1.5">
              Street address
            </label>
            <input id="street" type="text" value={street}
              onChange={e => setStreet(e.target.value)} placeholder="Optional" className={inputClass} />
          </div>

          {/* City / State / Zip */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1.5">
                City
              </label>
              <input id="city" type="text" value={city}
                onChange={e => setCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1.5">
                State
              </label>
              <input id="state" type="text" value={state}
                onChange={e => setState(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-1.5">
                ZIP
              </label>
              <input id="zip" type="text" value={zip}
                onChange={e => setZip(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1.5">
              Country
            </label>
            <input id="country" type="text" value={country}
              onChange={e => setCountry(e.target.value)} className={inputClass} />
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="profileTimezone" className="block text-sm font-medium text-gray-700 mb-1.5">
              Timezone
            </label>
            <TimezoneSelect id="profileTimezone" value={timezone} onChange={setTimezone} />
            <p className="text-[11px] text-gray-400 mt-1">Used when showing your weekly availability and meeting times.</p>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>
      </div>

      {/* --- My Accounts --- */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">My Accounts</h2>
        <p className="text-sm text-gray-500 mb-6">Switch between roles or create additional accounts to test different user experiences.</p>

        {accountMsg && (
          <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm mb-4 ${
            accountMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className="mt-0.5">{accountMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {accountMsg.text}
          </div>
        )}

        {/* Existing accounts */}
        <div className="space-y-2 mb-6">
          {allProfiles.map(p => {
            const style = ROLE_STYLES[p.role] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400', label: p.role }
            const isActive = p.id === activeProfileId
            return (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 rounded-md border transition-colors ${isActive ? 'border-brand bg-brand-light' : 'border-gray-200'}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                <span className={`text-sm font-medium flex-1 ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                  {style.label}
                </span>
                {isActive ? (
                  <span className="text-xs font-medium text-brand">Active</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchProfile(p.id)}
                    className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
                  >
                    Switch
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Create additional accounts */}
        {profile.role === 'admin' && (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Add a role account</h3>
            <div className="space-y-2">
              {CREATABLE_ROLES.map(({ role, label, desc, table }) => {
                const alreadyExists = allProfiles.some(p => p.role === role)
                if (alreadyExists) return null
                const isCreating = creatingRole === role
                return (
                  <div key={role} className="flex items-center gap-3 px-4 py-3 rounded-md border border-dashed border-gray-300 hover:border-gray-400 transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ROLE_STYLES[role]?.dot ?? 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <Button variant="secondary" size="sm" type="button"
                      disabled={isCreating}
                      onClick={() => createRoleAccount(role, table)}>
                      {isCreating ? 'Creating…' : '+ Create'}
                    </Button>
                  </div>
                )
              })}
              {CREATABLE_ROLES.every(({ role }) => allProfiles.some(p => p.role === role)) && (
                <p className="text-xs text-gray-400 italic">All role accounts have been created.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* --- Change Password --- */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Change Password</h2>

        <form onSubmit={handlePasswordSubmit} className="space-y-5">
          {passwordMsg && (
            <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm ${
              passwordMsg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span className="mt-0.5">{passwordMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
              {passwordMsg.text}
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              New password
            </label>
            <input id="newPassword" type="password" required value={newPassword}
              autoComplete="new-password"
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters" className={inputClass} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm new password
            </label>
            <input id="confirmPassword" type="password" required value={confirmPassword}
              autoComplete="new-password"
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password" className={inputClass} />
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={passwordSaving}>{passwordSaving ? 'Updating…' : 'Update password'}</Button>
          </div>
        </form>
      </div>

    </div>
  )
}
