import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchWithSuperAdminAuth } from '../superAdminClient'
import { ArrowLeft, Building2, Users, UserCheck, Users2, Package, ExternalLink, Percent, Mail, Shield, Search, Plug, Zap, Video, Calendar, Trash2, Lock, Unlock, Archive, RotateCcw } from 'lucide-react'
import { PLAN_LIMITS } from '../constants/planLimits'
import UsageBar from '../components/UsageBar'

const ORG_APP_URL = import.meta.env.VITE_ORG_APP_URL || ''
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const KNOWN_FLAGS = [
  { key: 'billing', label: 'Billing' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'courses', label: 'Courses' },
  { key: 'arrangements', label: 'Arrangements' },
  { key: 'integrations', label: 'Integrations' },
]

const INTEGRATION_FLAGS = [
  { key: 'integration_zapier', label: 'Zapier', description: 'Automate workflows with third-party apps', icon: Zap, color: '#ff4a00' },
  { key: 'integration_zoom', label: 'Zoom Meetings', description: 'Schedule and launch Zoom meetings', icon: Video, color: '#2d8cff' },
  { key: 'integration_teams', label: 'Teams Meetings', description: 'Schedule and launch Microsoft Teams meetings', icon: Video, color: '#6264a7' },
  { key: 'integration_google_calendar', label: 'Google Calendar', description: 'Sync sessions and events to Google Calendar', icon: Calendar, color: '#4285f4' },
]

const ROLE_COLORS = {
  admin: { bg: '#fef2f2', color: '#dc2626' },
  staff: { bg: '#fef3c7', color: '#d97706' },
  mentor: { bg: '#eff6ff', color: '#3b82f6' },
  mentee: { bg: '#f0fdf4', color: '#16a34a' },
  trainee: { bg: '#f0fdf4', color: '#16a34a' },
  assistantmentor: { bg: '#faf5ff', color: '#7c3aed' },
  super_admin: { bg: '#fef2f2', color: '#dc2626' },
}

