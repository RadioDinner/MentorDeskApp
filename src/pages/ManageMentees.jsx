import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput from '../components/PhoneInput'
import { Plus, X, User, ChevronUp, ChevronDown, Search, Archive, RotateCcw } from 'lucide-react'
import { parseStatuses, getStatusColor } from '../utils/statuses'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'
import MessagingPreferences from '../components/MessagingPreferences'

const buildEmpty = (defaultCountry = '') => ({
  first_name: '', last_name: '', email: '', phone: '',
  address_street1: '', address_street2: '',
  address_city: '', address_state: '', address_zip: '',
  address_country: defaultCountry,
  billing_street: '', billing_city: '', billing_state: '', billing_zip: '',
  billing_country: defaultCountry,
  billing_same_as_address: true,
  status: 'Waiting List',
  signup_date: new Date().toISOString().split('T')[0],
  mentor_id: '',
  messaging_methods: [], preferred_messaging: '',
})

export default function ManageMentees() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { organizationId, checkLimit, refreshEntityCounts, plan } = useRole()
  const menteeLimit = checkLimit('mentees')
  const [mentees, setMentees] = useState([])
  const [mentors, setMentors] = useState([])
  const [defaultCountry, setDefaultCountry] = useState('')
  const [lockCountry, setLockCountry] = useState(false)
  const [statusOptions, setStatusOptions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(buildEmpty())
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  // Filter / sort state
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [sortField, setSortField] = useState('last_name')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    fetchMentees()
    fetchMentors()
    loadSettings()
  }, [showArchived])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
    if (data) {
      const country = data.find(s => s.key === 'default_country')?.value || ''
      const lock = data.find(s => s.key === 'lock_country')?.value === 'true'
      const statuses = parseStatuses(data.find(s => s.key === 'mentee_statuses')?.value)
      setDefaultCountry(country)
      setLockCountry(lock)
      setStatusOptions(statuses)
      if (searchParams.get('action') === 'add') {
        setForm(buildEmpty(country))
        setShowForm(true)
      }
    }
  }

  async function fetchMentees() {
    let q = supabase.from('mentees').select('*').neq('is_test_account', true).order('last_name')
    if (showArchived) q = q.not('archived_at', 'is', null)
    else q = q.is('archived_at', null)
    const { data } = await q
    if (data) setMentees(data)
  }

  async function handleArchive(mentee) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('mentees').update({
      archived_at: new Date().toISOString(),
      archived_by: user?.id,
    }).eq('id', mentee.id)
    if (!error) { setConfirmArchive(null); fetchMentees() }
    else setError(error.message)
  }

  async function handleUnarchive(mentee) {
    const { error } = await supabase.from('mentees').update({
      archived_at: null,
      archived_by: null,
    }).eq('id', mentee.id)
    if (!error) fetchMentees()
    else setError(error.message)
  }

  async function fetchMentors() {
    const { data } = await supabase.from('mentors').select('id, first_name, last_name').order('last_name')
    if (data) setMentors(data)
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => {
      const updated = { ...f, [name]: type === 'checkbox' ? checked : value }
      if (name === 'billing_same_as_address' && checked) {
        updated.billing_street = f.address_street1
        updated.billing_city = f.address_city
        updated.billing_state = f.address_state
        updated.billing_zip = f.address_zip
        updated.billing_country = f.address_country
      }
      return updated
    })
  }

  function openForm() {
    setForm(buildEmpty(defaultCountry))
    setAvatarFile(null)
    setError(null)
    setSuccess(null)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const billing = form.billing_same_as_address ? {
      billing_street: form.address_street1,
      billing_city: form.address_city,
      billing_state: form.address_state,
      billing_zip: form.address_zip,
      billing_country: form.address_country,
    } : {
      billing_street: form.billing_street,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_zip: form.billing_zip,
      billing_country: form.billing_country,
    }

    const { data: inserted, error: insertError } = await supabase.from('mentees').insert({
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
      status: form.status,
      signup_date: form.signup_date,
      mentor_id: form.mentor_id || null,
      messaging_methods: form.messaging_methods,
      preferred_messaging: form.preferred_messaging,
      organization_id: organizationId,
      ...billing,
    }).select()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    // Upload avatar if selected
    const newId = inserted?.[0]?.id
    if (avatarFile && newId) {
      const result = await uploadAvatar(avatarFile, 'mentees', newId)
      if (result.error) {
        setError(`Mentee saved but photo upload failed: ${result.error}`)
      } else {
        const { error: urlError } = await supabase.from('mentees').update({ avatar_url: result.publicUrl }).eq('id', newId)
        if (urlError) setError(`Mentee saved but failed to link photo: ${urlError.message}`)
      }
    }

    // Create a portal login account for the mentee via the universal edge function
    let inviteSent = false
    if (form.email && newId) {
      const { data: inviteData, error: inviteError } = await supabase.functions.invoke('invite-user', {
        body: {
          email: form.email,
          role: 'mentee',
          entity_id: newId,
          first_name: form.first_name,
          last_name: form.last_name,
          redirect_to: `${window.location.origin}/set-password`,
          organization_id: organizationId,
        },
      })

      if (!inviteError && inviteData && !inviteData.error) {
        inviteSent = true
      }
    }

    setSuccess(`${form.first_name} ${form.last_name} added.${inviteSent ? ' A welcome email has been sent to their inbox.' : ''}`)
    setForm(buildEmpty(defaultCountry))
    setAvatarFile(null)
    setShowForm(false)
    fetchMentees()
    refreshEntityCounts()
    setSaving(false)
  }

  async function handleDelete(mentee) {
    const { error } = await supabase.from('mentees').delete().eq('id', mentee.id)
    if (!error) { setConfirmDelete(null); fetchMentees(); refreshEntityCounts() }
    else setError(error.message)
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const displayed = mentees
    .filter(m => {
      const nameMatch = `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())
      const statusMatch = filterStatus === 'All' || m.status === filterStatus
      return nameMatch && statusMatch
    })
    .sort((a, b) => {
      let av, bv
      if (sortField === 'last_name') { av = (a.last_name || '').toLowerCase(); bv = (b.last_name || '').toLowerCase() }
      else if (sortField === 'status') { av = statusOptions.indexOf(a.status); bv = statusOptions.indexOf(b.status) }
      else if (sortField === 'signup_date') { av = a.signup_date || ''; bv = b.signup_date || '' }
      else { av = (a.first_name || '').toLowerCase(); bv = (b.first_name || '').toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function SortIcon({ field }) {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Mentees</h1>
          <p style={s.pageSubtitle}>{showArchived ? 'Viewing archived mentees' : `${mentees.length} participant${mentees.length !== 1 ? 's' : ''} in the program`}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            style={{ ...s.archiveToggleBtn, ...(showArchived ? s.archiveToggleBtnActive : {}) }}
            onClick={() => setShowArchived(v => !v)}
          >
            <Archive size={14} strokeWidth={2} />
            {showArchived ? 'View Active' : 'View Archived'}
          </button>
          {!showArchived && (
            <button
              style={{ ...s.addBtn, ...(menteeLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              onClick={menteeLimit.atLimit ? undefined : openForm}
              disabled={menteeLimit.atLimit}
            >
              <Plus size={15} strokeWidth={2.5} /> Add Mentee
            </button>
          )}
        </div>
      </div>

      {menteeLimit.atLimit && (
        <PlanLimitBanner entityLabel="mentees" current={menteeLimit.current} max={menteeLimit.max} plan={plan} />
      )}

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* Add form */}
      {showForm && (
        <div style={s.formCard}>
          <div style={s.formCardHeader}>
            <h2 style={s.formTitle}>New Mentee</h2>
            <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} style={s.form}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
              <AvatarUpload
                initials={`${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}` || '?'}
                gradient="linear-gradient(135deg, #3b82f6, #6366f1)"
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
            <div style={s.row}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Status *</label>
                <select name="status" value={form.status} onChange={handleChange} style={s.input} required>
                  {statusOptions.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Assigned Mentor</label>
                <select name="mentor_id" value={form.mentor_id} onChange={handleChange} style={s.input}>
                  <option value="">— Unassigned —</option>
                  {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <Field label="Sign-up Date" name="signup_date" type="date" value={form.signup_date} onChange={handleChange} />
            </div>

            <div style={s.sectionLabel}>Residential Address</div>
            <Field label="Street Address *" name="address_street1" value={form.address_street1} onChange={handleChange} required />
            <Field label="Address Line 2" name="address_street2" value={form.address_street2} onChange={handleChange} />
            <div style={s.row}>
              <Field label="City *" name="address_city" value={form.address_city} onChange={handleChange} required />
              <div style={s.fieldGroup}>
                <label style={s.label}>State</label>
                <select name="address_state" value={form.address_state} onChange={handleChange} style={s.input}>
                  <option value="">—</option>
                  {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <Field label="ZIP *" name="address_zip" value={form.address_zip} onChange={handleChange} required />
            </div>
            {lockCountry && defaultCountry ? (
              <div style={s.fieldGroup}>
                <label style={s.label}>Country</label>
                <div style={s.lockedField}><span>{defaultCountry}</span><span style={s.lockedBadge}>Locked</span></div>
              </div>
            ) : (
              <div style={s.fieldGroup}>
                <label style={s.label}>Country *</label>
                <select name="address_country" value={form.address_country} onChange={handleChange} style={s.input} required>
                  <option value="">— Select country —</option>
                  {COUNTRIES.map((c, i) => c.disabled
                    ? <option key={i} disabled>{c.label}</option>
                    : <option key={c.value} value={c.value}>{c.label}</option>
                  )}
                </select>
              </div>
            )}

            <div style={s.sectionLabel}>Billing Address</div>
            <label style={s.checkboxLabel}>
              <input type="checkbox" name="billing_same_as_address" checked={form.billing_same_as_address} onChange={handleChange} />
              Same as residential address
            </label>
            {!form.billing_same_as_address && (
              <>
                <Field label="Billing Street *" name="billing_street" value={form.billing_street} onChange={handleChange} required />
                <div style={s.row}>
                  <Field label="Billing City *" name="billing_city" value={form.billing_city} onChange={handleChange} required />
                  <div style={s.fieldGroup}>
                    <label style={s.label}>State</label>
                    <select name="billing_state" value={form.billing_state} onChange={handleChange} style={s.input}>
                      <option value="">—</option>
                      {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                    </select>
                  </div>
                  <Field label="ZIP *" name="billing_zip" value={form.billing_zip} onChange={handleChange} required />
                </div>
                {lockCountry && defaultCountry ? (
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Billing Country</label>
                    <div style={s.lockedField}><span>{defaultCountry}</span><span style={s.lockedBadge}>Locked</span></div>
                  </div>
                ) : (
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Billing Country *</label>
                    <select name="billing_country" value={form.billing_country} onChange={handleChange} style={s.input} required>
                      <option value="">— Select country —</option>
                      {COUNTRIES.map((c, i) => c.disabled
                        ? <option key={i} disabled>{c.label}</option>
                        : <option key={c.value} value={c.value}>{c.label}</option>
                      )}
                    </select>
                  </div>
                )}
              </>
            )}

            <div style={s.sectionLabel}>Communication Methods</div>
            <MessagingPreferences
              methods={form.messaging_methods}
              preferred={form.preferred_messaging}
              onChange={({ methods, preferred }) => setForm(f => ({ ...f, messaging_methods: methods, preferred_messaging: preferred }))}
            />

            <div style={s.formActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save Mentee'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter + Sort bar */}
      <div style={s.filterBar}>
        <div style={s.searchWrap}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            style={s.searchInput}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select style={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {statusOptions.map(st => <option key={st} value={st}>{st}</option>)}
        </select>
        <div style={s.sortBtns}>
          <span style={s.sortLabel}>Sort:</span>
          {[
            { field: 'last_name', label: 'Name' },
            { field: 'status', label: 'Status' },
            { field: 'signup_date', label: 'Date' },
          ].map(({ field, label }) => (
            <button
              key={field}
              style={{ ...s.sortBtn, ...(sortField === field ? s.sortBtnActive : {}) }}
              onClick={() => toggleSort(field)}
            >
              {label} <SortIcon field={field} />
            </button>
          ))}
        </div>
      </div>

      <div style={s.countRow}>
        Showing {displayed.length} of {mentees.length} mentee{mentees.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div style={s.list}>
        {displayed.length === 0 ? (
          <div style={s.empty}>
            <User size={40} color="#cbd5e1" />
            <p>No mentees found.</p>
          </div>
        ) : (
          displayed.map(m => {
            const sc = getStatusColor(m.status, statusOptions.indexOf(m.status))
            const initials = `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`
            return (
              <div key={m.id} style={s.row2}>
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
                <span style={{ ...s.statusBadge, backgroundColor: sc.bg, color: sc.color }}>{m.status || '—'}</span>
                {showArchived ? (
                  <button style={s.restoreRowBtn} onClick={() => handleUnarchive(m)}>
                    <RotateCcw size={12} /> Restore
                  </button>
                ) : (
                  <>
                    <button style={s.editRowBtn} onClick={() => navigate(`/admin/mentees/${m.id}`)}>Edit</button>
                    <button style={s.archiveRowBtn} onClick={() => setConfirmArchive(m)}>
                      <Archive size={12} /> Archive
                    </button>
                    <button style={s.deleteRowBtn} onClick={() => setConfirmDelete(m)}>Remove</button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {confirmArchive && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <h3 style={s.dialogTitle}>Archive Mentee?</h3>
            <p style={s.dialogText}>
              <strong>{confirmArchive.first_name} {confirmArchive.last_name}</strong> will be moved to the archived list and hidden from the active view. You can restore them at any time.
            </p>
            <div style={s.dialogActions}>
              <button style={s.cancelBtn} onClick={() => setConfirmArchive(null)}>Cancel</button>
              <button style={s.archiveConfirmBtn} onClick={() => handleArchive(confirmArchive)}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <h3 style={s.dialogTitle}>Remove Mentee?</h3>
            <p style={s.dialogText}>Are you sure you want to remove <strong>{confirmDelete.first_name} {confirmDelete.last_name}</strong>? This cannot be undone.</p>
            <div style={s.dialogActions}>
              <button style={s.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={s.deleteConfirmBtn} onClick={() => handleDelete(confirmDelete)}>Yes, Remove</button>
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

function SortIcon({ field: _f }) { return null } // rendered inline above

const s = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' },
  formCard: { backgroundColor: '#fff', borderRadius: 7, boxShadow: 'var(--shadow-md)', marginBottom: '1.5rem', overflow: 'hidden', border: '1px solid #f3f4f6' },
  formCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6' },
  formTitle: { fontSize: '1rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 6 },
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
  cancelBtn: { padding: '0.6rem 1.1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.875rem' },
  filterBar: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: '1', minWidth: 200 },
  searchInput: { padding: '0.6rem 0.85rem 0.6rem 2rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  filterSelect: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', backgroundColor: '#fff', color: '#374151', minWidth: 160 },
  sortBtns: { display: 'flex', alignItems: 'center', gap: '0.3rem' },
  sortLabel: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600, marginRight: '0.2rem' },
  sortBtn: { display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.4rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  sortBtnActive: { borderColor: '#6366f1', color: '#6366f1', background: '#eef2ff' },
  countRow: { fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row2: { display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#fff', padding: '0.85rem 1.1rem', borderRadius: 7, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', flexWrap: 'wrap' },
  avatarSmall: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, overflow: 'hidden' },
  personMain: { flex: 1, minWidth: 160 },
  personName: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  personEmail: { color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' },
  statusBadge: { fontSize: '0.75rem', fontWeight: 600, borderRadius: 6, padding: '0.25rem 0.65rem', whiteSpace: 'nowrap' },
  editRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #c7d2fe', borderRadius: 7, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' },
  archiveRowBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #d1fae5', borderRadius: 7, color: '#059669', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' },
  restoreRowBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #c7d2fe', borderRadius: 7, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' },
  deleteRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' },
  archiveToggleBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', background: 'none', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  archiveToggleBtnActive: { borderColor: '#6366f1', color: '#6366f1', background: '#eef2ff' },
  archiveConfirmBtn: { padding: '0.6rem 1.2rem', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600 },
  empty: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog: { backgroundColor: '#fff', borderRadius: 7, padding: '2rem', maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-lg)' },
  dialogTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' },
  dialogText: { color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem', fontSize: '0.9rem' },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  deleteConfirmBtn: { padding: '0.6rem 1.2rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600 },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
}
