import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Building2, Plus, Search, ExternalLink, Users, Percent, ChevronDown } from 'lucide-react'

const ORG_APP_URL = import.meta.env.VITE_ORG_APP_URL || ''

function orgStatusLabel(org) {
  const status = org.status || (org.active ? 'active' : 'archived')
  if (status === 'locked') return 'Locked'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function orgStatusStyle(org) {
  const status = org.status || (org.active ? 'active' : 'archived')
  if (status === 'locked') return { background: '#fef3c7', color: '#d97706' }
  if (status === 'archived') return { background: '#f1f5f9', color: '#64748b' }
  return { background: '#dcfce7', color: '#16a34a' }
}

export default function ManageOrganizations() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState(searchParams.get('plan') || 'all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', plan: 'free', admin_email: '', admin_first_name: '', admin_last_name: '', license_mentors: '-1', license_mentees: '-1', license_staff: '-1', license_assistant_mentors: '-1', license_offerings: '-1' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => { loadOrgs() }, [])

  async function loadOrgs() {
    const { data: orgsData } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })

    if (!orgsData) { setOrgs([]); setLoading(false); return }

    // Load user counts per org
    const orgIds = orgsData.map(o => o.id)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('organization_id, role')
      .in('organization_id', orgIds)

    const enriched = orgsData.map(org => {
      const orgRoles = (roleData || []).filter(r => r.organization_id === org.id)
      return {
        ...org,
        userCount: orgRoles.length,
        adminCount: orgRoles.filter(r => r.role === 'admin').length,
        mentorCount: orgRoles.filter(r => r.role === 'mentor').length,
        menteeCount: orgRoles.filter(r => ['mentee', 'trainee'].includes(r.role)).length,
        staffCount: orgRoles.filter(r => r.role === 'staff').length,
      }
    })

    setOrgs(enriched)
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setSuccess(null)

    const { data, error: err } = await supabase.functions.invoke('create-organization', {
      body: {
        name: form.name,
        slug: form.slug,
        plan: form.plan,
        admin_email: form.admin_email || undefined,
        admin_first_name: form.admin_first_name || undefined,
        admin_last_name: form.admin_last_name || undefined,
      },
    })

    if (err) {
      setError(err.message || 'Failed to create organization')
    } else if (data?.error) {
      setError(data.error)
    } else {
      // Save license limits on the newly created org
      if (data?.organization_id) {
        const ll = {
          mentors: parseInt(form.license_mentors) || -1,
          mentees: parseInt(form.license_mentees) || -1,
          staff: parseInt(form.license_staff) || -1,
          assistant_mentors: parseInt(form.license_assistant_mentors) || -1,
          offerings: parseInt(form.license_offerings) || -1,
        }
        await supabase.from('organizations').update({ license_limits: ll }).eq('id', data.organization_id)
      }
      setSuccess(`Organization "${form.name}" created successfully!`)
      setForm({ name: '', slug: '', plan: 'free', admin_email: '', admin_first_name: '', admin_last_name: '', license_mentors: '-1', license_mentees: '-1', license_staff: '-1', license_assistant_mentors: '-1', license_offerings: '-1' })
      setShowCreate(false)
      loadOrgs()
    }
    setCreating(false)
  }

  function handleViewAsAdmin(slug, e) {
    e.preventDefault()
    e.stopPropagation()
    window.open(`${ORG_APP_URL}/${slug}/login`, '_blank')
  }

  const filtered = orgs.filter(o => {
    const matchesSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase())
    const matchesPlan = filterPlan === 'all' || o.plan === filterPlan
    const orgStatus = o.status || (o.active ? 'active' : 'archived')
    const matchesStatus = filterStatus === 'all' || orgStatus === filterStatus
    return matchesSearch && matchesPlan && matchesStatus
  })

  const totalUsers = orgs.reduce((sum, o) => sum + o.userCount, 0)

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Organizations</h1>
          <p style={s.sub}>
            Manage all tenant organizations &middot; {orgs.length} org{orgs.length !== 1 ? 's' : ''} &middot; {totalUsers} total users
          </p>
        </div>
        <button style={s.createBtn} onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} /> New Organization
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={s.createCard}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
            Create New Organization
          </h3>
          <form onSubmit={handleCreate} style={s.createForm}>
            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>Organization Name *</label>
                <input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div style={s.field}>
                <label style={s.label}>Slug * <span style={{ fontWeight: 400, color: '#94a3b8' }}>(URL identifier)</span></label>
                <input
                  style={s.input}
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  required
                  placeholder="acme-coaching"
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>Plan</label>
                <select style={s.input} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>First Admin Email <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <input style={s.input} type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@example.com" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Admin First Name</label>
                <input style={s.input} value={form.admin_first_name} onChange={e => setForm({ ...form, admin_first_name: e.target.value })} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Admin Last Name</label>
                <input style={s.input} value={form.admin_last_name} onChange={e => setForm({ ...form, admin_last_name: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <label style={{ ...s.label, marginBottom: '0.5rem', display: 'block' }}>License Limits <span style={{ fontWeight: 400, color: '#94a3b8' }}>(-1 for unlimited)</span></label>
              <div style={{ ...s.formRow, gap: '0.75rem' }}>
                {[
                  { key: 'license_mentors', label: 'Mentors' },
                  { key: 'license_mentees', label: 'Mentees' },
                  { key: 'license_staff', label: 'Staff' },
                  { key: 'license_assistant_mentors', label: 'Asst. Mentors' },
                  { key: 'license_offerings', label: 'Offerings' },
                ].map(f => (
                  <div key={f.key} style={{ flex: '1 1 100px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem', display: 'block' }}>{f.label}</label>
                    <input style={{ ...s.input, width: '100%' }} type="number" min="-1" value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            {success && <div style={s.successBox}>{success}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" style={s.submitBtn} disabled={creating}>
                {creating ? 'Creating...' : 'Create Organization'}
              </button>
              <button type="button" style={s.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={s.searchWrap}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            style={s.searchInput}
            placeholder="Search organizations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.filterWrap}>
          <ChevronDown size={14} style={{ color: '#94a3b8', position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <select
            style={s.filterSelect}
            value={filterPlan}
            onChange={e => setFilterPlan(e.target.value)}
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div style={s.filterWrap}>
          <ChevronDown size={14} style={{ color: '#94a3b8', position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <select
            style={s.filterSelect}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={s.table}>
        <div style={s.tableHead}>
          <span style={{ flex: 2 }}>Organization</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Active Users</span>
          <span style={{ flex: 1 }}>Plan</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Discount</span>
          <span style={{ flex: 1 }}>Status</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Actions</span>
        </div>
        {filtered.map(org => (
          <Link key={org.id} to={`/organizations/${org.id}`} style={{ textDecoration: 'none' }}>
            <div style={s.tableRow}>
              <span style={{ flex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>{org.name}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8' }}>{org.slug}</div>
                  </div>
                </div>
              </span>
              <span style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <Users size={13} color="#64748b" />
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{org.userCount}</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>
                  {org.mentorCount}m / {org.menteeCount}me / {org.staffCount}s
                </div>
              </span>
              <span style={{ flex: 1 }}>
                <span style={{
                  ...s.badge,
                  background: org.plan === 'pro' ? '#ede9fe' : org.plan === 'enterprise' ? '#fef3c7' : org.plan === 'starter' ? '#eff6ff' : '#f1f5f9',
                  color: org.plan === 'pro' ? '#7c3aed' : org.plan === 'enterprise' ? '#d97706' : org.plan === 'starter' ? '#3b82f6' : '#64748b',
                }}>
                  {org.plan}
                </span>
              </span>
              <span style={{ flex: 1, textAlign: 'center' }}>
                {org.discount_percent > 0 ? (
                  <span style={{ ...s.badge, background: '#fef3c7', color: '#d97706' }}>
                    <Percent size={10} style={{ marginRight: 2 }} />
                    {org.discount_percent}%
                  </span>
                ) : (
                  <span style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>—</span>
                )}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ ...s.badge, ...orgStatusStyle(org) }}>
                  {orgStatusLabel(org)}
                </span>
              </span>
              <span style={{ flex: 1, textAlign: 'right' }}>
                <button
                  style={s.impersonateBtn}
                  onClick={e => handleViewAsAdmin(org.slug, e)}
                  title="Open org login page"
                >
                  <ExternalLink size={13} /> View as Admin
                </button>
              </span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            {search || filterPlan !== 'all' || filterStatus !== 'all' ? 'No matching organizations' : 'No organizations yet'}
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title: { fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.25rem' },
  sub: { color: '#64748b', fontSize: '0.9rem' },
  createBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.1rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
  },
  createCard: {
    background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
    padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  createForm: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  formRow: { display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  field: { flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  input: {
    padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.9rem', color: '#0f172a', outline: 'none',
  },
  submitBtn: {
    padding: '0.6rem 1.25rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '0.6rem 1.25rem', background: '#f1f5f9',
    color: '#64748b', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
  },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.7rem 1rem', color: '#dc2626', fontSize: '0.85rem' },
  successBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.7rem 1rem', color: '#16a34a', fontSize: '0.85rem' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.65rem 1rem', background: '#fff', borderRadius: 8,
    border: '1.5px solid #e2e8f0', flex: '1 1 200px',
  },
  searchInput: { flex: 1, border: 'none', outline: 'none', fontSize: '0.9rem', color: '#0f172a' },
  filterWrap: { position: 'relative' },
  filterSelect: {
    padding: '0.65rem 2rem 0.65rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.85rem', color: '#374151', background: '#fff', outline: 'none',
    appearance: 'none', cursor: 'pointer', fontWeight: 500,
  },
  table: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' },
  tableHead: {
    display: 'flex', padding: '0.75rem 1.25rem', background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0', fontSize: '0.72rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '0.85rem 1.25rem',
    borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem', cursor: 'pointer',
    transition: 'background 0.1s',
  },
  badge: {
    padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem',
    fontWeight: 600, textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center',
  },
  impersonateBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.35rem 0.7rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 1px 4px rgba(245,158,11,0.3)', whiteSpace: 'nowrap',
  },
}
