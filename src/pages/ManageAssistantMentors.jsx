import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput from '../components/PhoneInput'
import { Plus, X, HeartHandshake, Copy, Check, Eye, EyeOff, Search } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'
import MessagingPreferences from '../components/MessagingPreferences'

const buildEmpty = (defaultCountry = '') => ({
  first_name: '', last_name: '', email: '', phone: '',
  address_street1: '', address_street2: '',
  address_city: '', address_state: '', address_zip: '',
  address_country: defaultCountry,
  start_date: new Date().toISOString().split('T')[0],
  notes: '',
  pay_type: 'percentage', pay_percentage: '', pay_rate: '',
  messaging_methods: [], preferred_messaging: '',
})

export default function ManageAssistantMentors() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { organizationId, checkLimit, refreshEntityCounts, plan } = useRole()
  const partnerLimit = checkLimit('assistant_mentors')
  const [partners, setPartners] = useState([])
  const [defaultCountry, setDefaultCountry] = useState('')
  const [lockCountry, setLockCountry] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(buildEmpty())
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(new Set())
  const [inviteMsg, setInviteMsg] = useState({})
  const [tempPasswordModal, setTempPasswordModal] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    fetchPartners()
    loadSettings()
  }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
    if (data) {
      const country = data.find(s => s.key === 'default_country')?.value || ''
      const lock = data.find(s => s.key === 'lock_country')?.value === 'true'
      setDefaultCountry(country)
      setLockCountry(lock)
      if (searchParams.get('action') === 'add') {
        setForm(buildEmpty(country))
        setShowForm(true)
      }
    }
  }

  async function fetchPartners() {
    const { data } = await supabase.from('assistant_mentors').select('*').order('last_name')
    if (data) setPartners(data)
  }

  function openForm() {
    setForm(buildEmpty(defaultCountry))
    setAvatarFile(null)
    setError(null)
    setSuccess(null)
    setShowForm(true)
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: inserted, error: insertError } = await supabase.from('assistant_mentors').insert({
      first_name: form.first_name, last_name: form.last_name,
      email: form.email, phone: form.phone,
      address_street1: form.address_street1, address_street2: form.address_street2,
      address_city: form.address_city, address_state: form.address_state,
      address_zip: form.address_zip, address_country: form.address_country,
      start_date: form.start_date, notes: form.notes,
      pay_type: form.pay_type || 'percentage',
      pay_percentage: form.pay_type === 'percentage' && form.pay_percentage ? parseFloat(form.pay_percentage) : null,
      pay_rate: form.pay_type !== 'percentage' && form.pay_rate ? parseFloat(form.pay_rate) : null,
      messaging_methods: form.messaging_methods, preferred_messaging: form.preferred_messaging,
      organization_id: organizationId,
    }).select()

    if (insertError) { setError(insertError.message); setSaving(false); return }

    const newId = inserted?.[0]?.id
    if (avatarFile && newId) {
      const result = await uploadAvatar(avatarFile, 'assistant_mentors', newId)
      if (result.error) {
        setError(`Assistant mentor saved but photo upload failed: ${result.error}`)
      } else {
        const { error: urlError } = await supabase.from('assistant_mentors').update({ avatar_url: result.publicUrl }).eq('id', newId)
        if (urlError) setError(`Assistant mentor saved but failed to link photo: ${urlError.message}`)
      }
    }

    setSuccess(`${form.first_name} ${form.last_name} added.`)
    setForm(buildEmpty(defaultCountry))
    setAvatarFile(null)
    setShowForm(false)
    fetchPartners()
    refreshEntityCounts()
    setSaving(false)
  }

  async function handleDelete(partner) {
    const { error } = await supabase.from('assistant_mentors').delete().eq('id', partner.id)
    if (!error) { setConfirmDelete(null); fetchPartners(); refreshEntityCounts() }
    else setError(error.message)
  }

  async function handleInvite(partner) {
    if (!partner.email) return
    setInviting(prev => new Set(prev).add(partner.id))
    setInviteMsg(prev => ({ ...prev, [partner.id]: null }))

    const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
      body: {
        email: partner.email,
        role: 'assistantmentor',
        entity_id: partner.id,
        first_name: partner.first_name,
        last_name: partner.last_name,
        redirect_to: `${window.location.origin}/set-password`,
        organization_id: organizationId,
      },
    })

    setInviting(prev => { const next = new Set(prev); next.delete(partner.id); return next })

    let errText = null
    if (fnError) {
      try {
        const body = await fnError.context?.json()
        errText = body?.error || fnError.message
      } catch { errText = fnError.message }
    } else if (data?.error) {
      errText = data.error
    }

    if (errText) {
      setInviteMsg(prev => ({ ...prev, [partner.id]: { type: 'error', text: errText } }))
    } else {
      setInviteMsg(prev => ({
        ...prev,
        [partner.id]: { type: 'success', text: `Account created for ${partner.first_name}. A password reset email has been sent.` },
      }))
      if (data?.temp_password) {
        setTempPasswordModal({
          name: `${partner.first_name} ${partner.last_name}`,
          email: partner.email,
          password: data.temp_password,
        })
        setShowPassword(false)
        setCopied(false)
      }
    }
  }

  function copyTempPassword() {
    if (!tempPasswordModal?.password) return
    navigator.clipboard.writeText(tempPasswordModal.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filtered = partners.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Assistant Mentors</h1>
          <p style={s.pageSubtitle}>{partners.length} assistant mentor{partners.length !== 1 ? 's' : ''} in the program</p>
        </div>
        <button
          style={{ ...s.addBtn, ...(partnerLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          onClick={partnerLimit.atLimit ? undefined : openForm}
          disabled={partnerLimit.atLimit}
        ><Plus size={15} strokeWidth={2.5} /> Add Assistant Mentor</button>
      </div>

      {partnerLimit.atLimit && (
        <PlanLimitBanner entityLabel="assistant_mentors" current={partnerLimit.current} max={partnerLimit.max} plan={plan} />
      )}

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {showForm && (
        <div style={s.formCard}>
          <div style={s.formCardHeader}>
            <h2 style={s.formTitle}>New Assistant Mentor</h2>
            <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} style={s.form}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
              <AvatarUpload
                initials={`${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}` || '?'}
                gradient="linear-gradient(135deg, #10b981, #0d9488)"
                onChange={setAvatarFile}
              />
            </div>
            <div style={s.sectionLabel}>Basic Info</div>
            <div style={s.row}>
              <Field label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} required />
              <Field label="Last Name *" name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
            <div style={s.row}>
              <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
              <div style={s.fieldGroup}>
                <label style={s.label}>Phone *</label>
                <PhoneInput name="phone" value={form.phone} onChange={handleChange} required />
              </div>
            </div>
            <div style={s.row}>
              <Field label="Start Date" name="start_date" type="date" value={form.start_date} onChange={handleChange} />
            </div>
            <div style={s.sectionLabel}>Address</div>
            <Field label="Street Address" name="address_street1" value={form.address_street1} onChange={handleChange} />
            <Field label="Address Line 2" name="address_street2" value={form.address_street2} onChange={handleChange} />
            <div style={s.row}>
              <Field label="City" name="address_city" value={form.address_city} onChange={handleChange} />
              <div style={s.fieldGroup}>
                <label style={s.label}>State</label>
                <select name="address_state" value={form.address_state} onChange={handleChange} style={s.input}>
                  {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <Field label="ZIP" name="address_zip" value={form.address_zip} onChange={handleChange} />
            </div>
            {lockCountry && defaultCountry ? (
              <div style={s.fieldGroup}>
                <label style={s.label}>Country</label>
                <div style={s.lockedField}><span>{defaultCountry}</span><span style={s.lockedBadge}>Locked</span></div>
              </div>
            ) : (
              <div style={s.fieldGroup}>
                <label style={s.label}>Country</label>
                <select name="address_country" value={form.address_country} onChange={handleChange} style={s.input}>
                  <option value="">— Select country —</option>
                  {COUNTRIES.map((c, i) => c.disabled
                    ? <option key={i} disabled>{c.label}</option>
                    : <option key={c.value} value={c.value}>{c.label}</option>
                  )}
                </select>
              </div>
            )}
            <div style={s.sectionLabel}>Compensation</div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Pay Type</label>
              <select name="pay_type" value={form.pay_type || 'percentage'} onChange={handleChange} style={s.input}>
                <option value="percentage">Percentage of Subscription Revenue</option>
                <option value="monthly">Flat Monthly Rate</option>
                <option value="per_meeting">Per-Meeting Rate</option>
                <option value="hourly">Hourly Rate</option>
              </select>
            </div>
            {(form.pay_type === 'percentage' || !form.pay_type) && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Pay Percentage (%)</label>
                <input style={s.input} type="number" name="pay_percentage" value={form.pay_percentage || ''} onChange={handleChange} min="0" max="100" step="0.01" placeholder="e.g. 40" />
              </div>
            )}
            {form.pay_type && form.pay_type !== 'percentage' && (
              <div style={s.fieldGroup}>
                <label style={s.label}>{form.pay_type === 'monthly' ? 'Monthly Rate ($)' : form.pay_type === 'per_meeting' ? 'Rate per Meeting ($)' : 'Hourly Rate ($)'}</label>
                <input style={s.input} type="number" name="pay_rate" value={form.pay_rate || ''} onChange={handleChange} min="0" step="0.01" placeholder="e.g. 25.00" />
              </div>
            )}

            <div style={s.fieldGroup}>
              <label style={s.label}>Notes</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={{ ...s.input, resize: 'vertical' }} />
            </div>
            <div style={s.sectionLabel}>Communication Methods</div>
            <MessagingPreferences
              methods={form.messaging_methods}
              preferred={form.preferred_messaging}
              onChange={({ methods, preferred }) => setForm(f => ({ ...f, messaging_methods: methods, preferred_messaging: preferred }))}
            />
            <div style={s.formActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>{saving ? 'Saving…' : 'Save Assistant Mentor'}</button>
            </div>
          </form>
        </div>
      )}

      <div style={s.filterBar}>
        <div style={s.searchWrap}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input style={s.searchInput} placeholder="Search assistant mentors…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div style={s.countRow}>Showing {filtered.length} of {partners.length} assistant mentor{partners.length !== 1 ? 's' : ''}</div>

      <div style={s.list}>
        {filtered.length === 0 ? (
          <div style={s.empty}>
            <HeartHandshake size={40} color="#d1d5db" strokeWidth={1.5} />
            <p style={{ color: '#9ca3af' }}>No assistant mentors added yet.</p>
          </div>
        ) : filtered.map(p => {
          const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`
          const msg = inviteMsg[p.id]
          return (
            <div key={p.id}>
              <div style={s.row2}>
                <div style={s.avatarSmall}>
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : initials
                  }
                </div>
                <div style={s.personMain}>
                  <div style={s.personName}>{p.first_name} {p.last_name}</div>
                  <div style={s.personEmail}>{p.email || '—'}</div>
                </div>
                {p.email && (
                  <button style={s.inviteBtn} disabled={inviting.has(p.id)} onClick={() => handleInvite(p)}>
                    {inviting.has(p.id) ? 'Sending…' : 'Send Invite'}
                  </button>
                )}
                <button style={s.assignRowBtn} onClick={() => navigate(`/admin/assistant-mentors/${p.id}/assign`)}>Assign Mentees</button>
                <button style={s.editRowBtn} onClick={() => navigate(`/admin/assistant-mentors/${p.id}`)}>Edit</button>
                <button style={s.deleteRowBtn} onClick={() => setConfirmDelete(p)}>Remove</button>
              </div>
              {msg && <div style={msg.type === 'success' ? s.msgSuccess : s.msgError}>{msg.text}</div>}
            </div>
          )
        })}
      </div>

      {tempPasswordModal && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={s.dialogTitle}>Account Created</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }} onClick={() => setTempPasswordModal(null)}><X size={18} /></button>
            </div>
            <div style={s.tempPwCard}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                A portal account has been created for <strong>{tempPasswordModal.name}</strong> ({tempPasswordModal.email}).
              </p>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                A password reset email has been sent. You can also share the temporary password below:
              </p>
              <div style={s.tempPwRow}>
                <code style={s.tempPwCode}>{showPassword ? tempPasswordModal.password : '••••••••••••••••'}</code>
                <button style={s.tempPwBtn} onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button style={s.tempPwBtn} onClick={copyTempPassword}>
                  {copied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                </button>
              </div>
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                This password is shown once. They should reset it after first login.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={s.saveBtn} onClick={() => setTempPasswordModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <h3 style={s.dialogTitle}>Remove Assistant Mentor?</h3>
            <p style={s.dialogText}>Remove <strong>{confirmDelete.first_name} {confirmDelete.last_name}</strong>? This cannot be undone.</p>
            <div style={s.dialogActions}>
              <button style={s.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ ...s.saveBtn, background: '#ef4444' }} onClick={() => handleDelete(confirmDelete)}>Yes, Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', required }) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>{label}</label>
      <input style={s.input} type={type} name={name} value={value} onChange={onChange} required={required} />
    </div>
  )
}

const s = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'linear-gradient(135deg, #10b981, #0d9488)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(16,185,129,0.3)', cursor: 'pointer' },
  formCard: { backgroundColor: '#fff', borderRadius: 7, boxShadow: 'var(--shadow-md)', marginBottom: '1.5rem', overflow: 'hidden', border: '1px solid #f3f4f6' },
  formCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6' },
  formTitle: { fontSize: '1rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1.5rem' },
  sectionLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.25rem' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  lockedField: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, backgroundColor: '#f9fafb', color: '#6b7280' },
  lockedBadge: { fontSize: '0.7rem', backgroundColor: '#e5e7eb', color: '#9ca3af', borderRadius: 4, padding: '0.15rem 0.5rem', fontWeight: 600 },
  checkboxRow: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap', paddingTop: '0.25rem' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' },
  cancelBtn: { padding: '0.6rem 1.1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'linear-gradient(135deg, #10b981, #0d9488)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' },
  filterBar: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1, minWidth: 200 },
  searchInput: { padding: '0.6rem 0.85rem 0.6rem 2rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  countRow: { fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row2: { display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#fff', padding: '0.85rem 1.1rem', borderRadius: 7, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', flexWrap: 'wrap' },
  avatarSmall: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #0d9488)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, overflow: 'hidden' },
  personMain: { flex: 1, minWidth: 160 },
  personName: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  personEmail: { color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' },
  assignRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #a7f3d0', borderRadius: 7, color: '#059669', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  editRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #a7f3d0', borderRadius: 7, color: '#059669', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  inviteBtn: { padding: '0.3rem 0.75rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 7, color: '#fff', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  deleteRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  msgSuccess: { fontSize: '0.78rem', color: '#15803d', backgroundColor: '#f0fdf4', padding: '0.35rem 1.1rem 0.35rem 3.5rem', borderRadius: '0 0 8px 8px' },
  msgError: { fontSize: '0.78rem', color: '#dc2626', backgroundColor: '#fef2f2', padding: '0.35rem 1.1rem 0.35rem 3.5rem', borderRadius: '0 0 8px 8px' },
  tempPwCard: { backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem 1.25rem' },
  tempPwRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.6rem 0.8rem' },
  tempPwCode: { flex: 1, fontFamily: 'monospace', fontSize: '1rem', color: '#111827', letterSpacing: '0.5px' },
  tempPwBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex', alignItems: 'center' },
  empty: { textAlign: 'center', padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog: { backgroundColor: '#fff', borderRadius: 7, padding: '2rem', maxWidth: 480, width: '90%', boxShadow: 'var(--shadow-lg)' },
  dialogTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' },
  dialogText: { color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem', fontSize: '0.9rem' },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
}
