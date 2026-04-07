import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Building2, Users, UserCheck, Users2, Activity, DollarSign, Clock, AlertCircle, Receipt } from 'lucide-react'
import { PLAN_LIMITS } from '../constants/planLimits'

function dashStatusLabel(org) {
  const status = org.status || (org.active ? 'active' : 'archived')
  if (status === 'locked') return 'Locked'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function dashStatusStyle(org) {
  const status = org.status || (org.active ? 'active' : 'archived')
  if (status === 'locked') return { background: '#fef3c7', color: '#d97706' }
  if (status === 'archived') return { background: '#f1f5f9', color: '#64748b' }
  return { background: '#dcfce7', color: '#16a34a' }
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({ orgs: 0, users: 0, activeOrgs: 0, mentors: 0, mentees: 0, staff: 0 })
  const [recentOrgs, setRecentOrgs] = useState([])
  const [orgBreakdown, setOrgBreakdown] = useState([])
  const [recentLogins, setRecentLogins] = useState([])
  const [invoiceStats, setInvoiceStats] = useState({ pending: 0, pendingAmount: 0, overdue: 0, overdueAmount: 0, collected: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [orgsRes, usersRes, recentRes, mentorsRes, menteesRes, staffRes, loginsRes] = await Promise.all([
        supabase.from('organizations').select('id, name, slug, active, plan, created_at', { count: 'exact' }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('organizations').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('mentors').select('id', { count: 'exact', head: true }),
        supabase.from('mentees').select('id', { count: 'exact', head: true }).neq('is_test_account', true),
        supabase.from('staff').select('id', { count: 'exact', head: true }),
        supabase.from('login_events').select('id, email, timestamp, organization_id').order('timestamp', { ascending: false }).limit(10),
      ])

      const orgs = orgsRes.data || []
      setStats({
        orgs: orgsRes.count || orgs.length,
        users: usersRes.count || 0,
        activeOrgs: orgs.filter(o => (o.status || (o.active ? 'active' : 'archived')) === 'active').length,
        mentors: mentorsRes.count || 0,
        mentees: menteesRes.count || 0,
        staff: staffRes.count || 0,
      })
      setRecentOrgs(recentRes.data || [])
      setRecentLogins(loginsRes.data || [])

      // Load platform invoice stats
      const { data: platInvoices } = await supabase
        .from('platform_invoices')
        .select('id, amount, status, due_date')
      if (platInvoices) {
        const today = new Date().toISOString().split('T')[0]
        const items = platInvoices.map(i =>
          (i.status === 'pending' || i.status === 'sent') && i.due_date && i.due_date < today
            ? { ...i, status: 'overdue' } : i
        )
        const pending = items.filter(i => i.status === 'pending' || i.status === 'sent')
        const overdue = items.filter(i => i.status === 'overdue')
        const paid = items.filter(i => i.status === 'paid')
        setInvoiceStats({
          pending: pending.length,
          pendingAmount: pending.reduce((s, i) => s + Number(i.amount), 0),
          overdue: overdue.length,
          overdueAmount: overdue.reduce((s, i) => s + Number(i.amount), 0),
          collected: paid.reduce((s, i) => s + Number(i.amount), 0),
        })
      }

      // Build per-org breakdown
      if (orgs.length > 0) {
        const orgIds = orgs.map(o => o.id)
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('organization_id, role')
          .in('organization_id', orgIds)

        const breakdown = orgs.map(org => {
          const orgRoles = (roleData || []).filter(r => r.organization_id === org.id)
          return {
            ...org,
            userCount: orgRoles.length,
            mentorCount: orgRoles.filter(r => r.role === 'mentor').length,
            menteeCount: orgRoles.filter(r => ['mentee', 'trainee'].includes(r.role)).length,
          }
        }).sort((a, b) => b.userCount - a.userCount)
        setOrgBreakdown(breakdown)
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>MentorDesk Platform</h1>
        <p style={s.sub}>Super Admin Dashboard</p>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard icon={Building2} label="Organizations" value={stats.orgs} color="#6366f1" />
        <StatCard icon={Building2} label="Active Orgs" value={stats.activeOrgs} color="#16a34a" />
        <StatCard icon={Users} label="User Roles" value={stats.users} color="#f59e0b" />
        <StatCard icon={UserCheck} label="Mentors" value={stats.mentors} color="#3b82f6" />
        <StatCard icon={Users} label="Mentees" value={stats.mentees} color="#8b5cf6" />
        <StatCard icon={Users2} label="Staff" value={stats.staff} color="#ec4899" />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Per-Org Breakdown */}
        <div style={{ flex: '2 1 400px' }}>
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <h2 style={s.sectionTitle}>Organization Breakdown</h2>
              <Link to="/organizations" style={s.viewAll}>View all</Link>
            </div>
            <div style={s.table}>
              <div style={s.tableHead}>
                <span style={{ flex: 2 }}>Organization</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Users</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Mentors</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Mentees</span>
                <span style={{ flex: 1 }}>Plan</span>
              </div>
              {orgBreakdown.map(org => (
                <Link key={org.id} to={`/organizations/${org.id}`} style={{ textDecoration: 'none' }}>
                  <div style={s.tableRow}>
                    <span style={{ flex: 2, fontWeight: 600, color: '#0f172a' }}>{org.name}</span>
                    <span style={{ flex: 1, textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>{org.userCount}</span>
                    <span style={{ flex: 1, textAlign: 'center', color: '#64748b' }}>{org.mentorCount}</span>
                    <span style={{ flex: 1, textAlign: 'center', color: '#64748b' }}>{org.menteeCount}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ ...s.badge, background: org.plan === 'pro' ? '#ede9fe' : org.plan === 'enterprise' ? '#fef3c7' : '#f1f5f9', color: org.plan === 'pro' ? '#7c3aed' : org.plan === 'enterprise' ? '#d97706' : '#64748b' }}>
                        {org.plan}
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
              {orgBreakdown.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No organizations yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Logins */}
        <div style={{ flex: '1 1 280px' }}>
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Recent Logins</h2>
            <div style={{ ...s.table, marginTop: '1rem' }}>
              {recentLogins.map((login, i) => (
                <div key={login.id || i} style={{ ...s.tableRow, padding: '0.7rem 1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{login.email}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                      {login.timestamp ? new Date(login.timestamp).toLocaleString() : 'Unknown'}
                    </div>
                  </div>
                </div>
              ))}
              {recentLogins.length === 0 && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No recent logins</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Platform Revenue */}
      {(invoiceStats.pending > 0 || invoiceStats.overdue > 0 || invoiceStats.collected > 0) && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>Platform Revenue</h2>
            <Link to="/invoicing" style={s.viewAll}>Manage invoices</Link>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ ...s.revenueCard, borderLeft: '3px solid #ea580c' }}>
              <Clock size={16} color="#ea580c" />
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoiceStats.pendingAmount)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{invoiceStats.pending} pending</div>
              </div>
            </div>
            <div style={{ ...s.revenueCard, borderLeft: '3px solid #dc2626' }}>
              <AlertCircle size={16} color="#dc2626" />
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoiceStats.overdueAmount)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{invoiceStats.overdue} overdue</div>
              </div>
            </div>
            <div style={{ ...s.revenueCard, borderLeft: '3px solid #16a34a' }}>
              <DollarSign size={16} color="#16a34a" />
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoiceStats.collected)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>collected all-time</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orgs */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Recently Created</h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {recentOrgs.map(org => (
            <Link key={org.id} to={`/organizations/${org.id}`} style={{ textDecoration: 'none', flex: '1 1 200px', maxWidth: 300 }}>
              <div style={s.orgCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <Building2 size={16} color="#6366f1" />
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{org.name}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace' }}>{org.slug}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                  <span style={{ ...s.badge, ...dashStatusStyle(org) }}>
                    {dashStatusLabel(org)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {new Date(org.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIcon, background: color + '14', color }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={s.statValue}>{value}</div>
        <div style={s.statLabel}>{label}</div>
      </div>
    </div>
  )
}

const s = {
  header: { marginBottom: '2rem' },
  title: { fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.25rem' },
  sub: { color: '#64748b', fontSize: '0.95rem' },
  statsRow: { display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' },
  statCard: {
    flex: '1 1 150px',
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '1rem 1.25rem',
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  statIcon: { width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' },
  statLabel: { fontSize: '0.72rem', color: '#64748b', fontWeight: 500 },
  section: { marginBottom: '2rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' },
  viewAll: { color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' },
  table: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' },
  tableHead: {
    display: 'flex',
    padding: '0.75rem 1.25rem',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#64748b',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.85rem 1.25rem',
    borderBottom: '1px solid #f1f5f9',
    fontSize: '0.88rem',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  badge: {
    padding: '0.2rem 0.6rem',
    borderRadius: 6,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  orgCard: {
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    padding: '1rem 1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'box-shadow 0.15s',
  },
  revenueCard: {
    flex: '1 1 180px',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
  },
}
