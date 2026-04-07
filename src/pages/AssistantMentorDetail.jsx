import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import MessagingPreferences from '../components/MessagingPreferences'
import PhoneInput from '../components/PhoneInput'
import { Mail, RefreshCw, Copy, Check, Eye, EyeOff, ShieldCheck, ShieldOff } from 'lucide-react'
import { useRole } from '../context/RoleContext'

export default function AssistantMentorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organizationId } = useRole()
  const [form, setForm] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [lockCountry, setLockCountry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [enabledPayTypes, setEnabledPayTypes] = useState(['percentage', 'monthly', 'per_meeting', 'hourly'])

  // Account management state
  const [emailActionLoading, setEmailActionLoading] = useState(null)
  const [emailActionMsg, setEmailActionMsg] = useState(null)
  const [tempPassword, setTempPassword] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [pwCopied, setPwCopied] = useState(false)
  const [authLinked, setAuthLinked] = useState(undefined)

  useEffect(() => {
    fetchPartner()
    checkAuthLinked()
    supabase.from('settings').select('key, value').eq('organization_id', organizationId).then(({ data }) => {
      if (data) {
        const get = k => data.find(s => s.key === k)?.value
        const lock = get('lock_country') === 'true'
        const country = get('default_country')
        setLockCountry(lock && !!country)
        const enabled = [
          get('mentor_pay_percentage_enabled') !== 'false' && 'percentage',
          get('mentor_pay_monthly_enabled') !== 'false' && 'monthly',
          get('mentor_pay_per_meeting_enabled') !== 'false' && 'per_meeting',
          get('mentor_pay_hourly_enabled') !== 'false' && 'hourly',
        ].filter(Boolean)
        if (enabled.length > 0) setEnabledPayTypes(enabled)
      }
    })
  }, [id])

  async function fetchPartner() {
    const { data, error: err } = await supabase.from('assistant_mentors').select('*').eq('id', id).single()
    if (err) { setError(err.message); return }
    setForm(data)
  }

  async function checkAuthLinked() {
    const { data } = await supabase.from('profiles').select('id').eq('assistant_mentor_id', id).limit(1)
    setAuthLinked(data && data.length > 0)
  }

  async function handleSendInvite() {
    if (!form?.email) return
    setEmailActionLoading('invite')
    setEmailActionMsg(null)
    setTempPassword(null)
    const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
      body: {
        email: form.email, role: 'assistantmentor', entity_id: id,
        first_name: form.first_name, last_name: form.last_name,
        redirect_to: `${window.location.origin}/set-password`,
        organization_id: organizationId,
      },
    })
    setEmailActionLoading(null)
    let errText = null
    if (fnError) {
      try { const body = await fnError.context?.json(); errText = body?.error || fnError.message } catch { errText = fnError.message }
    } else if (data?.error) { errText = data.error }
    if (errText) {
      setEmailActionMsg({ type: 'error', text: errText })
    } else {
      const msg = data?.added_role
        ? `Assistant Mentor role added to existing account (${form.email}). They can now switch dashboards.`
        : `Account created. A password reset email has been sent to ${form.email}.`
      setEmailActionMsg({ type: 'success', text: msg })
      if (data?.temp_password) { setTempPassword(data.temp_password); setShowPw(false); setPwCopied(false) }
      setAuthLinked(true)
    }
  }

  async function handleResendWelcome() {
    if (!form?.email) return
    setEmailActionLoading('welcome')
    setEmailActionMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: `${window.location.origin}/set-password` })
    setEmailActionLoading(null)
    setEmailActionMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: `Welcome email sent to ${form.email}.` })
  }

  async function handleSendPasswordReset() {
    if (!form?.email) return
    setEmailActionLoading('reset')
    setEmailActionMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: `${window.location.origin}/set-password` })
    setEmailActionLoading(null)
    setEmailActionMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: `Password reset email sent to ${form.email}.` })
  }

  function copyTempPassword() {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword)
    setPwCopied(true)
    setTimeout(() => setPwCopied(false), 2000)
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const contactFields = {
      first_name: form.first_name, last_name: form.last_name,
      email: form.email, phone: form.phone,
      address_street1: form.address_street1, address_street2: form.address_street2,
      address_city: form.address_city, address_state: form.address_state,
      address_zip: form.address_zip, address_country: form.address_country,
      messaging_methods: form.messaging_methods, preferred_messaging: form.preferred_messaging,
    }

    const { error: updateError } = await supabase.from('assistant_mentors').update({
      ...contactFields,
      start_date: form.start_date, notes: form.notes,
      pay_type: form.pay_type || 'percentage',
      pay_percentage: form.pay_type === 'percentage' && form.pay_percentage ? parseFloat(form.pay_percentage) : null,
      pay_rate: form.pay_type !== 'percentage' && form.pay_rate ? parseFloat(form.pay_rate) : null,
    }).eq('id', id)

    if (updateError) { setError(updateError.message); setSaving(false); return }

    if (form.linked_mentor_id) {
      await supabase.from('mentors').update(contactFields).eq('id', form.linked_mentor_id)
    }

    if (avatarFile) {
      const result = await uploadAvatar(avatarFile, 'assistant_mentors', id)
      if (result.error) { setError(`Saved but photo upload failed: ${result.error}`); setSaving(false); return }
      const { error: urlError } = await supabase.from('assistant_mentors').update({ avatar_url: result.publicUrl }).eq('id', id)
      if (urlError) { setError(`Saved but failed to link photo: ${urlError.message}`); setSaving(false); return }
    }

    navigate('/admin/assistant-mentors')
  }

  if (!form) return <div style={st.loading}>{error || 'Loading...'}</div>

  return (
    <div style={st.container}>
      <div style={st.header}>
        <button style={st.back} onClick={() => navigate('/admin/assistant-mentors')}>← Assistant Mentors</button>
        <AvatarUpload
          url={form.avatar_url}
          initials={`${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}`}
          gradient="linear-gradient(135deg, #10b981, #0d9488)"
          onChange={setAvatarFile}
          size={64}
        />
        <div>
          <h1 style={st.title}>{form.first_name} {form.last_name}</h1>
          <p style={st.subtitle}>Assistant Mentor since {form.start_date ? new Date(form.start_date).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      {success && <p style={st.success}>{success}</p>}
      {error && <p style={st.error}>{error}</p>}

      <form onSubmit={handleSave}>
        <div style={st.twoCol}>
          {/* Left column */}
          <div style={st.col}>
            <Section title="Personal Info">
              <div style={st.row}>
                <Field label="First Name" name="first_name" value={form.first_name || ''} onChange={handleChange} required />
                <Field label="Last Name" name="last_name" value={form.last_name || ''} onChange={handleChange} required />
              </div>
              <div style={st.row}>
                <Field label="Email" name="email" type="email" value={form.email || ''} onChange={handleChange} />
                <div style={st.fieldGroup}>
                  <label style={st.label}>Phone *</label>
                  <PhoneInput name="phone" value={form.phone || ''} onChange={handleChange} required />
                </div>
              </div>
              <Field label="Start Date" name="start_date" type="date" value={form.start_date || ''} onChange={handleChange} />
            </Section>

            <Section title="Address">
              <Field label="Street Address" name="address_street1" value={form.address_street1 || ''} onChange={handleChange} />
              <Field label="Address Line 2" name="address_street2" value={form.address_street2 || ''} onChange={handleChange} />
              <div style={st.row}>
                <Field label="City" name="address_city" value={form.address_city || ''} onChange={handleChange} />
                <div style={st.fieldGroup}>
                  <label style={st.label}>State</label>
                  <select name="address_state" value={form.address_state || ''} onChange={handleChange} style={st.input}>
                    {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <Field label="ZIP" name="address_zip" value={form.address_zip || ''} onChange={handleChange} />
              </div>
              {lockCountry ? (
                <div style={st.fieldGroup}>
                  <label style={st.label}>Country</label>
                  <div style={st.lockedField}><span>{form.address_country}</span><span style={st.lockedBadge}>Locked</span></div>
                </div>
              ) : (
                <div style={st.fieldGroup}>
                  <label style={st.label}>Country</label>
                  <select name="address_country" value={form.address_country || ''} onChange={handleChange} style={st.input}>
                    <option value="">— Select country —</option>
                    {COUNTRIES.map((c, i) => c.disabled ? <option key={i} disabled>{c.label}</option> : <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </Section>
          </div>

          {/* Right column */}
          <div style={st.col}>
            <Section title="Compensation">
              <div style={st.fieldGroup}>
                <label style={st.label}>Pay Type</label>
                <select name="pay_type" value={form.pay_type || 'percentage'} onChange={handleChange} style={st.input}>
                  {enabledPayTypes.includes('percentage') && <option value="percentage">Percentage of Subscription Revenue</option>}
                  {enabledPayTypes.includes('monthly') && <option value="monthly">Flat Monthly Rate</option>}
                  {enabledPayTypes.includes('per_meeting') && <option value="per_meeting">Per-Meeting Rate</option>}
                  {enabledPayTypes.includes('hourly') && <option value="hourly">Hourly Rate</option>}
                </select>
                <span style={st.payTypeHint}>
                  {(form.pay_type === 'percentage' || !form.pay_type) && 'Earns a percentage of each mentee\'s arrangement subscription.'}
                  {form.pay_type === 'monthly' && 'Receives a fixed dollar amount each month.'}
                  {form.pay_type === 'per_meeting' && 'Paid a flat rate for every completed meeting.'}
                  {form.pay_type === 'hourly' && 'Paid per hour worked. Hours tracking is in development.'}
                </span>
              </div>
              <CompensationInput form={form} onChange={handleChange} />
            </Section>

            <Section title="Communication Methods">
              <MessagingPreferences
                methods={form.messaging_methods || []}
                preferred={form.preferred_messaging || ''}
                onChange={({ methods, preferred }) => setForm(f => ({ ...f, messaging_methods: methods, preferred_messaging: preferred }))}
              />
            </Section>

            <Section title="Notes">
              <textarea name="notes" value={form.notes || ''} onChange={handleChange} rows={3} placeholder="Any notes..." style={{ ...st.input, resize: 'vertical' }} />
            </Section>

            <Section title="Account Management">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                {authLinked === undefined && <span style={{ color: '#718096', fontSize: '0.85rem' }}>Checking…</span>}
                {authLinked === true && <><ShieldCheck size={15} color="#16a34a" /><span style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600 }}>Portal Account Linked</span></>}
                {authLinked === false && <><ShieldOff size={15} color="#dc2626" /><span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>No Portal Account</span></>}
              </div>
              {emailActionMsg && <div style={emailActionMsg.type === 'success' ? st.acctSuccess : st.acctError}>{emailActionMsg.text}</div>}
              {tempPassword && (
                <div style={st.tempPwCard}>
                  <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#374151', fontWeight: 600 }}>Temporary Password</p>
                  <div style={st.tempPwRow}>
                    <code style={st.tempPwCode}>{showPw ? tempPassword : '••••••••••••••••'}</code>
                    <button type="button" style={st.tempPwBtn} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                    <button type="button" style={st.tempPwBtn} onClick={copyTempPassword}>{pwCopied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}</button>
                  </div>
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Shown once. Should be reset after first login.</p>
                </div>
              )}
              {form?.email ? (
                <div style={st.emailBtnRow}>
                  {authLinked === false && (
                    <button type="button" style={st.emailBtnPrimary} onClick={handleSendInvite} disabled={!!emailActionLoading}>
                      <Mail size={14} /> {emailActionLoading === 'invite' ? 'Creating…' : 'Create Account & Send Invite'}
                    </button>
                  )}
                  <button type="button" style={st.emailBtn} onClick={handleResendWelcome} disabled={!!emailActionLoading}>
                    <Mail size={14} /> {emailActionLoading === 'welcome' ? 'Sending…' : 'Resend Welcome Email'}
                  </button>
                  <button type="button" style={st.emailBtn} onClick={handleSendPasswordReset} disabled={!!emailActionLoading}>
                    <RefreshCw size={14} /> {emailActionLoading === 'reset' ? 'Sending…' : 'Send Password Reset'}
                  </button>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>Add an email address to enable account management.</p>
              )}
            </Section>
          </div>
        </div>

        <div style={st.formActions}>
          <button type="button" style={st.cancelBtn} onClick={() => navigate('/admin/assistant-mentors')}>Cancel</button>
          <button type="submit" style={st.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  )
}

function CompensationInput({ form, onChange }) {
  const payType = form.pay_type || 'percentage'
  const configs = {
    percentage: { label: 'Pay Percentage', name: 'pay_percentage', value: form.pay_percentage, suffix: '%', width: '100px' },
    monthly: { label: 'Monthly Rate', name: 'pay_rate', value: form.pay_rate, prefix: '$', suffix: '/month', width: '120px' },
    per_meeting: { label: 'Rate per Meeting', name: 'pay_rate', value: form.pay_rate, prefix: '$', suffix: '/meeting', width: '120px' },
    hourly: { label: 'Hourly Rate', name: 'pay_rate', value: form.pay_rate, prefix: '$', suffix: '/hour', width: '120px' },
  }
  const cfg = configs[payType]
  if (!cfg) return null
  return (
    <div style={st.fieldGroup}>
      <label style={st.label}>{cfg.label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {cfg.prefix && <span style={{ fontSize: '1rem', color: '#4a5568', fontWeight: 600 }}>{cfg.prefix}</span>}
        <input style={{ ...st.input, width: cfg.width }} type="number" name={cfg.name} value={cfg.value ?? ''} onChange={onChange} min="0" max={payType === 'percentage' ? '100' : undefined} step="0.01" placeholder="0.00" />
        {cfg.suffix && <span style={{ fontSize: '0.85rem', color: '#718096' }}>{cfg.suffix}</span>}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={st.section}>
      <h2 style={st.sectionTitle}>{title}</h2>
      <div style={st.sectionBody}>{children}</div>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', required }) {
  return (
    <div style={st.fieldGroup}>
      <label style={st.label}>{label}{required && ' *'}</label>
      <input style={st.input} type={type} name={name} value={value} onChange={onChange} required={required} />
    </div>
  )
}

const st = {
  container: { padding: '2rem' },
  loading: { padding: '3rem', textAlign: 'center', color: '#718096' },
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  back: { background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, padding: 0 },
  title: { margin: '0 0 0.15rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, color: '#9ca3af', fontSize: '0.875rem' },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' },
  col: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },

  section: { backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #f3f4f6' },
  sectionTitle: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.55rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  payTypeHint: { fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' },
  lockedField: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 7, backgroundColor: '#f9fafb', color: '#6b7280', fontSize: '0.875rem' },
  lockedBadge: { fontSize: '0.7rem', backgroundColor: '#e5e7eb', color: '#9ca3af', borderRadius: 4, padding: '0.15rem 0.5rem', fontWeight: 600 },

  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.25rem' },
  cancelBtn: { padding: '0.55rem 1.2rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
  saveBtn: { padding: '0.55rem 1.4rem', background: 'linear-gradient(135deg, #10b981, #0d9488)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },

  success: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.65rem 1rem', color: '#15803d', fontSize: '0.875rem', marginBottom: '0.5rem' },
  error: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.5rem' },

  acctSuccess: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.5rem 0.8rem', color: '#15803d', fontSize: '0.82rem', marginBottom: '0.35rem' },
  acctError: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.5rem 0.8rem', color: '#dc2626', fontSize: '0.82rem', marginBottom: '0.35rem' },
  tempPwCard: { backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.5rem' },
  tempPwRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '0.45rem 0.7rem' },
  tempPwCode: { flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', color: '#111827', letterSpacing: '0.5px' },
  tempPwBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex', alignItems: 'center' },
  emailBtnRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  emailBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 },
  emailBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', backgroundColor: '#fff', color: '#6b7280', border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 },
}
