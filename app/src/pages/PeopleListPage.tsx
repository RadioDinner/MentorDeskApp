import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../lib/modules'
import type { StaffMember, StaffRole } from '../types'

interface PeopleListPageProps {
  title: string
  roles: StaffRole[]
  createLabel: string
  createRoute: string
  showAccessGroups?: boolean
}

function ModuleAccessControl({ person, onUpdate }: { person: StaffMember; onUpdate: (modules: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const allowed = person.allowed_modules ?? []
  const assignable = ALL_MODULES.filter(m => !ALWAYS_VISIBLE.includes(m.key))
  const groups = modulesByGroup().filter(g => g.group !== 'Main')

  function toggle(key: string) {
    const next = allowed.includes(key) ? allowed.filter(k => k !== key) : [...allowed, key]
    onUpdate(next)
  }

  return (
    <div className="relative" ref={ref}>
      {/* Icon row */}
      <div className="flex items-center gap-0.5">
        {assignable.map(mod => {
          const active = allowed.includes(mod.key)
          return (
            <button key={mod.key} type="button"
              onClick={() => setOpen(!open)}
              title={mod.label}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] transition-all ${
                active ? `${mod.color} text-white` : 'bg-gray-200 text-gray-400'
              }`}>
              {mod.icon}
            </button>
          )
        })}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-7 z-50 w-56 bg-white rounded-md shadow-md border border-gray-200 py-1 max-h-80 overflow-y-auto">
          {groups.map(g => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.group}</p>
              {g.modules.map(mod => {
                const active = allowed.includes(mod.key)
                return (
                  <button key={mod.key} type="button"
                    onClick={() => toggle(mod.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] ${active ? `${mod.color} text-white` : 'bg-gray-200 text-gray-400'}`}>
                      {mod.icon}
                    </span>
                    <span className={`text-sm ${active ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{mod.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeopleListPage({ title, roles, createLabel, createRoute, showAccessGroups }: PeopleListPageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [people, setPeople] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchPeople() {
      setLoading(true)
      setError(null)

      if (roles.length === 0) {
        setPeople([])
        setLoading(false)
        return
      }

      let query = supabase
        .from('staff')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('first_name', { ascending: true })

      if (roles.length === 1) {
        query = query.eq('role', roles[0])
      } else {
        query = query.in('role', roles)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setPeople(data as StaffMember[])
      setLoading(false)
    }

    fetchPeople()
  }, [profile, roles])

  async function updateModules(personId: string, modules: string[]) {
    if (!profile) return
    const { error: updateError } = await supabase
      .from('staff')
      .update({ allowed_modules: modules })
      .eq('id', personId)

    if (updateError) return

    setPeople(ps => ps.map(p => p.id === personId ? { ...p, allowed_modules: modules } : p))
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'staff', entity_id: personId, details: { fields: 'allowed_modules', allowed_modules: modules } })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load {title.toLowerCase()}: {error}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <button
          onClick={() => navigate(createRoute)}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
        >
          + {createLabel}
        </button>
      </div>

      {people.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No {title.toLowerCase()} found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {people.map(person => (
            <div key={person.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                  {person.first_name[0]}{person.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {person.first_name} {person.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{person.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {showAccessGroups && person.role !== 'admin' && (
                  <ModuleAccessControl
                    person={person}
                    onUpdate={(modules) => updateModules(person.id, modules)}
                  />
                )}
                <button
                  onClick={() => navigate(`/people/${person.id}/edit`)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
