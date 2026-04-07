import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { UserCheck, Users, Users2, Package, BarChart3, Plus, ArrowRight, TrendingUp, CreditCard, Receipt, HeartHandshake, DollarSign, UserPlus } from 'lucide-react'
import UsageBar from '../components/UsageBar'

export default function AdminDashboard() {
  const { activeRole, staffPerms, checkLimit } = useRole()
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ mentors: 0, mentees: 0, staff: 0, offerings: 0 })
  const isAdmin = activeRole === 'admin'
  const can = (perm) => isAdmin || (staffPerms && staffPerms[perm])

  useEffect(() => {
    async function loadCounts() {
      const [mentors, mentees, staff, offerings] = await Promise.all([
        supabase.from('mentors').select('id', { count: 'exact', head: true }),
        supabase.from('mentees').select('id', { count: 'exact', head: true }).neq('is_test_account', true),
        supabase.from('staff').select('id', { count: 'exact', head: true }),
        supabase.from('offerings').select('id', { count: 'exact', head: true }).eq('active', true),
      ])
      setCounts({
        mentors: mentors.count || 0,
        mentees: mentees.count || 0,
        staff: staff.count || 0,
        offerings: offerings.count || 0,
      })
    }
    loadCounts()
  }, [])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const allStats = [
    { label: 'Mentors',       value: counts.mentors,   color: '#6366f1', bg: '#eef2ff', icon: UserCheck,  perm: 'mod_mentors',   limitKey: 'mentors' },
    { label: 'Mentees',       value: counts.mentees,   color: '#10b981', bg: '#ecfdf5', icon: Users,      perm: 'mod_mentees',   limitKey: 'mentees' },
    { label: 'Staff',         value: counts.staff,     color: '#f59e0b', bg: '#fffbeb', icon: Users2,     perm: 'mod_staff',     limitKey: 'staff' },
    { label: 'Active Offerings', value: counts.offerings, color: '#8b5cf6', bg: '#f5f3ff', icon: Package, perm: 'mod_offerings', limitKey: 'offerings' },
  ]
  const stats = allStats.filter(s => can(s.perm))

  const allSections = [
    {
      title: 'People',
      items: [
        { icon: UserCheck,      label: 'Mentors',         desc: 'Manage your mentoring team',    color: '#6366f1', editPath: '/admin/mentors',          addPath: '/admin/mentors?action=add',          perm: 'mod_mentors' },
        { icon: HeartHandshake, label: 'Assistant Mentors', desc: 'Mentors in training',           color: '#10b981', editPath: '/admin/assistant-mentors',  addPath: '/admin/assistant-mentors?action=add',  perm: 'mod_assistant_mentors' },
        { icon: Users,          label: 'Mentees',         desc: 'Track program participants',     color: '#3b82f6', editPath: '/admin/mentees',          addPath: '/admin/mentees?action=add',          perm: 'mod_mentees' },
        { icon: Users2,         label: 'Staff',           desc: 'Ministry team members',          color: '#f59e0b', editPath: '/admin/staff',            addPath: '/admin/staff?action=add',            perm: 'mod_staff' },
        { icon: UserPlus,       label: 'Signup Requests', desc: 'Review pending access requests', color: '#ec4899', editPath: '/admin/signup-requests',  addPath: null,                                 perm: 'mod_mentees' },
      ]
    },
    {
      title: 'Program',
      items: [
        { icon: Package,   label: 'Offerings', desc: 'Plans, pricing & durations',    color: '#8b5cf6', editPath: '/admin/offerings', addPath: '/admin/offerings?action=add', perm: 'mod_offerings' },
        { icon: BarChart3, label: 'Reports',   desc: 'Analytics & program insights',  color: '#0ea5e9', editPath: '/admin/reports',   addPath: null,                          perm: 'mod_reports' },
      ]
    },
    {
      title: 'Finance',
      items: [
        { icon: CreditCard,  label: 'Billing',   desc: 'Your subscription & payment',        color: '#6366f1', editPath: '/admin/billing',         addPath: null, perm: 'mod_billing' },
        { icon: Receipt,     label: 'Invoicing', desc: 'Mentee billing & invoices',           color: '#10b981', editPath: '/admin/invoicing',       addPath: null, perm: 'mod_invoicing' },
        { icon: DollarSign,  label: 'Payroll',   desc: 'Mentor compensation & payouts',       color: '#f59e0b', editPath: '/admin/mentor-payroll',  addPath: null, perm: 'mod_payroll' },
      ]
    }
  ]
  const sections = allSections
    .map(sec => ({ ...sec, items: sec.items.filter(item => can(item.perm)) }))
    .filter(sec => sec.items.length > 0)

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.greeting}>{greeting}</h1>
          <p style={s.date}>{dateStr}</p>
        </div>
        <div style={s.headerBadge}>
          <TrendingUp size={14} color="#6366f1" />
          <span>Program active</span>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        {stats.map(stat => {
          const Icon = stat.icon
          const limit = checkLimit(stat.limitKey)
          return (
            <div key={stat.label} style={s.statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.5rem' }}>
                <div style={{ ...s.statIcon, backgroundColor: stat.bg }}>
                  <Icon size={18} color={stat.color} strokeWidth={2} />
                </div>
                <div>
                  <div style={s.statValue}>{stat.value}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              </div>
              <UsageBar current={limit.current} max={limit.max} color={stat.color} />
            </div>
          )
        })}
      </div>

      {/* Action sections */}
      {sections.map(section => (
        <div key={section.title} style={s.section}>
          <h2 style={s.sectionTitle}>{section.title}</h2>
          <div style={s.cardGrid}>
            {section.items.map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} style={s.card}>
                  <div style={s.cardLeft}>
                    <div style={{ ...s.cardIcon, background: item.color + '18' }}>
                      <Icon size={20} color={item.color} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={s.cardLabel}>{item.label}</div>
                      <div style={s.cardDesc}>{item.desc}</div>
                    </div>
                  </div>
                  <div style={s.cardBtns}>
                    {item.addPath && (
                      <button style={{ ...s.btn, ...s.btnOutline, borderColor: item.color + '50', color: item.color }}
                        onClick={() => navigate(item.addPath)}>
                        <Plus size={13} strokeWidth={2.5} /> Add
                      </button>
                    )}
                    <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => navigate(item.editPath)}>
                      Manage <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' },
  greeting: { fontSize: '1.65rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  date: { color: '#9ca3af', fontSize: '0.875rem' },
  headerBadge: { display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.78rem', color: '#4f46e5', fontWeight: 600 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' },
  statCard: { backgroundColor: '#fff', borderRadius: 6, padding: '1.1rem 1.25rem', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '1rem' },
  statIcon: { width: 42, height: 42, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue: { fontSize: '1.6rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 },
  statLabel: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500, marginTop: '0.2rem' },
  section: { marginBottom: '2rem' },
  sectionTitle: { fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' },
  cardGrid: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  card: { backgroundColor: '#fff', borderRadius: 6, padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', border: '1px solid #f3f4f6' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: '0.85rem' },
  cardIcon: { width: 40, height: 40, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardLabel: { fontWeight: 600, color: '#111827', fontSize: '0.9rem', marginBottom: '0.1rem' },
  cardDesc: { color: '#9ca3af', fontSize: '0.8rem' },
  cardBtns: { display: 'flex', gap: '0.5rem', flexShrink: 0 },
  btn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.85rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, border: '1.5px solid', transition: 'all 0.12s', whiteSpace: 'nowrap' },
  btnOutline: { backgroundColor: 'transparent' },
  btnGhost: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280' },
}
