import { useState } from 'react'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../lib/modules'
import type { StaffMember, RoleGroup } from '../types'

interface Props {
  person: StaffMember
  allPeople: StaffMember[]
  permissionGroups: RoleGroup[]
  onUpdate: (modules: string[]) => void
  expanded?: boolean
  onToggle?: () => void
  renderPanel?: boolean
}

const GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  People:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  Business:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  Offerings: { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Finance:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  System:    { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
}

function getGroupStyle(group: string) {
  return GROUP_COLORS[group] ?? { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
}

export default function ModuleAccessControl({ person, allPeople, permissionGroups, onUpdate, expanded, onToggle, renderPanel }: Props) {
  const [copyOpen, setCopyOpen] = useState(false)

  // Normalize legacy key: 'flows' was renamed to 'journeys'
  const rawModules = (person.allowed_modules ?? []).map(k => k === 'flows' ? 'journeys' : k)
  const allowed = new Set(rawModules)
  const assignable = ALL_MODULES.filter(m => !ALWAYS_VISIBLE.includes(m.key))
  const groups = modulesByGroup().filter(g => g.group !== 'Main')
  const activeCount = assignable.filter(m => allowed.has(m.key)).length

  function toggle(key: string) {
    const next = allowed.has(key)
      ? [...allowed].filter(k => k !== key)
      : [...allowed, key]
    onUpdate(next)
  }

  function toggleGroup(groupName: string) {
    const groupKeys = assignable.filter(m => m.group === groupName).map(m => m.key)
    const allActive = groupKeys.every(k => allowed.has(k))
    if (allActive) {
      onUpdate([...allowed].filter(k => !groupKeys.includes(k)))
    } else {
      onUpdate([...new Set([...allowed, ...groupKeys])])
    }
  }

  function selectAll() { onUpdate(assignable.map(m => m.key)) }
  function clearAll() { onUpdate([]) }

  function applyGroup(group: RoleGroup) {
    const keys = assignable.filter(m => group.module_groups.includes(m.group)).map(m => m.key)
    onUpdate(keys)
  }

  function copyFrom(source: StaffMember) {
    onUpdate([...(source.allowed_modules ?? [])])
    setCopyOpen(false)
  }

  const copyablePeople = allPeople.filter(p => p.id !== person.id && p.role !== 'admin')

  // --- Trigger button only (rendered in the flex row) ---
  if (!renderPanel) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
          expanded
            ? 'border-brand bg-brand-light text-brand shadow-sm'
            : activeCount > 0
              ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm'
              : 'border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-gray-400 hover:text-gray-500'
        }`}
      >
        <span className="flex items-center -space-x-1">
          {assignable.map(mod => (
            <span
              key={mod.key}
              className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shadow-sm transition-all ${
                allowed.has(mod.key)
                  ? `bg-gradient-to-br ${mod.gradient} text-white`
                  : 'bg-gray-200 text-gray-400'
              }`}
              title={mod.label}
            >
              {mod.letter}
            </span>
          ))}
        </span>
        <span>{activeCount}/{assignable.length}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    )
  }

  // --- Expanded panel (rendered below the row, full card width) ---
  return (
    <div className="w-full mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-gray-900">Module Access</h3>
          <span className="text-[10px] text-gray-400 font-medium">{activeCount} of {assignable.length} enabled</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={selectAll}
            className="px-2 py-1 text-[10px] font-medium text-brand hover:bg-brand-light rounded transition-colors">
            All
          </button>
          <button type="button" onClick={clearAll}
            className="px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100 rounded transition-colors">
            None
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="ml-1 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Permission group presets */}
      {permissionGroups.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Quick Apply</p>
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

      {/* Module grid */}
      <div className="px-4 py-3 space-y-3">
        {groups.map(g => {
          const style = getGroupStyle(g.group)
          const groupKeys = g.modules.map(m => m.key)
          const activeInGroup = groupKeys.filter(k => allowed.has(k)).length
          const allActive = activeInGroup === groupKeys.length

          return (
            <div key={g.group}>
              {/* Group header row */}
              <div className="flex items-center justify-between mb-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.group)}
                  className="flex items-center gap-2"
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>{g.group}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${style.bg} ${style.text}`}>
                    {activeInGroup}/{groupKeys.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.group)}
                  className={`text-[10px] font-medium transition-colors ${
                    allActive ? 'text-gray-400 hover:text-gray-600' : 'text-brand hover:text-brand-hover'
                  }`}
                >
                  {allActive ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Module chips */}
              <div className="flex flex-wrap gap-1.5">
                {g.modules.map(mod => {
                  const active = allowed.has(mod.key)
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggle(mod.key)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        active
                          ? `${style.bg} ${style.border} ${style.text}`
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shadow-sm ${
                        active
                          ? `bg-gradient-to-br ${mod.gradient} text-white`
                          : 'bg-gray-200 text-gray-400'
                      }`}>
                        {mod.letter}
                      </span>
                      {mod.label}
                      {active && (
                        <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Copy from */}
      {copyablePeople.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setCopyOpen(!copyOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy from another person
            </span>
            <svg className={`w-3 h-3 transition-transform ${copyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {copyOpen && (
            <div className="border-t border-gray-100 max-h-40 overflow-y-auto">
              {copyablePeople.map(p => {
                const theirCount = (p.allowed_modules ?? []).length
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => copyFrom(p)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
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
  )
}
