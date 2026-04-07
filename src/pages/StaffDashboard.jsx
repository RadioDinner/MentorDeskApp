import { supabase } from '../supabaseClient'
import BugReportButton from '../components/BugReportButton'
import { LogOut } from 'lucide-react'

export default function StaffDashboard() {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div style={styles.wrapper}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <span style={styles.sidebarLogoText}>Staff</span>
        </div>
        <nav style={styles.sidebarNav}>
          <div style={{ ...styles.sidebarNavBtn, ...styles.sidebarNavBtnActive }}>
            <div style={styles.activeBar} />
            <span>Dashboard</span>
          </div>
        </nav>
        <div style={styles.sidebarFooter}>
          <BugReportButton inline />
          <button style={styles.sidebarSignOut} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main style={styles.main}>
        <h1 style={styles.title}>Staff Dashboard</h1>
        <div style={styles.grid}>
          <DashCard title="Mentees" description="View all mentees" />
          <DashCard title="Schedule" description="View and manage schedules" />
          <DashCard title="Files" description="Manage shared files" />
        </div>
      </main>
    </div>
  )
}

function DashCard({ title, description }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.cardDesc}>{description}</p>
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' },
  sidebar: {
    width: 'var(--sidebar-width, 240px)',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 20,
    borderRight: '1px solid rgba(255,255,255,0.04)',
  },
  sidebarLogo: {
    padding: '1.4rem 1.1rem 1.2rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sidebarLogoText: { fontSize: '1rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.02em' },
  sidebarNav: {
    flex: 1,
    padding: '0.75rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    overflowY: 'auto',
  },
  sidebarNavBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.6rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(156,163,175,0.75)',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    position: 'relative',
    transition: 'color 0.12s',
  },
  sidebarNavBtnActive: {
    color: '#fff',
    fontWeight: 600,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '15%',
    bottom: '15%',
    width: 3,
    borderRadius: '0 3px 3px 0',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  sidebarSignOut: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(156,163,175,0.6)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.12s',
  },
  main: { marginLeft: 'var(--sidebar-width, 240px)', flex: 1, padding: '2rem', maxWidth: 1100 },
  title: { margin: '0 0 2rem', fontSize: '1.75rem', color: '#1a202c' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem' },
  card: { backgroundColor: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', cursor: 'pointer' },
  cardTitle: { margin: '0 0 0.5rem', fontSize: '1.15rem', color: '#2d3748' },
  cardDesc: { margin: 0, color: '#718096', fontSize: '0.9rem' },
}
