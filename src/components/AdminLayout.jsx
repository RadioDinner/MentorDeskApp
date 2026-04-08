import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import {
  LayoutDashboard, UserCheck, Users, Users2,
  BarChart3, Settings, LogOut, Zap, Package, Shield, CreditCard, Receipt, HeartHandshake,
  HelpCircle, ClipboardList, DollarSign, UserCog
} from 'lucide-react'
import HelpPanel from './HelpPanel'
import BugReportButton from './BugReportButton'
import RoleSwitcher from './RoleSwitcher'
import OrgSwitcher from './OrgSwitcher'

const allMainNav = [
  { icon: LayoutDashboard,  label: 'Dashboard',       path: '/admin',                exact: true, perm: 'mod_dashboard' },
]

const allPeopleNav = [
  { icon: UserCheck,        label: 'Mentors',          path: '/admin/mentors',        perm: 'mod_mentors' },
  { icon: HeartHandshake,   label: 'Assistant Mentors', path: '/admin/assistant-mentors', perm: 'mod_assistant_mentors' },
  { icon: Users2,           label: 'Staff',            path: '/admin/staff',          perm: 'mod_staff' },
  { icon: Users,            label: 'Mentees',          path: '/admin/mentees',        perm: 'mod_mentees' },
]

const allProgramNav = [
  { icon: Package,          label: 'Offerings',        path: '/admin/offerings',      perm: 'mod_offerings' },
  { icon: BarChart3,        label: 'Reports',          path: '/admin/reports',        perm: 'mod_reports', feature: 'reports' },
]

const allFinanceNav = [
  { icon: Receipt,     label: 'Invoicing', path: '/admin/invoicing',       perm: 'mod_invoicing',  feature: 'invoicing' },
  { icon: DollarSign,  label: 'Payroll',   path: '/admin/mentor-payroll',  perm: 'mod_payroll',    feature: 'payroll' },
]

const allSystemNav = [
  { icon: CreditCard,     label: 'Billing',     path: '/admin/billing',    perm: 'mod_billing',    feature: 'billing' },
  { icon: ClipboardList,  label: 'Audit Log',   path: '/admin/audit-log',  perm: 'mod_audit_log' },
  { icon: Settings,       label: 'Settings',    path: '/admin/settings',   perm: 'mod_settings' },
]

