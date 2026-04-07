import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import type { RoleGroup } from '../../types'

interface NavItem {
  label: string
  to: string
  icon: string
  roles: string[]
  group: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { label: 'Home', to: '/dashboard', icon: '▦', roles: ['admin', 'mentor', 'assistant_mentor', 'staff'], group: 'Main' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Staff',              to: '/staff',              icon: '◈', roles: ['admin', 'staff'], group: 'People' },
      { label: 'Mentors',            to: '/mentors',            icon: '◉', roles: ['admin', 'staff'], group: 'People' },
      { label: 'Assistant Mentors',  to: '/assistant-mentors',  icon: '◎', roles: ['admin', 'staff'], group: 'People' },
      { label: 'Mentees',            to: '/mentees',            icon: '◎', roles: ['admin', 'mentor', 'assistant_mentor', 'staff'], group: 'People' },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Pairings',   to: '/pairings',   icon: '⇄', roles: ['admin', 'staff'], group: 'Business' },
      { label: 'Offerings',  to: '/offerings',   icon: '◇', roles: ['admin', 'staff'], group: 'Business' },
      { label: 'Reports',    to: '/reports',     icon: '▤', roles: ['admin', 'staff'], group: 'Business' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Billing',    to: '/billing',    icon: '▧', roles: ['admin', 'staff'], group: 'Finance' },
      { label: 'Invoicing',  to: '/invoicing',  icon: '▨', roles: ['admin', 'staff'], group: 'Finance' },
      { label: 'Payroll',    to: '/payroll',     icon: '▩', roles: ['admin', 'staff'], group: 'Finance' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Log', to: '/audit-log', icon: '▤', roles: ['admin', 'staff'], group: 'System' },
      { label: 'Settings',  to: '/settings',   icon: '⚙', roles: ['admin', 'staff'], group: 'System' },
    ],
  },
]

export default function Sidebar() {
  const { profile } = useAuth()
  const [allowedGroups, setAllowedGroups] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return

    // Admins see everything
    if (profile.role === 'admin') {
      setAllowedGroups(new Set(['Main', 'People', 'Business', 'Finance', 'System']))
      setLoaded(true)
      return
    }

    // Mentors/assistant_mentors see Main + limited items based on role
    if (profile.role === 'mentor' || profile.role === 'assistant_mentor') {
      setAllowedGroups(new Set(['Main', 'People']))
      setLoaded(true)
      return
    }

    // Staff: check access_groups against org role_groups
    async function loadAccess() {
      const userGroups = profile!.access_groups ?? []
      if (userGroups.length === 0) {
        setAllowedGroups(new Set(['Main']))
        setLoaded(true)
        return
      }

      const { data } = await supabase
        .from('organizations')
        .select('role_groups')
        .eq('id', profile!.organization_id)
        .single()

      if (data?.role_groups) {
        const orgGroups = data.role_groups as RoleGroup[]
        const moduleGroups = new Set<string>()
        for (const rg of orgGroups) {
          if (userGroups.includes(rg.id)) {
            for (const mg of rg.module_groups) {
              moduleGroups.add(mg)
            }
          }
        }
        if (moduleGroups.size === 0) moduleGroups.add('Main')
        setAllowedGroups(moduleGroups)
      } else {
        setAllowedGroups(new Set(['Main']))
      }
      setLoaded(true)
    }

    loadAccess()
  }, [profile])

  if (!loaded) return null

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!profile) return false
        // Must have the role
        if (!item.roles.includes(profile.role)) return false
        // Must have access to the module group
        if (!allowedGroups.has(item.group)) return false
        return true
      }),
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
                    `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand text-white'
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
