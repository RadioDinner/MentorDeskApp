export interface ModuleDef {
  key: string
  label: string
  icon: string
  group: string
  path: string
  color: string // tailwind bg color for the round icon
}

export const ALL_MODULES: ModuleDef[] = [
  { key: 'home',              label: 'Home',              icon: '▦', group: 'Main',    path: '/dashboard',          color: 'bg-slate-500' },
  { key: 'staff',             label: 'Staff',             icon: '◈', group: 'People',  path: '/staff',              color: 'bg-amber-500' },
  { key: 'mentors',           label: 'Mentors',           icon: '◉', group: 'People',  path: '/mentors',            color: 'bg-blue-500' },
  { key: 'assistant-mentors', label: 'Asst. Mentors',     icon: '◎', group: 'People',  path: '/assistant-mentors',  color: 'bg-teal-500' },
  { key: 'mentees',           label: 'Mentees',           icon: '◎', group: 'People',  path: '/mentees',            color: 'bg-green-500' },
  { key: 'pairings',          label: 'Pairings',          icon: '⇄', group: 'Business', path: '/pairings',          color: 'bg-violet-500' },
  { key: 'offerings',         label: 'Offerings',         icon: '◇', group: 'Business', path: '/offerings',         color: 'bg-indigo-500' },
  { key: 'reports',           label: 'Reports',           icon: '▤', group: 'Business', path: '/reports',           color: 'bg-cyan-500' },
  { key: 'billing',           label: 'Billing',           icon: '▧', group: 'Finance',  path: '/billing',           color: 'bg-emerald-500' },
  { key: 'invoicing',         label: 'Invoicing',         icon: '▨', group: 'Finance',  path: '/invoicing',         color: 'bg-sky-500' },
  { key: 'payroll',           label: 'Payroll',           icon: '▩', group: 'Finance',  path: '/payroll',           color: 'bg-lime-500' },
  { key: 'audit-log',         label: 'Audit Log',         icon: '▤', group: 'System',   path: '/audit-log',         color: 'bg-purple-500' },
  { key: 'settings',          label: 'Settings',          icon: '⚙', group: 'System',   path: '/settings',          color: 'bg-gray-500' },
]

// Modules that don't need explicit access (everyone gets these)
export const ALWAYS_VISIBLE = ['home']

// Group modules by their group label
export function modulesByGroup(): { group: string; modules: ModuleDef[] }[] {
  const groups: { group: string; modules: ModuleDef[] }[] = []
  const seen = new Set<string>()
  for (const mod of ALL_MODULES) {
    if (!seen.has(mod.group)) {
      seen.add(mod.group)
      groups.push({ group: mod.group, modules: [] })
    }
    groups.find(g => g.group === mod.group)!.modules.push(mod)
  }
  return groups
}
