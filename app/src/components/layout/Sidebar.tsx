import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../../lib/modules'
import { STAFF_ROLE_LABELS } from '../../types'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
    isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

function NavDot({ gradient }: { gradient: string }) {
  return (
    <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[9px] font-bold text-white shadow-sm border border-white/20 shrink-0`} />
  )
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { profile, isMenteeMode } = useAuth()

  if (!profile) return null

  const isAdmin = !isMenteeMode && profile.role === 'admin'
  const isMentor = !isMenteeMode && (profile.role === 'mentor' || profile.role === 'assistant_mentor')
  const allowedKeys = new Set(profile.allowed_modules ?? [])

  // On mobile: fixed overlay drawer. On desktop (lg+): static in flex flow.
  const asideClass = `fixed inset-y-0 left-0 z-40 w-56 flex flex-col bg-slate-900 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`

  const brandBar = (
    <div className="px-5 py-5 border-b border-slate-700/50 flex items-center justify-between">
      <span className="text-base font-semibold text-white tracking-tight">MentorDesk</span>
      {/* Close button — mobile only */}
      <button
        onClick={onClose}
        className="lg:hidden p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        aria-label="Close navigation"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  const backdrop = open ? (
    <div
      className="fixed inset-0 bg-black/40 z-30 lg:hidden"
      onClick={onClose}
      aria-hidden="true"
    />
  ) : null

  // ── Mentee sidebar ──
  if (isMenteeMode) {
    const menteeModules = [
      { label: 'Home',           letter: 'H', path: '/dashboard',      gradient: 'from-slate-500 to-slate-700' },
      { label: 'My Engagements', letter: 'E', path: '/my-engagements', gradient: 'from-rose-400 to-rose-600' },
      { label: 'My Courses',     letter: 'C', path: '/my-courses',     gradient: 'from-indigo-400 to-indigo-600' },
      { label: 'My Habits',      letter: 'H', path: '/my-habits',      gradient: 'from-teal-400 to-teal-600' },
      { label: 'My Canvases',    letter: 'V', path: '/my-canvases',    gradient: 'from-fuchsia-400 to-fuchsia-600' },
      { label: 'Billing',        letter: 'B', path: '/my-billing',     gradient: 'from-emerald-400 to-emerald-600' },
    ]
    return (
      <>
        {backdrop}
        <aside className={asideClass}>
          {brandBar}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {menteeModules.map(mod => (
              <NavLink key={mod.path} to={mod.path} className={navLinkClass} onClick={onClose}>
                <NavDot gradient={mod.gradient} />
                {mod.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-slate-700/50">
            <p className="text-xs font-medium text-slate-200 truncate">{profile.first_name} {profile.last_name}</p>
            <p className="text-xs text-slate-400">Mentee</p>
          </div>
        </aside>
      </>
    )
  }

  // ── Mentor / Asst. Mentor sidebar ──
  if (isMentor) {
    const mentorModules = [
      { label: 'Home',         letter: 'H', path: '/dashboard',    gradient: 'from-slate-500 to-slate-700' },
      { label: 'My Mentees',   letter: 'M', path: '/mentees',      gradient: 'from-green-400 to-green-600' },
      { label: 'Meetings',     letter: 'T', path: '/meetings',     gradient: 'from-rose-400 to-rose-600' },
      { label: 'Availability', letter: 'A', path: '/availability', gradient: 'from-violet-400 to-violet-600' },
      { label: 'Reports',      letter: 'R', path: '/reports',      gradient: 'from-cyan-400 to-cyan-600' },
    ]
    return (
      <>
        {backdrop}
        <aside className={asideClass}>
          {brandBar}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {mentorModules.map(mod => (
              <NavLink key={mod.path} to={mod.path} className={navLinkClass} onClick={onClose}>
                <NavDot gradient={mod.gradient} />
                {mod.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-slate-700/50">
            <p className="text-xs font-medium text-slate-200 truncate">{profile.first_name} {profile.last_name}</p>
            <p className="text-xs text-slate-400">{STAFF_ROLE_LABELS[profile.role] ?? profile.role}</p>
          </div>
        </aside>
      </>
    )
  }

  // ── Admin / staff sidebar ──
  const visibleKeys = new Set<string>(ALWAYS_VISIBLE)
  if (isAdmin) {
    for (const mod of ALL_MODULES) visibleKeys.add(mod.key)
  } else {
    for (const key of allowedKeys) visibleKeys.add(key)
    // Legacy compat: 'flows' was renamed to 'journeys'
    if (allowedKeys.has('flows')) visibleKeys.add('journeys')
  }

  const groups = modulesByGroup()
    .map(g => ({ ...g, modules: g.modules.filter(m => visibleKeys.has(m.key)) }))
    .filter(g => g.modules.length > 0)

  return (
    <>
      {backdrop}
      <aside className={asideClass}>
        {brandBar}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {groups.map(group => (
            <div key={group.group}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.modules.map(mod => (
                  <NavLink key={mod.path} to={mod.path} className={navLinkClass} onClick={onClose}>
                    <NavDot gradient={mod.gradient} />
                    {mod.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700/50">
          <p className="text-xs font-medium text-slate-200 truncate">{profile.first_name} {profile.last_name}</p>
          <p className="text-xs text-slate-400">
            {isMenteeMode ? 'Mentee' : (STAFF_ROLE_LABELS[profile.role] ?? profile.role)}
          </p>
        </div>
      </aside>
    </>
  )
}
