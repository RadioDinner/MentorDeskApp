export interface ModuleDef {
  key: string
  label: string
  letter: string
  group: string
  path: string
  gradient: string // tailwind gradient classes for the circle background
  color: string    // solid tailwind bg color (fallback / chips)
}

export const ALL_MODULES: ModuleDef[] = [
  { key: 'home',              label: 'Home',              letter: 'H', group: 'Main',      path: '/dashboard',          gradient: 'from-slate-500 to-slate-700',     color: 'bg-slate-500' },
  { key: 'staff',             label: 'Staff',             letter: 'S', group: 'People',    path: '/staff',              gradient: 'from-amber-400 to-amber-600',     color: 'bg-amber-500' },
  { key: 'mentors',           label: 'Mentors',           letter: 'M', group: 'People',    path: '/mentors',            gradient: 'from-blue-400 to-blue-600',       color: 'bg-blue-500' },
  { key: 'assistant-mentors', label: 'Asst. Mentors',     letter: 'A', group: 'People',    path: '/assistant-mentors',  gradient: 'from-teal-400 to-teal-600',       color: 'bg-teal-500' },
  { key: 'mentees',           label: 'Mentees',           letter: 'E', group: 'People',    path: '/mentees',            gradient: 'from-green-400 to-green-600',     color: 'bg-green-500' },
  { key: 'pairings',          label: 'Pairings',          letter: 'P', group: 'Business',  path: '/pairings',           gradient: 'from-violet-400 to-violet-600',   color: 'bg-violet-500' },
  { key: 'reports',           label: 'Reports',           letter: 'R', group: 'Business',  path: '/reports',            gradient: 'from-cyan-400 to-cyan-600',       color: 'bg-cyan-500' },
  { key: 'courses',           label: 'Courses',           letter: 'C', group: 'Offerings', path: '/courses',            gradient: 'from-indigo-400 to-indigo-600',   color: 'bg-indigo-500' },
  { key: 'engagements',       label: 'Engagements',       letter: 'G', group: 'Offerings', path: '/engagements',        gradient: 'from-rose-400 to-rose-600',       color: 'bg-rose-500' },
  { key: 'habits',            label: 'Habits',            letter: 'H', group: 'Offerings', path: '/habits',             gradient: 'from-teal-400 to-teal-600',       color: 'bg-teal-500' },
  { key: 'canvases',          label: 'Canvases',          letter: 'V', group: 'Offerings', path: '/canvases',           gradient: 'from-fuchsia-400 to-fuchsia-600', color: 'bg-fuchsia-500' },
  { key: 'journeys',          label: 'Journeys',           letter: 'J', group: 'Offerings', path: '/journeys',           gradient: 'from-violet-400 to-violet-600',   color: 'bg-violet-500' },
  { key: 'billing',           label: 'Billing',           letter: 'B', group: 'System',    path: '/billing',            gradient: 'from-emerald-400 to-emerald-600', color: 'bg-emerald-500' },
  { key: 'invoicing',         label: 'Invoicing',         letter: 'I', group: 'Finance',   path: '/invoicing',          gradient: 'from-sky-400 to-sky-600',         color: 'bg-sky-500' },
  { key: 'payroll',           label: 'Payroll',           letter: 'Y', group: 'Finance',   path: '/payroll',            gradient: 'from-lime-500 to-lime-700',       color: 'bg-lime-500' },
  { key: 'audit-log',         label: 'Audit Log',         letter: 'L', group: 'System',    path: '/audit-log',          gradient: 'from-purple-400 to-purple-600',   color: 'bg-purple-500' },
  { key: 'settings',          label: 'Settings',          letter: 'X', group: 'System',    path: '/settings',           gradient: 'from-gray-400 to-gray-600',       color: 'bg-gray-500' },
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
