import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput from '../components/PhoneInput'
import { Copy, Check, X, Eye, EyeOff, Search } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'
import MessagingPreferences from '../components/MessagingPreferences'

const buildEmptyForm = (defaultCountry = '') => ({
  first_name: '', last_name: '', email: '', phone: '',
  address_street1: '', address_street2: '',
  address_city: '', address_state: '', address_zip: '',
  address_country: defaultCountry,
  notes: '',
  messaging_methods: [], preferred_messaging: '',
})

export default function ManageMentors() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { organizationId, checkLimit, refreshEntityCounts, plan } = useRole()
  const mentorLimit = checkLimit('mentors')
  const [mentors, setMentors] = useState([])
  const [defaultCountry, setDefaultCountry] = useState('')
  const [lockCountry, setLockCountry] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(buildEmptyForm())
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [inviting, setInviting] = useState(new Set())
  const [inviteMsg, setInviteMsg] = useState({})
  const [tempPasswordModal, setTempPasswordModal] = useState(null) // { name, email, password }
  const [copied, setCopied] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchMentors()
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
        setForm(buildEmptyForm(country))
        setShowForm(true)
      }
    }
  }

  async function fetchMentors() {
    const { data } = await supabase.from('mentors').select('*').order('last_name')
    if (data) setMentors(data)
  }

  function openForm() {
    setForm(buildEmptyForm(defaultCountry))
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
    setSuccess(null)

    const { data: inserted, error: insertError } = await supabase.from('mentors').insert({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      address_street1: form.address_street1,
      address_street2: form.address_street2,
      address_city: form.address_city,
      address_state: form.address_state,
      address_zip: form.address_zip,
      address_country: form.address_country,
      notes: form.notes,
      messaging_methods: form.messaging_methods,
      preferred_messaging: form.preferred_messaging,
      start_date: new Date().toISOString().split('T')[0],
      organization_id: organizationId,
    }).select()

    if (insertError) {
      setError(insertError.message)
    } else {
      const newId = inserted?.[0]?.id
      // Upload avatar if selected
      if (avatarFile && newId) {
        const result = await uploadAvatar(avatarFile, 'mentors', newId)
        if (result.error) {
          setError(`Mentor saved but photo upload failed: ${result.error}`)
        } else {
          const { error: urlError } = await supabase.from('mentors').update({ avatar_url: result.publicUrl }).eq('id', newId)
          if (urlError) setError(`Mentor saved but failed to link photo: ${urlError.message}`)
        }
      }
      setSuccess(`${form.first_name} ${form.last_name} added successfully.`)
      setForm(buildEmptyForm(defaultCountry))
      setAvatarFile(null)
      setShowForm(false)
      fetchMentors()
      refreshEntityCounts()
    }
    setSaving(false)
  }

  async function handleDelete(mentor) {
    const { error } = await supabase.from('mentors').delete().eq('id', mentor.id)
    if (error) {
      setError(error.message)
    } else {
      setConfirmDelete(null)
      fetchMentors()
      refreshEntityCounts()
    }
  }

  async function handleInvite(mentor) {
    if (!mentor.email) return
    setInviting(prev => new Set(prev).add(mentor.id))
    setInviteMsg(prev => ({ ...prev, [mentor.id]: null }))

    const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
      body: {
        email: mentor.email,
        role: 'mentor',
        entity_id: mentor.id,
        first_name: mentor.first_name,
        last_name: mentor.last_name,
        redirect_to: `${window.location.origin}/set-password`,
        organization_id: organizationId,
      },
    })

    setInviting(prev => { const next = new Set(prev); next.delete(mentor.id); return next })

    let errText = null
    if (fnError) {
      try {
        const body = await fnError.context?.json()
        errText = body?.error || fnError.message || 'Failed to send invite.'
      } catch {
        errText = fnError.message || 'Failed to send invite.'
      }
    } else if (data?.error) {
      errText = data.error
    }

    if (errText) {
      setInviteMsg(prev => ({ ...prev, [mentor.id]: { type: 'error', text: errText } }))
    } else {
      setInviteMsg(prev => ({
        ...prev,
        [mentor.id]: { type: 'success', text: `Account created for ${mentor.first_name}. A password reset email has been sent.` },
      }))
      if (data?.temp_password) {
        setTempPasswordModal({
          name: `${mentor.first_name} ${mentor.last_name}`,
          email: mentor.email,
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

  const displayed = mentors.filter(m => {
    const q = search.toLowerCase()
    return `${m.first_name} ${m.last_name} ${m.email || ''}`.toLowerCase().includes(q)
  })

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Mentors</h1>
          <p style={s.pageSubtitle}>{mentors.length} mentor{mentors.length !== 1 ? 's' : ''} in the program</p>
        </div>
        <button
          style={{ ...s.addBtn, ...(mentorLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          onClick={mentorLimit.atLimit ? undefined : openForm}
          disabled={mentorLimit.atLimit}
        >+ Add Mentor</button>
      </div>

      {mentorLimit.atLimit && (
        <PlanLimitBanner entityLabel="mentors" current={mentorLimit.current} max={mentorLimit.max} plan={plan} />
      )}

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* Add form */}
      {showForm && (
        <div style={s.formCard}>
          <div style={s.formCardHeader}>
            <h2 style={s.formTitle}>New Mentor</h2>
            <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} style={s.form}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
              <AvatarUpload
                initials={`${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}` || '?'}
                gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
                onChange={setAvatarFile}
              />
            </div>

            <div style={s.sectionLabel}>Basic Info</div>
            <div style={s.row}>
              <Field label="First Name" name="first_name" value={form.first_name} onChange={handleChange} required />
              <Field label="Last Name" name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
            <div style={s.row}>
              <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
              <div style={s.fieldGroup}>
                <label style={s.label}>Phone *</label>
                <PhoneInput name="phone" value={form.phone} onChange={handleChange} required />
              </div>
            </div>

            <div style={s.sectionLabel}>Address</div>
            <Field label="Street Address" name="address_street1" value={form.address_street1} onChange={handleChange} />
            <Field label="Address Line 2" name="address_street2" value={form.address_street2} onChange={handleChange} />
            <div style={s.row}>
              <Field label="City" name="address_city" value={form.address_city} onChange={handleChange} />
              <StateField value={form.address_state} onChange={handleChange} />
              <Field label="ZIP" name="address_zip" value={form.address_zip} onChange={handleChange} />
            </div>
            <CountryField value={form.address_country} onChange={handleChange} locked={lockCountry && !!defaultCountry} />

            <div style={s.sectionLabel}>Communication Methods</div>
            <MessagingPreferences
              methods={form.messaging_methods}
              preferred={form.preferred_messaging}
              onChange={({ methods, preferred }) => setForm(f => ({ ...f, messaging_methods: methods, preferred_messaging: preferred }))}
            />

            <div style={s.sectionLabel}>Notes</div>
            <div style={s.fieldGroup}>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={{ ...s.input, resize: 'vertical' }} />
            </div>

            <div style={s.formActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save Mentor'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <h3 style={s.dialogTitle}>Delete Mentor?</h3>
            <p style={s.dialogText}>
              Are you sure you want to delete <strong>{confirmDelete.first_name} {confirmDelete.last_name}</strong>? This cannot be undone.
            </p>
            <div style={s.dialogActions}>
              <button style={s.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={s.deleteConfirmBtn} onClick={() => handleDelete(confirmDelete)}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Temp password modal */}
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
                <code style={s.tempPwCode}>
                  {showPassword ? tempPasswordModal.password : '••••••••••••••••'}
                </code>
                <button style={s.tempPwBtn} onClick={() => setShowPassword(v => !v)} title={showPassword ? 'Hide' : 'Show'}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button style={s.tempPwBtn} onClick={copyTempPassword} title="Copy to clipboard">
                  {copied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                </button>
              </div>
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                This password is shown once. The mentor should reset it after first login.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={s.saveBtn} onClick={() => setTempPasswordModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={s.filterBar}>
        <div style={s.searchWrap}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            style={s.searchInput}
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={s.countRow}>
        Showing {displayed.length} of {mentors.length} mentor{mentors.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div style={s.list}>
        {displayed.length === 0 ? (
          <div style={s.empty}>
            <p>No mentors found.</p>
          </div>
        ) : (
          displayed.map(m => {
            const initials = `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`
            const msg = inviteMsg[m.id]
            return (
              <div key={m.id}>
                <div style={s.row2}>
                  <div style={s.avatarSmall}>
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : initials
                    }
                  </div>
                  <div style={s.personMain}>
                    <div style={s.personName}>{m.first_name} {m.last_name}</div>
                    <div style={s.personEmail}>{m.email || '—'}</div>
                  </div>
                  {m.email && (
                    <button
                      style={s.inviteRowBtn}
                      disabled={inviting.has(m.id)}
                      onClick={() => handleInvite(m)}
                      title="Create a portal account and send welcome email"
                    >
                      {inviting.has(m.id) ? 'Sending...' : 'Send Invite'}
                    </button>
                  )}
                  <button style={s.assignRowBtn} onClick={() => navigate(`/admin/mentors/${m.id}/assign`)}>Assign Mentees</button>
                  <button style={s.editRowBtn} onClick={() => navigate(`/admin/mentors/${m.id}`)}>Edit</button>
                  <button style={s.deleteRowBtn} onClick={() => setConfirmDelete(m)}>Delete</button>
                </div>
                {msg && (
                  <div style={msg.type === 'success' ? s.rowMsgSuccess : s.rowMsgError}>
                    {msg.text}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function CountryField({ value, onChange, locked }) {
  if (locked) {
    return (
      <div style={s.fieldGroup}>
        <label style={s.label}>Country</label>
        <div style={s.lockedField}>
          <span>{value}</span>
          <span style={s.lockedBadge}>Locked</span>
        </div>
      </div>
    )
  }
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>Country</label>
      <select name="address_country" value={value} onChange={onChange} style={s.input}>
        <option value="">— Select country —</option>
        {COUNTRIES.map((c, i) =>
          c.disabled
            ? <option key={i} disabled>{c.label}</option>
            : <option key={c.value} value={c.value}>{c.label}</option>
        )}
      </select>
    </div>
  )
}

function StateField({ value, onChange }) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>State *</label>
      <select name="address_state" value={value} onChange={onChange} style={s.input}>
        {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
      </select>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', required }) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>{label}{required && ' *'}</label>
      <input style={s.input} type={type} name={name} value={value} onChange={onChange} required={required} />
    </div>
  )
}

const s = {
  // Page header
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(99,102,241,0.3)', cursor: 'pointer' },

  // Success / error boxes
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },

  // Form card
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
  checkboxRow: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' },
  cancelBtn: { padding: '0.6rem 1.1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' },

  // Filter / search bar
  filterBar: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: '1', minWidth: 200 },
  searchInput: { padding: '0.6rem 0.85rem 0.6rem 2rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },

  // Count row
  countRow: { fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.75rem' },

  // List
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row2: { display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#fff', padding: '0.85rem 1.1rem', borderRadius: 7, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', flexWrap: 'wrap' },
  avatarSmall: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, overflow: 'hidden' },
  personMain: { flex: 1, minWidth: 160 },
  personName: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  personEmail: { color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' },

  // Row action buttons
  inviteRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #c7d2fe', borderRadius: 7, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  assignRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #a7f3d0', borderRadius: 7, color: '#059669', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  editRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #c7d2fe', borderRadius: 7, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  deleteRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },

  // Invite messages below row
  rowMsgSuccess: { fontSize: '0.78rem', color: '#15803d', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.4rem 1.1rem 0.4rem 3.5rem', borderRadius: 8, marginTop: '0.15rem' },
  rowMsgError: { fontSize: '0.78rem', color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '0.4rem 1.1rem 0.4rem 3.5rem', borderRadius: 8, marginTop: '0.15rem' },

  // Temp password modal
  tempPwCard: { backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem 1.25rem' },
  tempPwRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.8rem' },
  tempPwCode: { flex: 1, fontFamily: 'monospace', fontSize: '1rem', color: '#1a202c', letterSpacing: '0.5px' },
  tempPwBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: '4px', display: 'flex', alignItems: 'center' },

  // Empty state
  empty: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },

  // Dialog overlay
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog: { backgroundColor: '#fff', borderRadius: 7, padding: '2rem', maxWidth: 480, width: '90%', boxShadow: 'var(--shadow-lg)' },
  dialogTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' },
  dialogText: { color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem', fontSize: '0.9rem' },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  deleteConfirmBtn: { padding: '0.6rem 1.2rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, cursor: 'pointer' },
}