export default function AdminLayout({ children }) {
  const { activeRole: role, staffPerms, organizationId, hasFeature, impersonatedOrgId, setImpersonatedOrgId } = useRole()
  const location = useLocation()
  const [helpOpen, setHelpOpen] = useState(false)
  const [orgName, setOrgName] = useState('Admin')
  const [orgLogo, setOrgLogo] = useState('')

  useEffect(() => {
    if (!organizationId) return
    supabase.from('settings').select('key, value').eq('organization_id', organizationId).in('key', ['company_name', 'company_logo_horizontal', 'company_logo'])
      .then(({ data }) => {
        if (!data) return
        const get = k => data.find(s => s.key === k)?.value || ''
        if (get('company_name')) setOrgName(get('company_name'))
        setOrgLogo(get('company_logo_horizontal') || get('company_logo'))
      })
  }, [organizationId])

  const isAdmin = role === 'admin'
  const canAccess = (item) => {
    // Check feature flag first
    if (item.feature && !hasFeature(item.feature)) return false
    // Then check role/permission
    return isAdmin || (staffPerms && staffPerms[item.perm])
  }
  const mainNav = allMainNav.filter(canAccess)
  const peopleNav = allPeopleNav.filter(canAccess)
  const programNav = allProgramNav.filter(canAccess)
  const financeNav = allFinanceNav.filter(canAccess)
  const systemNav = allSystemNav.filter(canAccess)

  function isActive(item) {
    if (item.exact) return location.pathname === item.path
    return location.pathname.startsWith(item.path)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div style={l.wrapper}>
      <aside style={l.sidebar}>

        {/* Logo */}
        <div style={l.logo}>
          {orgLogo ? (
            <img src={orgLogo} alt={orgName} style={l.logoImg} />
          ) : (
            <>
              <div style={l.logoMark}>
                <Zap size={15} color="#fff" strokeWidth={2.5} />
              </div>
              <div>
                <div style={l.logoName}>{orgName}</div>
                <div style={l.logoRole}>{isAdmin ? 'Admin Portal' : 'Staff Portal'}</div>
              </div>
            </>
          )}
        </div>

        {/* Main nav */}
        <nav style={l.nav}>
          {mainNav.length > 0 && (
            <>
              <div style={l.navLabel}>Main</div>
              {mainNav.map(item => <NavItem key={item.path} item={item} active={isActive(item)} />)}
            </>
          )}

          {peopleNav.length > 0 && (
            <>
              <div style={{ ...l.navLabel, marginTop: '1.25rem' }}>People</div>
              {peopleNav.map(item => <NavItem key={item.path} item={item} active={isActive(item)} />)}
            </>
          )}

          {programNav.length > 0 && (
            <>
              <div style={{ ...l.navLabel, marginTop: '1.25rem' }}>Program</div>
              {programNav.map(item => <NavItem key={item.path} item={item} active={isActive(item)} />)}
            </>
          )}

          {financeNav.length > 0 && (
            <>
              <div style={{ ...l.navLabel, marginTop: '1.25rem' }}>Finance</div>
              {financeNav.map(item => <NavItem key={item.path} item={item} active={isActive(item)} />)}
            </>
          )}

          {systemNav.length > 0 && (
            <>
              <div style={{ ...l.navLabel, marginTop: '1.25rem' }}>System</div>
              {systemNav.map(item => <NavItem key={item.path} item={item} active={isActive(item)} />)}
            </>
          )}
        </nav>

        {/* Role switcher + Help + Sign out */}
        <div style={l.sidebarFooter}>
          <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <OrgSwitcher />
            <RoleSwitcher />
          </div>
          <Link to="/admin/profile" style={{ textDecoration: 'none' }}>
            <div style={{ ...l.helpBtn, color: location.pathname === '/admin/profile' ? '#a5b4fc' : undefined }}>
              <UserCog size={14} strokeWidth={2} />
              <span>Edit Profile</span>
            </div>
          </Link>
          <button style={l.helpBtn} onClick={() => setHelpOpen(true)}>
            <HelpCircle size={14} strokeWidth={2} />
            <span>Help & Docs</span>
          </button>
          <BugReportButton inline />
          <button style={l.signOut} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main style={l.main}>
        {children}
      </main>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
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
  wrapper: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: 'var(--sidebar-width)',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0d1117 0%, #111827 100%)',
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
  logoImg: {
    maxHeight: 36,
    maxWidth: '80%',
    objectFit: 'contain',
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 7,
    background: 'var(--primary-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
  },
  logoName: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#f9fafb',
    letterSpacing: '-0.01em',
  },
  logoRole: {
    fontSize: '0.65rem',
    color: 'rgba(156,163,175,0.7)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop: 1,
  },
  nav: {
    flex: 1,
    padding: '1rem 0.75rem',
    overflowY: 'auto',
  },
  navLabel: {
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'rgba(107,114,128,0.8)',
    padding: '0 0.5rem',
    marginBottom: '0.35rem',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.55rem 0.65rem',
    borderRadius: 6,
    color: '#6b7280',
    marginBottom: 2,
    position: 'relative',
    transition: 'background 0.12s, color 0.12s',
  },
  navActive: {
    background: 'var(--nav-active-bg, rgba(99,102,241,0.12))',
    color: 'var(--primary-light, #a5b4fc)',
  },
  activeBar: {
    position: 'absolute',
    left: -6,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: 16,
    borderRadius: 2,
    background: 'var(--primary-gradient)',
  },
  navText: {
    fontSize: '0.84rem',
    fontWeight: 500,
  },
  navTextActive: {
    fontWeight: 600,
    color: '#c7d2fe',
  },
  sidebarFooter: {
    borderTop: '1px solid rgba(255,255,255,0.04)',
    display: 'flex',
    flexDirection: 'column',
  },
  helpBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: 'rgba(156,163,175,0.8)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.12s',
  },
  signOut: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.9rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(107,114,128,0.7)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    transition: 'color 0.12s',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    marginLeft: 'var(--sidebar-width)',
    padding: '2rem 2.25rem',
    minHeight: '100vh',
    maxWidth: '100%',
  },
  impersonationBanner: {
    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
    color: '#92400e',
    padding: '0.6rem 1.25rem',
    borderRadius: 8,
    fontSize: '0.85rem',
    fontWeight: 500,
    marginBottom: '1rem',
    border: '1px solid #fbbf24',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopImpersonateBtn: {
    padding: '0.3rem 0.75rem',
    background: '#92400e',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
