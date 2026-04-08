import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../../lib/modules'

export default function Sidebar() {
  const { profile, isMenteeMode } = useAuth()

  if (!profile) return null

  const isAdmin = !isMenteeMode && profile.role === 'admin'
  const isMentor = !isMenteeMode && (profile.role === 'mentor' || profile.role === 'assistant_mentor')
  const allowedKeys = new Set(profile.allowed_modules ?? [])

  // Mentee mode gets its own dedicated sidebar
  if (isMenteeMode) {
    const menteeModules = [
      { key: 'home',             label: 'Home',            letter: 'H', path: '/dashboard',            gradient: 'from-slate-500 to-slate-700' },
      { key: 'my-engagements',   label: 'My Engagements',  letter: 'E', path: '/my-engagements',       gradient: 'from-rose-400 to-rose-600' },
      { key: 'my-courses',       label: 'My Courses',      letter: 'C', path: '/my-courses',           gradient: 'from-indigo-400 to-indigo-600' },
      { key: 'my-billing',       label: 'Billing',         letter: 'B', path: '/my-billing',           gradient: 'from-emerald-400 to-emerald-600' },
    ]

    return (
      <aside className="w-56 shrink-0 flex flex-col bg-slate-900 min-h-screen">
        <div className="px-5 py-5 border-b border-slate-700/50">
          <span className="text-base font-semibold text-white tracking-tight">MentorDesk</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {menteeModules.map(mod => (
            <NavLink
              key={mod.path}
              to={mod.path}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${mod.gradient} flex items-center justify-center text-[9px] font-bold text-white shadow-sm border border-white/20 shrink-0`}>
                {mod.letter}
              </span>
              {mod.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700/50">
          <p className="text-xs font-medium text-slate-200 truncate">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-xs text-slate-400">Mentee</p>
        </div>
      </aside>
    )
  }

  // Build visible modules for staff/mentor/admin
  const visibleKeys = new Set<string>(ALWAYS_VISIBLE)

  if (isAdmin) {
    for (const mod of ALL_MODULES) visibleKeys.add(mod.key)
  } else if (isMentor) {
    visibleKeys.add('mentees')
    for (const key of allowedKeys) visibleKeys.add(key)
  } else {
    for (const key of allowedKeys) visibleKeys.add(key)
  }

  const groups = modulesByGroup()
    .map(g => ({
      ...g,
      modules: g.modules.filter(m => visibleKeys.has(m.key)),
    }))
    .filter(g => g.modules.length > 0)

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-900 min-h-screen">

      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <span className="text-base font-semibold text-white tracking-tight">MentorDesk</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map(group => (
          <div key={group.group}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.modules.map(mod => (
                <NavLink
                  key={mod.path}
                  to={mod.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${mod.gradient} flex items-center justify-center text-[9px] font-bold text-white shadow-sm border border-white/20 shrink-0`}>
                    {mod.letter}
                  </span>
                  {mod.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-slate-700/50">
        <p className="text-xs font-medium text-slate-200 truncate">
          {profile.first_name} {profile.last_name}
        </p>
        <p className="text-xs text-slate-400 capitalize">
          {isMenteeMode ? 'Mentee' : profile.role.replace('_', ' ')}
        </p>
      </div>

    </aside>
  )
}
