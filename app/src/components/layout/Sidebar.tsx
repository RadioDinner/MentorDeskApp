import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: string
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  to: '/dashboard',  icon: '▦', roles: ['admin', 'mentor', 'staff'] },
  { label: 'Mentors',    to: '/mentors',    icon: '◉', roles: ['admin'] },
  { label: 'Mentees',    to: '/mentees',    icon: '◎', roles: ['admin', 'mentor'] },
  { label: 'Staff',      to: '/staff',      icon: '◈', roles: ['admin'] },
  { label: 'Offerings',  to: '/offerings',  icon: '◇', roles: ['admin'] },
  { label: 'Settings',   to: '/settings',   icon: '⚙', roles: ['admin'] },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()

  const visible = NAV_ITEMS.filter(item =>
    profile ? item.roles.includes(profile.role) : false
  )

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-white border-r border-gray-200 min-h-screen">

      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-200">
        <span className="text-base font-semibold text-gray-900 tracking-tight">MentorDesk</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visible.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + sign out */}
      {profile && (
        <div className="px-4 py-4 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-900 truncate">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
          <button
            onClick={signOut}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}

    </aside>
  )
}
