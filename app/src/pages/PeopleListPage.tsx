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
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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

      const [{ data, error: fetchError }, allStaffRes, orgRes] = await Promise.all([
        query,
        showAccessGroups
          ? supabase.from('staff').select('*').eq('organization_id', profile!.organization_id).order('first_name')
          : Promise.resolve({ data: [], error: null }),
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

  async function archivePerson(personId: string) {
    if (!profile) return
    const now = new Date().toISOString()
    const { error: e } = await supabase.from('staff').update({ archived_at: now }).eq('id', personId)
    if (e) return
    setPeople(ps => ps.map(p => p.id === personId ? { ...p, archived_at: now } : p))
    setAllStaff(ps => ps.map(p => p.id === personId ? { ...p, archived_at: now } : p))
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'archived', entity_type: 'staff', entity_id: personId })
  }

  async function unarchivePerson(personId: string) {
    if (!profile) return
    const { error: e } = await supabase.from('staff').update({ archived_at: null }).eq('id', personId)
    if (e) return
    setPeople(ps => ps.map(p => p.id === personId ? { ...p, archived_at: null } : p))
    setAllStaff(ps => ps.map(p => p.id === personId ? { ...p, archived_at: null } : p))
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'unarchived', entity_type: 'staff', entity_id: personId })
  }

  async function deletePerson(personId: string) {
    if (!profile) return
    const { error: e } = await supabase.from('staff').delete().eq('id', personId)
    if (e) return
    setPeople(ps => ps.filter(p => p.id !== personId))
    setAllStaff(ps => ps.filter(p => p.id !== personId))
    setConfirmDelete(null)
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'staff', entity_id: personId })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load {title.toLowerCase()}: {error}
      </div>
    )
  }

  const activePeople = people.filter(p => !p.archived_at)
  const archivedPeople = people.filter(p => p.archived_at)
  const displayPeople = showArchived ? people : activePeople

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activePeople.length} active{archivedPeople.length > 0 ? `, ${archivedPeople.length} archived` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {archivedPeople.length > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                showArchived
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedPeople.length})`}
            </button>
          )}
          <button
            onClick={() => navigate(createRoute)}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + {createLabel}
          </button>
        </div>
      </div>

      {displayPeople.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No {title.toLowerCase()} found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {displayPeople.map(person => (
            <StaffRow
              key={person.id}
              person={person}
              showAccessGroups={showAccessGroups}
              allStaff={allStaff}
              permissionGroups={permissionGroups}
              onUpdateModules={(modules) => updateModules(person.id, modules)}
              onEdit={() => navigate(`/people/${person.id}/edit`)}
              onArchive={() => archivePerson(person.id)}
              onUnarchive={() => unarchivePerson(person.id)}
              onDelete={() => deletePerson(person.id)}
              confirmDelete={confirmDelete === person.id}
              onConfirmDeleteToggle={() => setConfirmDelete(confirmDelete === person.id ? null : person.id)}
              isSelf={person.id === profile?.id}
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
  onArchive,
  onUnarchive,
  onDelete,
  confirmDelete,
  onConfirmDeleteToggle,
  isSelf,
}: {
  person: StaffMember
  showAccessGroups?: boolean
  allStaff: StaffMember[]
  permissionGroups: RoleGroup[]
  onUpdateModules: (modules: string[]) => void
  onEdit: () => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  confirmDelete: boolean
  onConfirmDeleteToggle: () => void
  isSelf: boolean
}) {
  const [accessExpanded, setAccessExpanded] = useState(false)
  const showAccess = showAccessGroups && person.role !== 'admin'
  const isArchived = !!person.archived_at

  return (
    <div className={`px-5 py-3 ${isArchived ? 'bg-gray-50/50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
            isArchived ? 'bg-gray-200 text-gray-400' : 'bg-slate-100 text-slate-600'
          }`}>
            {person.first_name[0]}{person.last_name[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-medium truncate ${isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
                {person.first_name} {person.last_name}
              </p>
              {isArchived && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium shrink-0">Archived</span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{person.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showAccess && !isArchived && (
            <ModuleAccessControl
              person={person}
              allPeople={allStaff}
              permissionGroups={permissionGroups}
              onUpdate={onUpdateModules}
              expanded={accessExpanded}
              onToggle={() => setAccessExpanded(!accessExpanded)}
            />
          )}

          {isArchived ? (
            <>
              <button
                onClick={onUnarchive}
                className="px-3 py-1.5 text-xs font-medium text-brand border border-gray-200 rounded hover:bg-brand-light transition-colors"
              >
                Restore
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={onConfirmDeleteToggle}
                    className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={onConfirmDeleteToggle}
                  className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              {!isSelf && person.role !== 'admin' && (
                <button
                  onClick={onArchive}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                  title="Archive"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showAccess && accessExpanded && !isArchived && (
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
