import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import ModuleAccessControl from '../components/ModuleAccessControl'
import type { StaffMember, StaffRole, RoleGroup } from '../types'

interface PeopleListPageProps {
  title: string
  roles: StaffRole[]
  createLabel: string
  createRoute: string
  showAccessGroups?: boolean
}

export default function PeopleListPage({ title, roles, createLabel, createRoute, showAccessGroups }: PeopleListPageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [people, setPeople] = useState<StaffMember[]>([])
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  const [permissionGroups, setPermissionGroups] = useState<RoleGroup[]>([])
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

      // Fetch the people for this page
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

      const [{ data, error: fetchError }, allStaffRes, orgRes] = await Promise.all([
        query,
        // Fetch all staff for "copy from" feature
        showAccessGroups
          ? supabase.from('staff').select('*').eq('organization_id', profile!.organization_id).order('first_name')
          : Promise.resolve({ data: [], error: null }),
        // Fetch org permission groups
        showAccessGroups
          ? supabase.from('organizations').select('role_groups').eq('id', profile!.organization_id).single()
          : Promise.resolve({ data: null, error: null }),
      ])

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setPeople(data as StaffMember[])
      if (showAccessGroups) {
        setAllStaff((allStaffRes.data ?? []) as StaffMember[])
        setPermissionGroups((orgRes.data?.role_groups as RoleGroup[]) ?? [])
      }
      setLoading(false)
    }

    fetchPeople()
  }, [profile?.organization_id, roles, showAccessGroups])

  async function updateModules(personId: string, modules: string[]) {
    if (!profile) return
    const { error: updateError } = await supabase
      .from('staff')
      .update({ allowed_modules: modules })
      .eq('id', personId)

    if (updateError) return

    setPeople(ps => ps.map(p => p.id === personId ? { ...p, allowed_modules: modules } : p))
    setAllStaff(ps => ps.map(p => p.id === personId ? { ...p, allowed_modules: modules } : p))
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
            <StaffRow
              key={person.id}
              person={person}
              showAccessGroups={showAccessGroups}
              allStaff={allStaff}
              permissionGroups={permissionGroups}
              onUpdateModules={(modules) => updateModules(person.id, modules)}
              onEdit={() => navigate(`/people/${person.id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StaffRow({
  person,
  showAccessGroups,
  allStaff,
  permissionGroups,
  onUpdateModules,
  onEdit,
}: {
  person: StaffMember
  showAccessGroups?: boolean
  allStaff: StaffMember[]
  permissionGroups: RoleGroup[]
  onUpdateModules: (modules: string[]) => void
  onEdit: () => void
}) {
  const [accessExpanded, setAccessExpanded] = useState(false)
  const showAccess = showAccessGroups && person.role !== 'admin'

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between">
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
          {showAccess && (
            <ModuleAccessControl
              person={person}
              allPeople={allStaff}
              permissionGroups={permissionGroups}
              onUpdate={onUpdateModules}
              expanded={accessExpanded}
              onToggle={() => setAccessExpanded(!accessExpanded)}
            />
          )}
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Expanded access panel — renders below the row, full card width */}
      {showAccess && accessExpanded && (
        <ModuleAccessControl
          person={person}
          allPeople={allStaff}
          permissionGroups={permissionGroups}
          onUpdate={onUpdateModules}
          expanded={accessExpanded}
          onToggle={() => setAccessExpanded(false)}
          renderPanel
        />
      )}
    </div>
  )
}