export default function OrganizationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [stats, setStats] = useState({ mentors: 0, mentees: 0, staff: 0, offerings: 0, users: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', plan: 'free', status: 'active' })
  const [flags, setFlags] = useState({})
  const [savingFlags, setSavingFlags] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  // License limits
  const [licenseLimits, setLicenseLimits] = useState({ mentors: -1, mentees: -1, staff: -1, assistant_mentors: -1, offerings: -1 })
  const [savingLicenses, setSavingLicenses] = useState(false)
  const [licenseSuccess, setLicenseSuccess] = useState(null)

  // Discount
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountNote, setDiscountNote] = useState('')
  const [savingDiscount, setSavingDiscount] = useState(false)
  const [discountSuccess, setDiscountSuccess] = useState(null)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmSlug] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Active Users
  const [activeUsers, setActiveUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => { loadOrg(); loadActiveUsers() }, [id])

  async function loadOrg() {
    const [orgRes, mentorsRes, menteesRes, staffRes, offeringsRes, usersRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', id).single(),
      supabase.from('mentors').select('id', { count: 'exact', head: true }).eq('organization_id', id),
      supabase.from('mentees').select('id', { count: 'exact', head: true }).eq('organization_id', id).neq('is_test_account', true),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('organization_id', id),
      supabase.from('offerings').select('id', { count: 'exact', head: true }).eq('organization_id', id),
      supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('organization_id', id),
    ])

    if (orgRes.data) {
      const orgStatus = orgRes.data.status || (orgRes.data.active ? 'active' : 'archived')
      setOrg({ ...orgRes.data, status: orgStatus })
      setForm({
        name: orgRes.data.name,
        slug: orgRes.data.slug,
        plan: orgRes.data.plan,
        status: orgStatus,
      })
      setFlags(orgRes.data.feature_flags || {})
      const ll = orgRes.data.license_limits
      if (ll && typeof ll === 'object') {
        setLicenseLimits({
          mentors: ll.mentors ?? -1,
          mentees: ll.mentees ?? -1,
          staff: ll.staff ?? -1,
          assistant_mentors: ll.assistant_mentors ?? -1,
          offerings: ll.offerings ?? -1,
        })
      }
      setDiscountPercent(orgRes.data.discount_percent || 0)
      setDiscountNote(orgRes.data.discount_note || '')
    }
    setStats({
      mentors: mentorsRes.count || 0,
      mentees: menteesRes.count || 0,
      staff: staffRes.count || 0,
      offerings: offeringsRes.count || 0,
      users: usersRes.count || 0,
    })
    setLoading(false)
  }

  async function loadActiveUsers() {
    setLoadingUsers(true)
    // Get user_roles for this org
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role, entity_id')
      .eq('organization_id', id)

    if (!roles || roles.length === 0) {
      setActiveUsers([])
      setLoadingUsers(false)
      return
    }

    // Get unique user IDs and fetch their profiles
    const userIds = [...new Set(roles.map(r => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, active_role')
      .in('id', userIds)

    // Also get last login info
    const { data: logins } = await supabase
      .from('login_events')
      .select('user_id, email, timestamp')
      .in('user_id', userIds)
      .order('timestamp', { ascending: false })

    // Build user list with roles and last login
    const userMap = {}
    roles.forEach(r => {
      if (!userMap[r.user_id]) {
        userMap[r.user_id] = { user_id: r.user_id, roles: [], email: null, lastLogin: null }
      }
      userMap[r.user_id].roles.push(r.role)
    })

    // Attach profile info
    ;(profiles || []).forEach(p => {
      if (userMap[p.id]) {
        userMap[p.id].email = p.email
      }
    })

    // Attach last login (take first since sorted desc)
    const seenLogins = new Set()
    ;(logins || []).forEach(l => {
      if (userMap[l.user_id] && !seenLogins.has(l.user_id)) {
        userMap[l.user_id].email = userMap[l.user_id].email || l.email
        userMap[l.user_id].lastLogin = l.timestamp
        seenLogins.add(l.user_id)
      }
    })

    setActiveUsers(Object.values(userMap).sort((a, b) => {
      if (b.lastLogin && !a.lastLogin) return 1
      if (a.lastLogin && !b.lastLogin) return -1
      if (a.lastLogin && b.lastLogin) return new Date(b.lastLogin) - new Date(a.lastLogin)
      return 0
    }))
    setLoadingUsers(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const { error: err } = await supabase.from('organizations').update({
      name: form.name,
      slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      plan: form.plan,
      status: form.status,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (err) {
      setError(err.message)
    } else {
      setSuccess('Organization updated successfully.')
      // Send pricing update email if plan changed
      if (org && form.plan !== org.plan) {
        try {
          await fetchWithSuperAdminAuth(`${SUPABASE_URL}/functions/v1/send-pricing-update-email`, {
            method: 'POST',
            body: JSON.stringify({ organization_id: id, changes: { plan: form.plan } }),
          })
        } catch (e) { console.error('Pricing email failed:', e) }
      }
      loadOrg()
    }
    setSaving(false)
  }

  async function handleSaveDiscount() {
    setSavingDiscount(true)
    setDiscountSuccess(null)

    const { error: err } = await supabase.from('organizations').update({
      discount_percent: discountPercent,
      discount_note: discountNote,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (!err) {
      setDiscountSuccess('Discount updated successfully.')
      setTimeout(() => setDiscountSuccess(null), 3000)
      // Send pricing update email for discount change
      try {
        await fetchWithSuperAdminAuth(`${SUPABASE_URL}/functions/v1/send-pricing-update-email`, {
          method: 'POST',
          body: JSON.stringify({ organization_id: id, changes: { discount_percent: discountPercent, discount_note: discountNote } }),
        })
      } catch (e) { console.error('Pricing email failed:', e) }
    }
    setSavingDiscount(false)
  }

  async function handleSaveLicenses() {
    setSavingLicenses(true)
    setLicenseSuccess(null)
    const { error: err } = await supabase.from('organizations').update({
      license_limits: licenseLimits,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (!err) {
      setLicenseSuccess('License limits updated successfully.')
      setTimeout(() => setLicenseSuccess(null), 3000)
      // Send pricing update email for license limit changes
      try {
        await fetchWithSuperAdminAuth(`${SUPABASE_URL}/functions/v1/send-pricing-update-email`, {
          method: 'POST',
          body: JSON.stringify({ organization_id: id, changes: { license_limits: licenseLimits } }),
        })
      } catch (e) { console.error('Pricing email failed:', e) }
      loadOrg()
    }
    setSavingLicenses(false)
  }

  async function toggleFlag(key) {
    const newFlags = { ...flags, [key]: flags[key] === false ? true : false }
    setFlags(newFlags)
    setSavingFlags(true)
    await supabase.from('organizations').update({ feature_flags: newFlags, updated_at: new Date().toISOString() }).eq('id', id)
    setSavingFlags(false)
  }

  function handleViewAsAdmin() {
    if (org?.slug) {
      window.open(`${ORG_APP_URL}/${org.slug}/login`, '_blank')
    }
  }

  async function handleDelete() {
    if (deleteConfirmName !== org.name) return
    setDeleting(true)
    setError(null)

    // ── Diagnostic logging for delete troubleshooting ──
    console.group('🔴 DELETE ORGANIZATION DEBUG')
    console.log('Target org ID:', id)
    console.log('Target org name:', org.name)
    console.log('Confirmation input:', deleteConfirmName)
    console.log('Name match:', deleteConfirmName === org.name)

    // Check auth state
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData?.session
    console.log('Supabase session exists:', !!session)
    console.log('Session user ID:', session?.user?.id ?? 'NO USER')
    console.log('Session user email:', session?.user?.email ?? 'NO EMAIL')
    console.log('Access token present:', !!session?.access_token)
    console.log('Access token expires_at:', session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A')
    console.log('Token expired?', session?.expires_at ? (session.expires_at * 1000 < Date.now()) : 'N/A')

    // Check user_roles for super_admin (read-only diagnostic)
    if (session?.user?.id) {
      const { data: roles, error: roleErr } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', session.user.id)
      console.log('User roles query result:', roles)
      console.log('User roles query error:', roleErr)
      console.log('Has super_admin role:', roles?.some(r => r.role === 'super_admin'))
    }

    try {
      console.log('Calling supabase.rpc("delete_organization", { target_org_id:', id, '})')
      const startTime = performance.now()
      const { data, error: delErr } = await supabase.rpc('delete_organization', { target_org_id: id })
      const elapsed = (performance.now() - startTime).toFixed(0)
      console.log(`RPC completed in ${elapsed}ms`)
      console.log('RPC response data:', JSON.stringify(data, null, 2))
      console.log('RPC response error:', delErr ? JSON.stringify(delErr, null, 2) : 'null')

      if (delErr) {
        console.error('DELETE FAILED — Error object:', delErr)
        console.error('Error message:', delErr.message)
        console.error('Error details:', delErr.details)
        console.error('Error hint:', delErr.hint)
        console.error('Error code:', delErr.code)
        console.groupEnd()
        setError(`Delete failed: ${delErr.message}${delErr.details ? ` — ${delErr.details}` : ''}${delErr.hint ? ` (${delErr.hint})` : ''}`)
      } else {
        console.log('DELETE SUCCEEDED — navigating to /organizations')
        console.groupEnd()
        navigate('/organizations')
      }
    } catch (err) {
      console.error('DELETE EXCEPTION:', err)
      console.error('Exception name:', err.name)
      console.error('Exception message:', err.message)
      console.error('Exception stack:', err.stack)
      console.groupEnd()
      setError(`Delete failed: ${err.message}`)
    }
    setDeleting(false)
  }

  async function handleStatusChange(newStatus) {
    const { error: err } = await supabase.from('organizations').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) {
      setError(err.message)
    } else {
      const messages = {
        active: 'Organization reactivated.',
        locked: 'Organization locked. Users will not be able to log in.',
        archived: 'Organization archived. Users will not be able to log in.',
      }
      setSuccess(messages[newStatus])
      setOrg({ ...org, status: newStatus, active: newStatus === 'active' })
      setForm({ ...form, status: newStatus })
    }
  }

  const filteredUsers = activeUsers.filter(u =>
    !userSearch || (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
    u.roles.some(r => r.toLowerCase().includes(userSearch.toLowerCase()))
  )

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>
  if (!org) return <div style={{ padding: '2rem', color: '#dc2626' }}>Organization not found</div>

  const pd = PLAN_LIMITS[form.plan] || PLAN_LIMITS.free
  // Use per-org license limits; -1 means unlimited
  const ll = licenseLimits
  const getMax = key => ll[key] === -1 ? Infinity : (ll[key] ?? pd.limits[key])

  return (
    <div>
      <Link to="/organizations" style={s.backLink}>
        <ArrowLeft size={16} /> Back to Organizations
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div style={s.header}>
          <div style={s.headerIcon}>
            <Building2 size={24} color="#fff" />
          </div>
          <div>
            <h1 style={s.title}>{org.name}</h1>
            <p style={s.sub}>
              <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{org.slug}</span>
              {' '}&middot;{' '}
              <span style={{ ...s.badge, ...statusStyle(org.status) }}>
                {statusLabel(org.status)}
              </span>
              {discountPercent > 0 && (
                <>
                  {' '}&middot;{' '}
                  <span style={{ ...s.badge, background: '#fef3c7', color: '#d97706' }}>
                    {discountPercent}% discount
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {org.status === 'active' && (
            <>
              <button style={s.lockBtn} onClick={() => handleStatusChange('locked')}>
                <Lock size={14} /> Lock
              </button>
              <button style={s.archiveBtn} onClick={() => handleStatusChange('archived')}>
                <Archive size={14} /> Archive
              </button>
            </>
          )}
          {org.status === 'locked' && (
            <>
              <button style={s.unlockBtn} onClick={() => handleStatusChange('active')}>
                <Unlock size={14} /> Unlock
              </button>
              <button style={s.archiveBtn} onClick={() => handleStatusChange('archived')}>
                <Archive size={14} /> Archive
              </button>
            </>
          )}
          {org.status === 'archived' && (
            <button style={s.reactivateBtn} onClick={() => handleStatusChange('active')}>
              <RotateCcw size={14} /> Reactivate
            </button>
          )}
          <button style={s.impersonateBtn} onClick={handleViewAsAdmin}>
            <ExternalLink size={16} /> View as Admin
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard icon={Users} label="User Roles" value={stats.users} color="#6366f1" />
        <StatCard icon={UserCheck} label="Mentors" value={stats.mentors} max={getMax('mentors')} color="#3b82f6" />
        <StatCard icon={Users} label="Mentees" value={stats.mentees} max={getMax('mentees')} color="#16a34a" />
        <StatCard icon={Users2} label="Staff" value={stats.staff} max={getMax('staff')} color="#f59e0b" />
        <StatCard icon={Package} label="Offerings" value={stats.offerings} max={getMax('offerings')} color="#8b5cf6" />
      </div>

      {/* Plan Usage */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>License Usage</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <UsageBar label="Mentors" current={stats.mentors} max={getMax('mentors')} color="#3b82f6" />
          <UsageBar label="Mentees" current={stats.mentees} max={getMax('mentees')} color="#16a34a" />
          <UsageBar label="Staff" current={stats.staff} max={getMax('staff')} color="#f59e0b" />
          <UsageBar label="Offerings" current={stats.offerings} max={getMax('offerings')} color="#8b5cf6" />
        </div>
      </div>

      {/* Edit Form */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Organization Settings</h2>
        <form onSubmit={handleSave} style={s.form}>
          <div style={s.formRow}>
            <div style={s.field}>
              <label style={s.label}>Name</label>
              <input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Slug</label>
              <input
                style={s.input}
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                required
              />
            </div>
          </div>
          <div style={s.formRow}>
            <div style={s.field}>
              <label style={s.label}>Plan</label>
              <select style={s.input} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Status</label>
              <select style={s.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="locked">Locked</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {error && <div style={s.errorBox}>{error}</div>}
          {success && <div style={s.successBox}>{success}</div>}
          <button type="submit" style={s.saveBtn} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* License Limits */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          <Shield size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          License Limits
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
          Set the maximum number of each entity type this organization can create. Use -1 for unlimited.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            { key: 'mentors', label: 'Mentors', icon: UserCheck },
            { key: 'mentees', label: 'Mentees', icon: Users },
            { key: 'staff', label: 'Staff', icon: Users2 },
            { key: 'assistant_mentors', label: 'Asst. Mentors', icon: Users },
            { key: 'offerings', label: 'Offerings', icon: Package },
          ].map(({ key, label, icon: Icon }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon size={13} color="#64748b" />
                <label style={s.label}>{label}</label>
              </div>
              <input
                style={s.input}
                type="number"
                min="-1"
                value={licenseLimits[key]}
                onChange={e => setLicenseLimits(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
              />
              {licenseLimits[key] === -1 && (
                <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>Unlimited</span>
              )}
            </div>
          ))}
        </div>
        {licenseSuccess && <div style={{ ...s.successBox, marginTop: '0.75rem' }}>{licenseSuccess}</div>}
        <button style={{ ...s.saveBtn, marginTop: '1rem' }} onClick={handleSaveLicenses} disabled={savingLicenses}>
          {savingLicenses ? 'Saving...' : 'Save License Limits'}
        </button>
      </div>

      {/* Discount Management */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          <Percent size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Billing Discount
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
          Apply a discount to this organization's subscription billing
        </p>
        <div style={s.formRow}>
          <div style={s.field}>
            <label style={s.label}>Discount Percentage</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                style={{ ...s.input, width: 100 }}
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
              />
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>%</span>
            </div>
          </div>
          <div style={{ ...s.field, flex: '2 1 300px' }}>
            <label style={s.label}>Discount Note <span style={{ fontWeight: 400, color: '#94a3b8' }}>(internal)</span></label>
            <input
              style={s.input}
              value={discountNote}
              onChange={e => setDiscountNote(e.target.value)}
              placeholder="e.g. Early adopter discount, nonprofit rate..."
            />
          </div>
        </div>
        {discountPercent > 0 && pd.price && (
          <div style={{ marginTop: '0.75rem', padding: '0.7rem 1rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#92400e' }}>
              Effective price: <strong>${(pd.price * (1 - discountPercent / 100)).toFixed(2)}/mo</strong>
              {' '}(was ${pd.price}/mo)
            </span>
          </div>
        )}
        {discountSuccess && <div style={{ ...s.successBox, marginTop: '0.75rem' }}>{discountSuccess}</div>}
        <button
          style={{ ...s.saveBtn, marginTop: '0.75rem' }}
          onClick={handleSaveDiscount}
          disabled={savingDiscount}
        >
          {savingDiscount ? 'Saving...' : 'Save Discount'}
        </button>
      </div>

      {/* Feature Flags */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Feature Flags {savingFlags && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>saving...</span>}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {KNOWN_FLAGS.map(({ key, label }) => {
            const enabled = flags[key] !== false
            return (
              <button
                key={key}
                onClick={() => toggleFlag(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                  border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                  background: enabled ? '#dcfce7' : '#f1f5f9',
                  borderColor: enabled ? '#86efac' : '#e2e8f0',
                  color: enabled ? '#16a34a' : '#94a3b8',
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: enabled ? '#16a34a' : '#cbd5e1',
                }} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Integrations */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          <Plug size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Integrations {savingFlags && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>saving...</span>}
        </h2>
        {flags.integrations === false ? (
          <div style={{ padding: '1.25rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <Plug size={24} color="#cbd5e1" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
              Integrations module is disabled for this organization. Enable the "Integrations" feature flag above to configure individual integrations.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {INTEGRATION_FLAGS.map(({ key, label, description, icon: Icon, color }) => {
              const enabled = flags[key] !== false
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', borderRadius: 8,
                    border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                    background: enabled ? '#f0fdf4' : '#f8fafc',
                    borderColor: enabled ? '#bbf7d0' : '#e2e8f0',
                  }}
                  onClick={() => toggleFlag(key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: enabled ? color + '14' : '#f1f5f9',
                    }}>
                      <Icon size={18} color={enabled ? color : '#94a3b8'} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: enabled ? '#0f172a' : '#64748b' }}>{label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{description}</div>
                    </div>
                  </div>
                  <div style={{
                    width: 40, height: 22, borderRadius: 11, position: 'relative',
                    background: enabled ? '#16a34a' : '#cbd5e1', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3,
                      left: enabled ? 21 : 3,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Active Users */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={s.cardTitle}>
            <Users size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Active User Accounts ({activeUsers.length})
          </h2>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 0.8rem', background: '#f8fafc', borderRadius: 6,
            border: '1px solid #e2e8f0',
          }}>
            <Search size={13} color="#94a3b8" />
            <input
              style={{ border: 'none', outline: 'none', fontSize: '0.82rem', color: '#0f172a', background: 'transparent', width: 160 }}
              placeholder="Search users..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
        </div>

        {loadingUsers ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            {userSearch ? 'No matching users' : 'No user accounts found'}
          </div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', padding: '0.65rem 1rem', background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0', fontSize: '0.7rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b',
            }}>
              <span style={{ flex: 2 }}>Email</span>
              <span style={{ flex: 1.5 }}>Roles</span>
              <span style={{ flex: 1 }}>Last Login</span>
            </div>
            {filteredUsers.map(user => (
              <div key={user.user_id} style={{
                display: 'flex', alignItems: 'center', padding: '0.7rem 1rem',
                borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem',
              }}>
                <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Mail size={13} color="#94a3b8" />
                  <span style={{ color: '#0f172a', fontWeight: 500 }}>{user.email || 'Unknown'}</span>
                </span>
                <span style={{ flex: 1.5, display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {user.roles.map(role => {
                    const rc = ROLE_COLORS[role] || { bg: '#f1f5f9', color: '#64748b' }
                    return (
                      <span key={role} style={{
                        padding: '0.12rem 0.45rem', borderRadius: 4, fontSize: '0.68rem',
                        fontWeight: 600, background: rc.bg, color: rc.color, textTransform: 'capitalize',
                      }}>
                        {role === 'assistantmentor' ? 'Assistant Mentor' : role}
                      </span>
                    )
                  })}
                </span>
                <span style={{ flex: 1, fontSize: '0.78rem', color: '#64748b' }}>
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Details</h2>
        <div style={s.metaRow}><span style={s.metaLabel}>ID</span><span style={s.metaValue}>{org.id}</span></div>
        <div style={s.metaRow}><span style={s.metaLabel}>Created</span><span style={s.metaValue}>{new Date(org.created_at).toLocaleString()}</span></div>
        <div style={s.metaRow}><span style={s.metaLabel}>Updated</span><span style={s.metaValue}>{new Date(org.updated_at).toLocaleString()}</span></div>
      </div>

      {/* Danger Zone */}
      <div style={{ ...s.card, borderColor: '#fecaca' }}>
        <h2 style={{ ...s.cardTitle, color: '#dc2626' }}>
          <Trash2 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Danger Zone
        </h2>
        {!showDeleteConfirm ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>Delete this organization</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Permanently remove this organization and all associated data. This cannot be undone.
              </div>
            </div>
            <button
              style={s.deleteBtn}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} /> Delete Organization
            </button>
          </div>
        ) : (
          <div style={{ background: '#fef2f2', borderRadius: 8, padding: '1.25rem', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '0.88rem', color: '#dc2626', fontWeight: 600, marginBottom: '0.75rem' }}>
              Are you sure? This will permanently delete <strong>{org.name}</strong> and all its data.
            </p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>
              Type <strong>{org.name}</strong> to confirm:
            </p>
            <input
              style={{ ...s.input, borderColor: '#fecaca', marginBottom: '0.75rem', width: '100%' }}
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmSlug(e.target.value)}
              placeholder={org.name}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                style={{ ...s.deleteBtn, opacity: deleteConfirmName === org.name ? 1 : 0.5 }}
                onClick={handleDelete}
                disabled={deleteConfirmName !== org.name || deleting}
              >
                {deleting ? 'Deleting...' : 'I understand, delete this organization'}
              </button>
              <button
                style={s.cancelBtn}
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmSlug('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function statusLabel(status) {
  if (status === 'locked') return 'Locked'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function statusStyle(status) {
  if (status === 'locked') return { background: '#fef3c7', color: '#d97706' }
  if (status === 'archived') return { background: '#f1f5f9', color: '#64748b' }
  return { background: '#dcfce7', color: '#16a34a' }
}

function StatCard({ icon: Icon, label, value, max, color }) {
  const hasLimit = max !== undefined && max !== Infinity
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIcon, background: color + '14', color }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={s.statValue}>
          {value}
          {hasLimit && <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8' }}> / {max}</span>}
        </div>
        <div style={s.statLabel}>{label}</div>
      </div>
    </div>
  )
}

const s = {
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
    marginBottom: '1.25rem',
  },
  header: { display: 'flex', alignItems: 'center', gap: '1rem' },
  headerIcon: {
    width: 52, height: 52, borderRadius: 8,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
  },
  title: { fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.15rem' },
  sub: { color: '#64748b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  badge: { padding: '0.15rem 0.5rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 },
  statsRow: { display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' },
  statCard: {
    flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1rem 1.1rem', background: '#fff', borderRadius: 9,
    border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  statIcon: { width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' },
  statLabel: { fontSize: '0.72rem', color: '#64748b', fontWeight: 500 },
  card: {
    background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
    padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardTitle: { fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  formRow: { display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  field: { flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  input: {
    padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.9rem', color: '#0f172a', outline: 'none',
  },
  saveBtn: {
    alignSelf: 'flex-start', padding: '0.6rem 1.25rem',
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
  },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.7rem 1rem', color: '#dc2626', fontSize: '0.85rem' },
  successBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.7rem 1rem', color: '#16a34a', fontSize: '0.85rem' },
  metaRow: { display: 'flex', padding: '0.6rem 0', borderBottom: '1px solid #f1f5f9' },
  metaLabel: { width: 140, fontSize: '0.82rem', fontWeight: 600, color: '#64748b' },
  metaValue: { flex: 1, fontSize: '0.85rem', color: '#0f172a', fontFamily: 'monospace', wordBreak: 'break-all' },
  impersonateBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.1rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.3)', whiteSpace: 'nowrap',
  },
  archiveBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.6rem 1.1rem', background: '#f1f5f9', color: '#64748b',
    border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  lockBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.6rem 1.1rem', background: '#fef3c7', color: '#d97706',
    border: '1.5px solid #fde68a', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  unlockBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.6rem 1.1rem', background: '#dcfce7', color: '#16a34a',
    border: '1.5px solid #bbf7d0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  reactivateBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.6rem 1.1rem', background: '#dcfce7', color: '#16a34a',
    border: '1.5px solid #bbf7d0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  deleteBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.55rem 1rem', background: '#dc2626', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  cancelBtn: {
    padding: '0.55rem 1rem', background: '#f1f5f9', color: '#64748b',
    border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  },
}
