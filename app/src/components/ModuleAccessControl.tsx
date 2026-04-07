import { useState, useRef, useEffect } from 'react'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../lib/modules'
import type { ModuleDef } from '../lib/modules'
import type { StaffMember, RoleGroup } from '../types'

interface Props {
  person: StaffMember
  allPeople: StaffMember[]
  permissionGroups: RoleGroup[]
  onUpdate: (modules: string[]) => void
}

const GROUP_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  People:   { bg: 'bg-amber-50',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-600' },
  Business: { bg: 'bg-violet-50', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-600' },
  Finance:  { bg: 'bg-emerald-50',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-600' },
  System:   { bg: 'bg-slate-50',  text: 'text-slate-700',  badge: 'bg-slate-100 text-slate-600' },
}

function getGroupStyle(group: string) {
  return GROUP_COLORS[group] ?? { bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-600' }
}

export default function ModuleAccessControl({ person, allPeople, permissionGroups, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [copyMenuOpen, setCopyMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCopyMenuOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const allowed = new Set(person.allowed_modules ?? [])
  const assignable = ALL_MODULES.filter(m => !ALWAYS_VISIBLE.includes(m.key))
  const groups = modulesByGroup().filter(g => g.group !== 'Main')
  const activeCount = assignable.filter(m => allowed.has(m.key)).length

  function toggle(key: string) {
    const next = allowed.has(key)
      ? [...allowed].filter(k => k !== key)
      : [...allowed, key]
    onUpdate(next)
  }

  function selectAll() {
    onUpdate(assignable.map(m => m.key))
  }

  function clearAll() {
    onUpdate([])
  }

  function applyGroup(group: RoleGroup) {
    // Resolve module_groups (group names) to individual module keys
    const keys = assignable
      .filter(m => group.module_groups.includes(m.group))
      .map(m => m.key)
    onUpdate(keys)
  }

  function copyFrom(source: StaffMember) {
    onUpdate([...(source.allowed_modules ?? [])])
    setCopyMenuOpen(false)
  }

  function toggleGroupModules(groupModules: ModuleDef[]) {
    const groupKeys = groupModules.map(m => m.key)
    const allActive = groupKeys.every(k => allowed.has(k))
    if (allActive) {
      onUpdate([...allowed].filter(k => !groupKeys.includes(k)))
    } else {
      const merged = new Set([...allowed, ...groupKeys])
      onUpdate([...merged])
    }
  }

  // Filter modules by search
  const filteredGroups = search.trim()
    ? groups.map(g => ({
        ...g,
        modules: g.modules.filter(m =>
          m.label.toLowerCase().includes(search.toLowerCase()) ||
          m.group.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.modules.length > 0)
    : groups

  // Copyable people (exclude self and admins)
  const copyablePeople = allPeople.filter(p => p.id !== person.id && p.role !== 'admin')

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
          open
            ? 'border-brand bg-brand-light text-brand shadow-sm'
            : activeCount > 0
              ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm'
              : 'border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-gray-400 hover:text-gray-500'
        }`}
      >
        {/* Mini module dots */}
        <span className="flex items-center gap-0.5">
          {assignable.slice(0, 6).map(mod => (
            <span
              key={mod.key}
              className={`w-2 h-2 rounded-full transition-colors ${
                allowed.has(mod.key) ? mod.color : 'bg-gray-200'
              }`}
            />
          ))}
          {assignable.length > 6 && (
            <span className="text-[9px] text-gray-400 ml-0.5">+{assignable.length - 6}</span>
          )}
        </span>
        <span>{activeCount}/{assignable.length}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">

          {/* Header with search */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-900">Module Access</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={selectAll}
                  className="px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand-light rounded transition-colors">
                  All
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={clearAll}
                  className="px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 rounded transition-colors">
                  None
                </button>
              </div>
            </div>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search modules..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition placeholder-gray-400"
              />
            </div>
          </div>

          {/* Permission group presets */}
          {permissionGroups.length > 0 && !search.trim() && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Quick Apply</p>
              <div className="flex flex-wrap gap-1.5">
                {permissionGroups.map(group => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => applyGroup(group)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand hover:bg-brand-light transition-all shadow-sm"
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Module groups */}
          <div className="max-h-64 overflow-y-auto">
            {filteredGroups.map(g => {
              const style = getGroupStyle(g.group)
              const groupKeys = g.modules.map(m => m.key)
              const allInGroupActive = groupKeys.every(k => allowed.has(k))
              const someInGroupActive = groupKeys.some(k => allowed.has(k))

              return (
                <div key={g.group} className="border-b border-gray-100 last:border-0">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroupModules(g.modules)}
                    className={`w-full flex items-center justify-between px-3 py-2 ${style.bg} hover:opacity-90 transition-opacity`}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>{g.group}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.badge}`}>
                        {groupKeys.filter(k => allowed.has(k)).length}/{groupKeys.length}
                      </span>
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                        allInGroupActive
                          ? 'bg-brand border-brand text-white'
                          : someInGroupActive
                            ? 'bg-brand/30 border-brand/50 text-white'
                            : 'border-gray-300 bg-white'
                      }`}>
                        {(allInGroupActive || someInGroupActive) && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            {allInGroupActive
                              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              : <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                            }
                          </svg>
                        )}
                      </span>
                    </span>
                  </button>

                  {/* Modules in group */}
                  <div className="px-1.5 py-1">
                    {g.modules.map(mod => {
                      const active = allowed.has(mod.key)
                      return (
                        <button
                          key={mod.key}
                          type="button"
                          onClick={() => toggle(mod.key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-all ${
                            active
                              ? 'bg-brand-light/50 hover:bg-brand-light'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] transition-all shadow-sm ${
                            active ? `${mod.color} text-white` : 'bg-gray-100 text-gray-400'
                          }`}>
                            {mod.icon}
                          </span>
                          <span className={`flex-1 text-xs ${active ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            {mod.label}
                          </span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            active ? 'bg-brand border-brand' : 'border-gray-300 bg-white'
                          }`}>
                            {active && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {filteredGroups.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">No modules match "{search}"</p>
              </div>
            )}
          </div>

          {/* Footer: Copy from */}
          {copyablePeople.length > 0 && !search.trim() && (
            <div className="border-t border-gray-100 relative">
              <button
                type="button"
                onClick={() => setCopyMenuOpen(!copyMenuOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy from another person
                </span>
                <svg className={`w-3 h-3 transition-transform ${copyMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {copyMenuOpen && (
                <div className="max-h-40 overflow-y-auto border-t border-gray-100">
                  {copyablePeople.map(p => {
                    const theirCount = (p.allowed_modules ?? []).length
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => copyFrom(p)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-500 shrink-0">
                          {p.first_name[0]}{p.last_name[0]}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-700 truncate block">{p.first_name} {p.last_name}</span>
                          <span className="text-[10px] text-gray-400 capitalize">{p.role.replace('_', ' ')}</span>
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">{theirCount} modules</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
