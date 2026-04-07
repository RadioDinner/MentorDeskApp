import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { superAdminLogout } from '../superAdminClient'
import {
  LayoutDashboard, Building2, LogOut, Crown, Settings, BarChart3, Bug, UserPlus, Receipt
} from 'lucide-react'
import BugReportButton from './BugReportButton'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',     path: '/',              exact: true },
  { icon: UserPlus,        label: 'Signups',        path: '/signups' },
  { icon: Building2,       label: 'Organizations', path: '/organizations' },
  { icon: Receipt,         label: 'Invoicing',     path: '/invoicing' },
  { icon: BarChart3,       label: 'Usage',         path: '/usage' },
  { icon: Bug,             label: 'Error Logs',    path: '/error-logs' },
  { icon: Settings,        label: 'Plan Settings', path: '/settings' },
]

export default function SuperAdminLayout({ children, onLogout }) {
  const location = useLocation()

  function isActive(item) {
    if (item.exact) return location.pathname === item.path
    return location.pathname.startsWith(item.path)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    superAdminLogout()
    if (onLogout) onLogout()
  }

  return (
    <div style={l.wrapper}>
      <aside style={l.sidebar}>

        {/* Logo */}
        <div style={l.logo}>
          <div style={l.logoMark}>
            <Crown size={15} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={l.logoName}>MentorDesk</div>
            <div style={l.logoRole}>Super Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={l.nav}>
          <div style={l.navLabel}>Platform</div>
          {navItems.map(item => (
            <NavItem key={item.path} item={item} active={isActive(item)} />
          ))}
        </nav>

        {/* Footer */}
        <div style={l.sidebarFooter}>
          <BugReportButton inline />
          <button style={l.signOut} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main style={l.main}>{children}</main>
    </div>
  )
}

function NavItem({ item, active }) {
  const Icon = item.icon
  return (
    <Link to={item.path} style={{ textDecoration: 'none' }}>
      <div style={{ ...l.navItem, ...(active ? l.navActive : {}) }}>
        {active && <div style={l.activeBar} />}
        <Icon size={16} strokeWidth={active ? 2.2 : 1.8} style={{ opacity: active ? 1 : 0.5, flexShrink: 0 }} />
        <span style={{ ...l.navText, ...(active ? l.navTextActive : {}) }}>{item.label}</span>
      </div>
    </Link>
  )
}

const l = {
  wrapper: { display: 'flex', minHeight: '100vh' },
  sidebar: {
    width: 'var(--sidebar-width)',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #1a0a0a 0%, #2d1515 100%)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 20,
    borderRight: '1px solid rgba(255,255,255,0.04)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '1.4rem 1.1rem 1.2rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 7,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 14px rgba(220,38,38,0.45)',
  },
  logoName: { fontSize: '0.9rem', fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.01em' },
  logoRole: { fontSize: '0.65rem', color: 'rgba(252,165,165,0.7)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 },
  nav: { flex: 1, padding: '1rem 0.75rem', overflowY: 'auto' },
  navLabel: { fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(107,114,128,0.8)', padding: '0 0.5rem', marginBottom: '0.35rem' },
  navItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.65rem', borderRadius: 6, color: '#6b7280', marginBottom: 2, position: 'relative', transition: 'background 0.12s, color 0.12s' },
  navActive: { background: 'rgba(220,38,38,0.12)', color: '#fca5a5' },
  activeBar: { position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(135deg, #dc2626, #ef4444)' },
  navText: { fontSize: '0.84rem', fontWeight: 500 },
  navTextActive: { fontWeight: 600, color: '#fecaca' },
  sidebarFooter: { borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column' },
  signOut: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 1.25rem', background: 'none', border: 'none', color: 'rgba(107,114,128,0.7)', fontSize: '0.82rem', fontWeight: 500, width: '100%', textAlign: 'left', transition: 'color 0.12s', cursor: 'pointer' },
  main: { flex: 1, marginLeft: 'var(--sidebar-width)', padding: '2rem 2.25rem', minHeight: '100vh', maxWidth: '100%' },
}
