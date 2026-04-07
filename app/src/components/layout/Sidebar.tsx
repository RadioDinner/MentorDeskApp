import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: string
  roles: string[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { label: 'Home', to: '/dashboard', icon: '▦', roles: ['admin', 'mentor', 'staff'] },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Staff',              to: '/staff',              icon: '◈', roles: ['admin'] },
      { label: 'Mentors',            to: '/mentors',            icon: '◉', roles: ['admin'] },
      { label: 'Assistant Mentors',  to: '/assistant-mentors',  icon: '◎', roles: ['admin'] },
      { label: 'Mentees',            to: '/mentees',            icon: '◎', roles: ['admin', 'mentor'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Assignments', to: '/assignments', icon: '⇄', roles: ['admin'] },
      { label: 'Offerings',   to: '/offerings',   icon: '◇', roles: ['admin'] },
      { label: 'Reports',     to: '/reports',     icon: '▤', roles: ['admin'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Billing',    to: '/billing',    icon: '▧', roles: ['admin'] },
      { label: 'Invoicing',  to: '/invoicing',  icon: '▨', roles: ['admin'] },
      { label: 'Payroll',    to: '/payroll',     icon: '▩', roles: ['admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Log', to: '/audit-log', icon: '▤', roles: ['admin'] },
      { label: 'Settings',  to: '/settings',   icon: '⚙', roles: ['admin'] },
    ],
  },
]

export default function Sidebar() {
  const { profile } = useAuth()

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        profile ? item.roles.includes(profile.role) : false
      ),
    }))
    .filter(group => group.items.length > 0)

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-900 min-h-screen">

      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <span className="text-base font-semibold text-white tracking-tight">MentorDesk</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {visibleGroups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User info */}
      {profile && (
        <div className="px-4 py-4 border-t border-slate-700/50">
          <p className="text-xs font-medium text-slate-200 truncate">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
        </div>
      )}

    </aside>
  )
}
