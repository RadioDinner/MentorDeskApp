import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../../lib/modules'

export default function Sidebar() {
  const { profile } = useAuth()

  if (!profile) return null

  const isAdmin = profile.role === 'admin'
  const isMentor = profile.role === 'mentor' || profile.role === 'assistant_mentor'
  const allowedKeys = new Set(profile.allowed_modules ?? [])

  // Build visible modules
  const visibleKeys = new Set<string>(ALWAYS_VISIBLE)

  if (isAdmin) {
    // Admins see everything
    for (const mod of ALL_MODULES) visibleKeys.add(mod.key)
  } else if (isMentor) {
    // Mentors see Home + Mentees by default
    visibleKeys.add('mentees')
    // Plus any explicitly granted
    for (const key of allowedKeys) visibleKeys.add(key)
  } else {
    // Staff see what's explicitly granted
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
                  <span className="text-base leading-none">{mod.icon}</span>
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
        <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
      </div>

    </aside>
  )
}
