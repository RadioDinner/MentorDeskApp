import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput from '../components/PhoneInput'
import {
  Plus, X, Users2, Pencil, ChevronDown, ChevronUp, Check, Lock,
  Shield, LayoutDashboard, UserCheck, HeartHandshake, Users,
  Package, BarChart3, CreditCard, Receipt, DollarSign, ClipboardList, Settings,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'
import MessagingPreferences from '../components/MessagingPreferences'

const MODULES = [
  { section: 'Main' },
  { key: 'mod_dashboard',        label: 'Dashboard',         icon: LayoutDashboard, color: '#6366f1', bg: '#eef2ff' },
  { key: 'mod_mentors',          label: 'Mentors',           icon: UserCheck,       color: '#6366f1', bg: '#eef2ff' },
  { key: 'mod_assistant_mentors', label: 'Assistant Mentors', icon: HeartHandshake,  color: '#10b981', bg: '#ecfdf5' },
  { key: 'mod_mentees',          label: 'Mentees',           icon: Users,           color: '#3b82f6', bg: '#eff6ff' },
  { key: 'mod_staff',            label: 'Staff',             icon: Users2,          color: '#f59e0b', bg: '#fffbeb' },
  { key: 'mod_offerings',        label: 'Offerings',         icon: Package,         color: '#8b5cf6', bg: '#f5f3ff', feature: 'courses' },
  { key: 'mod_reports',          label: 'Reports',           icon: BarChart3,       color: '#ec4899', bg: '#fdf2f8', feature: 'reports' },
  { section: 'Finance' },
  { key: 'mod_billing',          label: 'Billing',           icon: CreditCard,      color: '#0d9488', bg: '#f0fdfa', feature: 'billing' },
  { key: 'mod_invoicing',        label: 'Invoicing',         icon: Receipt,         color: '#0d9488', bg: '#f0fdfa', feature: 'invoicing' },
  { key: 'mod_payroll',          label: 'Payroll',           icon: DollarSign,      color: '#0d9488', bg: '#f0fdfa', feature: 'payroll' },
  { section: 'System' },
  { key: 'mod_staff_roles',      label: 'Staff Roles',       icon: Shield,          color: '#dc2626', bg: '#fef2f2' },
  { key: 'mod_audit_log',        label: 'Audit Log',         icon: ClipboardList,   color: '#64748b', bg: '#f8fafc' },
  { key: 'mod_settings',         label: 'Settings',          icon: Settings,        color: '#f59e0b', bg: '#fffbeb' },
]

const MODULE_KEYS = MODULES.filter(m => m.key).map(m => m.key)
const MODULE_MAP = {}
MODULES.filter(m => m.key).forEach(m => { MODULE_MAP[m.key] = m })

const buildEmpty = (defaultCountry = '') => ({
  first_name: '', last_name: '', email: '', phone: '', role_title: '',
  address_street1: '', address_street2: '',
  address_city: '', address_state: '', address_zip: '',
  address_country: defaultCountry,
  start_date: new Date().toISOString().split('T')[0],
  notes: '',
  messaging_methods: [], preferred_messaging: '',
  pay_type: 'hourly', pay_rate: '',
})

export default function ManageStaff() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { organizationId, checkLimit, refreshEntityCounts, plan, hasFeature } = useRole()
  const staffLimit = checkLimit('staff')
  const [staff, setStaff] = useState([])
  const [defaultCountry, setDefaultCountry] = useState('')
  const [lockCountry, setLockCountry] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(buildEmpty())
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')

  // Permissions state
  const [permissions, setPermissions] = useState({})
  const [expanded, setExpanded] = useState({})
  const [permSaving, setPermSaving] = useState({})

  useEffect(() => {
    fetchStaff()
    loadSettings()
    loadPermissions()
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

  async function fetchStaff() {
    const { data } = await supabase.from('staff').select('*').order('last_name')
    if (data) setStaff(data)
  }

  async function loadPermissions() {
    const { data } = await supabase.from('staff_permissions').select('*')
    const permMap = {}
    if (data) data.forEach(p => { permMap[p.staff_id] = p })
    setPermissions(permMap)
  }

  function getPerms(staffId) {
    const p = permissions[staffId] || {}
    const result = {}
    MODULE_KEYS.forEach(k => { result[k] = !!p[k] })
    return result
  }

  function isModuleAvailable(mod) {
    if (!mod.feature) return true
    return hasFeature(mod.feature)
  }

  async function togglePermission(staffId, key) {
    const mod = MODULE_MAP[key]
    if (mod && !isModuleAvailable(mod)) return
    setPermSaving(sv => ({ ...sv, [`${staffId}_${key}`]: true }))
    const current = getPerms(staffId)
    const newVal = !current[key]
    if (permissions[staffId]) {
      await supabase.from('staff_permissions').update({ [key]: newVal }).eq('staff_id', staffId)
    } else {
      const row = { staff_id: staffId, organization_id: organizationId }
      MODULE_KEYS.forEach(k => { row[k] = k === key ? newVal : false })
      const { data } = await supabase.from('staff_permissions').insert(row).select().single()
      if (data) { setPermissions(p => ({ ...p, [staffId]: data })); setPermSaving(sv => ({ ...sv, [`${staffId}_${key}`]: false })); return }
    }
    setPermissions(p => ({ ...p, [staffId]: { ...p[staffId], staff_id: staffId, [key]: newVal } }))
    setPermSaving(sv => ({ ...sv, [`${staffId}_${key}`]: false }))
  }

  async function toggleAll(staffId, enable) {
    const update = {}
    MODULE_KEYS.forEach(k => { update[k] = enable && isModuleAvailable(MODULE_MAP[k]) })
    if (permissions[staffId]) {
      await supabase.from('staff_permissions').update(update).eq('staff_id', staffId)
    } else {
      const { data } = await supabase.from('staff_permissions').insert({ staff_id: staffId, organization_id: organizationId, ...update }).select().single()
      if (data) { setPermissions(p => ({ ...p, [staffId]: data })); return }
    }
    setPermissions(p => ({ ...p, [staffId]: { ...p[staffId], staff_id: staffId, ...update } }))
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  function openForm() {
    setEditId(null)
    setForm(buildEmpty(defaultCountry))
    setAvatarFile(null)
    setError(null)
    setSuccess(null)
    setShowForm(true)
  }

  function openEdit(member) {
    setEditId(member.id)
    setForm({
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      email: member.email || '',
      phone: member.phone || '',
      role_title: member.role_title || '',
      address_street1: member.address_street1 || '',
      address_street2: member.address_street2 || '',
      address_city: member.address_city || '',
      address_state: member.address_state || '',
      address_zip: member.address_zip || '',
      address_country: member.address_country || defaultCountry,
      start_date: member.start_date || new Date().toISOString().split('T')[0],
      notes: member.notes || '',
      messaging_methods: member.messaging_methods || [],
      preferred_messaging: member.preferred_messaging || '',
      pay_type: member.pay_type || 'hourly',
      pay_rate: member.pay_rate != null ? String(member.pay_rate) : '',
    })
    setAvatarFile(null)
    setError(null)
    setSuccess(null)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      first_name: form.first_name, last_name: form.last_name,
      email: form.email, phone: form.phone, role_title: form.role_title,
      address_street1: form.address_street1, address_street2: form.address_street2,
      address_city: form.address_city, address_state: form.address_state,
      address_zip: form.address_zip, address_country: form.address_country,
      start_date: form.start_date, notes: form.notes,
      messaging_methods: form.messaging_methods, preferred_messaging: form.preferred_messaging,
      pay_type: form.pay_type,
      pay_rate: form.pay_rate !== '' ? parseFloat(form.pay_rate) : null,
    }

    let opError, targetId

    if (editId) {
      const { error: updateError } = await supabase.from('staff').update(payload).eq('id', editId)
      opError = updateError
      targetId = editId
    } else {
      const { error: insertError } = await supabase.from('staff').insert({ ...payload, organization_id: organizationId })
      opError = insertError
      if (!insertError) {
        const { data: inserted } = await supabase.from('staff').select('id').eq('email', form.email).single()
        targetId = inserted?.id
      }
    }

    if (opError) { setError(opError.message) }
    else {
      if (avatarFile && targetId) {
        const result = await uploadAvatar(avatarFile, 'staff', targetId)
        if (result.error) {
          setError(`Staff saved but photo upload failed: ${result.error}`)
        } else {
          const { error: urlError } = await supabase.from('staff').update({ avatar_url: result.publicUrl }).eq('id', targetId)
          if (urlError) setError(`Staff saved but failed to link photo: ${urlError.message}`)
        }
      }
      setSuccess(`${form.first_name} ${form.last_name} ${editId ? 'updated' : 'added'}.`)
      if (!editId) refreshEntityCounts()
      setEditId(null)
      setForm(buildEmpty(defaultCountry))
      setAvatarFile(null)
      setShowForm(false)
      fetchStaff()
    }
    setSaving(false)
  }

  async function handleDelete(member) {
    const { error } = await supabase.from('staff').delete().eq('id', member.id)
    if (!error) { setConfirmDelete(null); fetchStaff(); refreshEntityCounts() }
    else setError(error.message)
  }

  const filtered = staff.filter(m =>
    `${m.first_name} ${m.last_name} ${m.email} ${m.role_title}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Staff</h1>
          <p style={s.pageSubtitle}>{staff.length} team member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          style={{ ...s.addBtn, ...(staffLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          onClick={staffLimit.atLimit ? undefined : openForm}
          disabled={staffLimit.atLimit}
        ><Plus size={15} strokeWidth={2.5} /> Add Staff</button>
      </div>

      {staffLimit.atLimit && (
        <PlanLimitBanner entityLabel="staff" current={staffLimit.current} max={staffLimit.max} plan={plan} />
      )}

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {showForm && (
        <div style={s.formCard}>
          <div style={s.formCardHeader}>
            <h2 style={s.formTitle}>{editId ? 'Edit Staff Member' : 'New Staff Member'}</h2>
            <button style={s.closeBtn} onClick={() => { setShowForm(false); setEditId(null) }}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} style={s.form}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
              <AvatarUpload
                initials={`${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}` || '?'}
                gradient="linear-gradient(135deg, #f59e0b, #f97316)"
                onChange={setAvatarFile}
              />
            </div>

            <div style={s.sectionLabel}>Basic Info</div>
            <div style={s.row}>
              <Field label="First Name" name="first_name" value={form.first_name} onChange={handleChange} required />
              <Field label="Last Name" name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
            <div style={s.row}>
              <Field label="Role / Title" name="role_title" value={form.role_title} onChange={handleChange} />
              <Field label="Start Date" name="start_date" type="date" value={form.start_date} onChange={handleChange} />
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
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[{ value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Salary' }].map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1rem', borderRadius: 7, cursor: 'pointer',
                    border: `1.5px solid ${form.pay_type === opt.value ? '#6366f1' : '#e5e7eb'}`,
                    background: form.pay_type === opt.value ? '#eef2ff' : '#fff',
                    fontSize: '0.875rem', fontWeight: form.pay_type === opt.value ? 600 : 400,
                    color: form.pay_type === opt.value ? '#4f46e5' : '#374151',
                  }}>
                    <input type="radio" name="pay_type" value={opt.value} checked={form.pay_type === opt.value} onChange={handleChange} style={{ display: 'none' }} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>{form.pay_type === 'hourly' ? 'Hourly Rate ($/hr)' : 'Annual Salary ($)'}</label>
              <input
                style={s.input} type="number" name="pay_rate" min="0" step="0.01"
                placeholder={form.pay_type === 'hourly' ? 'e.g. 25.00' : 'e.g. 55000'}
                value={form.pay_rate} onChange={handleChange}
              />
            </div>

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
              <button type="button" style={s.cancelBtn} onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>{saving ? 'Saving…' : editId ? 'Save Changes' : 'Save Staff Member'}</button>
            </div>
          </form>
        </div>
      )}

      <div style={s.searchRow}>
        <input style={s.searchInput} placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={s.countRow}>
        Showing {filtered.length} of {staff.length} staff member{staff.length !== 1 ? 's' : ''}
      </div>

      <div style={s.list}>
        {filtered.length === 0 ? (
          <div style={s.empty}><Users2 size={40} color="#d1d5db" /><p style={{ color: '#9ca3af' }}>No staff found.</p></div>
        ) : filtered.map(m => {
          const initials = `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`
          const perms = getPerms(m.id)
          const activeModules = MODULES.filter(mod => mod.key && perms[mod.key])
          const isOpen = !!expanded[m.id]
          const allAvailableOn = MODULE_KEYS.every(k => !isModuleAvailable(MODULE_MAP[k]) || perms[k])

          return (
            <div key={m.id} style={s.staffCard}>
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

                {/* Module access icons */}
                <div style={s.iconRow}>
                  {activeModules.length > 0 ? (
                    activeModules.map(mod => {
                      const Icon = mod.icon
                      return (
                        <div key={mod.key} style={{ ...s.iconCircle, backgroundColor: mod.bg, borderColor: mod.color + '40' }} title={mod.label}>
                          <Icon size={12} color={mod.color} strokeWidth={2} />
                        </div>
                      )
                    })
                  ) : (
                    <span style={s.noAccessLabel}>No module access</span>
                  )}
                </div>

                <button style={s.permToggleBtn} onClick={() => setExpanded(e => ({ ...e, [m.id]: !e[m.id] }))} title="Edit permissions">
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button style={s.editRowBtn} onClick={() => navigate(`/admin/staff/${m.id}`)}><Pencil size={13} /> Edit</button>
                <button style={s.deleteRowBtn} onClick={() => setConfirmDelete(m)}>Remove</button>
              </div>

              {/* Expandable permissions panel */}
              {isOpen && (
                <div style={s.modulePanel}>
                  <div style={s.panelTopBar}>
                    <span style={s.panelLabel}>Module Access</span>
                    <button style={s.bulkBtn} onClick={() => toggleAll(m.id, !allAvailableOn)}>
                      {allAvailableOn ? 'Revoke All' : 'Grant All'}
                    </button>
                  </div>
                  <div style={s.moduleGrid}>
                    {MODULES.map((mod, i) => {
                      if (mod.section) return <div key={`section-${i}`} style={s.modSectionLabel}>{mod.section}</div>
                      const active = perms[mod.key]
                      const isSaving = permSaving[`${m.id}_${mod.key}`]
                      const available = isModuleAvailable(mod)
                      const Icon = mod.icon
                      return (
                        <div key={mod.key} style={{ position: 'relative' }}>
                          <button
                            style={{
                              ...s.moduleBtn,
                              backgroundColor: !available ? '#f9fafb' : active ? mod.bg : '#f9fafb',
                              borderColor: !available ? '#e5e7eb' : active ? mod.color + '50' : '#e5e7eb',
                              opacity: isSaving ? 0.5 : 1,
                              cursor: available ? 'pointer' : 'default',
                            }}
                            onClick={() => available && togglePermission(m.id, mod.key)}
                            disabled={isSaving || !available}
                            title={!available ? 'Not available on your current plan' : active ? `Revoke ${mod.label} access` : `Grant ${mod.label} access`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                              <Icon size={15} color={!available ? '#d1d5db' : active ? mod.color : '#9ca3af'} strokeWidth={1.8} />
                              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: !available ? '#d1d5db' : active ? '#111827' : '#9ca3af' }}>{mod.label}</span>
                            </div>
                            <div style={{
                              width: 22, height: 22, borderRadius: 6,
                              backgroundColor: !available ? '#e5e7eb' : active ? mod.color : '#e5e7eb',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.12s',
                            }}>
                              {active && available && <Check size={12} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                          {!available && (
                            <div
                              style={s.hashOverlay}
                              title="Not available on your current plan"
                              onClick={() => navigate('/admin/billing')}
                            >
                              <Lock size={10} color="#9ca3af" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirmDelete && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <h3 style={s.dialogTitle}>Remove Staff Member?</h3>
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
      <label style={s.label}>{label}{required && ' *'}</label>
      <input style={s.input} type={type} name={name} value={value} onChange={onChange} required={required} />
    </div>
  )
}

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
  searchRow: { marginBottom: '0.75rem' },
  searchInput: { padding: '0.65rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', width: '100%', maxWidth: 360, boxSizing: 'border-box', backgroundColor: '#fff' },
  countRow: { fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  staffCard: { backgroundColor: '#fff', borderRadius: 7, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  row2: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.1rem', flexWrap: 'wrap' },
  avatarSmall: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, overflow: 'hidden' },
  personMain: { flex: 1, minWidth: 160 },
  personName: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  personEmail: { color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' },
  editRowBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #c7d2fe', borderRadius: 7, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  deleteRowBtn: { padding: '0.3rem 0.75rem', background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' },
  iconRow: { display: 'flex', gap: '0.25rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  iconCircle: { width: 26, height: 26, borderRadius: '50%', border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noAccessLabel: { fontSize: '0.72rem', color: '#d1d5db', fontWeight: 500, fontStyle: 'italic' },
  permToggleBtn: { width: 28, height: 28, borderRadius: 6, border: '1.5px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', cursor: 'pointer', flexShrink: 0 },
  modulePanel: { borderTop: '1px solid #f3f4f6', backgroundColor: '#fafbfc' },
  panelTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1.1rem', borderBottom: '1px solid #f3f4f6' },
  panelLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' },
  bulkBtn: { padding: '0.3rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  moduleGrid: { padding: '0.75rem 1.1rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' },
  modSectionLabel: { width: '100%', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.2rem 0', marginTop: '0.15rem' },
  moduleBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 7, transition: 'all 0.12s', minWidth: 150, background: 'none' },
  hashOverlay: { position: 'absolute', inset: 0, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(209,213,219,0.35) 3px, rgba(209,213,219,0.35) 5px)' },
  empty: { textAlign: 'center', padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog: { backgroundColor: '#fff', borderRadius: 7, padding: '2rem', maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-lg)' },
  dialogTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' },
  dialogText: { color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem', fontSize: '0.9rem' },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  deleteConfirmBtn: { padding: '0.6rem 1.2rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600 },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
}
