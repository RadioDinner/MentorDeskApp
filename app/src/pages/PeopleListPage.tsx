import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import ModuleAccessControl from '../components/ModuleAccessControl'
import LoadingErrorState from '../components/LoadingErrorState'
import type { StaffMember, StaffRole, RoleGroup } from '../types'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Skeleton } from '../components/ui'

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
  const [confirmArchive, setConfirmArchive] = useState<StaffMember | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[PeopleListPage] No profile.organization_id — profile:', profile); setLoading(false); return }
    const orgId = profile.organization_id

    async function loadPeople() {
      setLoading(true)
      setError(null)

      if (roles.length === 0) {
        setPeople([])
        setLoading(false)
        return
      }

      try {
        const roleFilter = roles.length === 1 ? `role=eq.${roles[0]}` : `role=in.(${roles.join(',')})`
        const [peopleRes, allStaffRes, orgRes] = await Promise.all([
          supabaseRestGet<StaffMember>(
            'staff',
            `select=*&organization_id=eq.${orgId}&${roleFilter}&order=first_name.asc`,
            { label: 'people:list' },
          ),
          showAccessGroups
            ? supabaseRestGet<StaffMember>(
                'staff',
                `select=*&organization_id=eq.${orgId}&order=first_name.asc`,
                { label: 'people:allStaff' },
              )
            : Promise.resolve({ data: [], error: null }),
          showAccessGroups
            ? supabaseRestGet<{ role_groups: RoleGroup[] | null }>(
                'organizations',
                `select=role_groups&id=eq.${orgId}`,
                { label: 'people:roleGroups' },
              )
            : Promise.resolve({ data: [], error: null }),
        ])

        if (peopleRes.error) { setError(peopleRes.error.message); return }
        setPeople(peopleRes.data ?? [])

        if (showAccessGroups) {
          if (allStaffRes.error) { setError(allStaffRes.error.message); return }
          if (orgRes.error) { setError(orgRes.error.message); return }
          setAllStaff(allStaffRes.data ?? [])
          const orgRow = (orgRes.data ?? [])[0] as { role_groups: RoleGroup[] | null } | undefined
          setPermissionGroups(orgRow?.role_groups ?? [])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[PeopleListPage] loadPeople error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadPeople
    loadPeople()
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
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'staff', entity_id: personId, details: { fields: 'allowed_modules', allowed_modules: modules } })
  }

  async function archivePerson(personId: string) {
    if (!profile) return
    const now = new Date().toISOString()
    const { error: e } = await supabase.from('staff').update({ archived_at: now }).eq('id', personId)
    if (e) return
    setPeople(ps => ps.map(p => p.id === personId ? { ...p, archived_at: now } : p))
    setAllStaff(ps => ps.map(p => p.id === personId ? { ...p, archived_at: now } : p))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'archived', entity_type: 'staff', entity_id: personId })
  }

  async function unarchivePerson(personId: string) {
    if (!profile) return
    const { error: e } = await supabase.from('staff').update({ archived_at: null }).eq('id', personId)
    if (e) return
    setPeople(ps => ps.map(p => p.id === personId ? { ...p, archived_at: null } : p))
    setAllStaff(ps => ps.map(p => p.id === personId ? { ...p, archived_at: null } : p))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'unarchived', entity_type: 'staff', entity_id: personId })
  }

  async function deletePerson(personId: string) {
    if (!profile) return
    const { error: e } = await supabase.from('staff').delete().eq('id', personId)
    if (e) return
    setPeople(ps => ps.filter(p => p.id !== personId))
    setAllStaff(ps => ps.filter(p => p.id !== personId))
    setConfirmDelete(null)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'staff', entity_id: personId })
  }

  if (loading) return <div className="py-4"><Skeleton count={8} className="h-11 w-full" gap="gap-2" /></div>

  if (error) {
    return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
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
          <Button onClick={() => navigate(createRoute)}>+ {createLabel}</Button>
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
              onArchive={() => setConfirmArchive(person)}
              onUnarchive={() => unarchivePerson(person.id)}
              onDelete={() => deletePerson(person.id)}
              confirmDelete={confirmDelete === person.id}
              onConfirmDeleteToggle={() => setConfirmDelete(confirmDelete === person.id ? null : person.id)}
              isSelf={person.id === profile?.id}
            />
          ))}
        </div>
      )}

      {/* Archive confirmation modal */}
      <Modal
        open={!!confirmArchive}
        title="Archive this person?"
        onClose={() => setConfirmArchive(null)}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmArchive(null)}>Cancel</Button>
            <button
              onClick={async () => {
                const id = confirmArchive!.id
                setConfirmArchive(null)
                await archivePerson(id)
              }}
              className="inline-flex items-center justify-center gap-2 rounded font-medium transition focus:outline-none px-4 py-2 text-sm bg-amber-500 text-white hover:bg-amber-600"
            >
              Yes, archive
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            Are you sure you want to archive{' '}
            <span className="font-medium text-gray-900">
              {confirmArchive?.first_name} {confirmArchive?.last_name}
            </span>
            ? They'll be hidden from active lists. You can restore them later from the archived view.
          </p>
        </div>
      </Modal>
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
              <Button variant="secondary" size="sm" onClick={onUnarchive}>Restore</Button>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <Button variant="danger" size="sm" onClick={onDelete}>Confirm</Button>
                  <Button variant="ghost" size="sm" onClick={onConfirmDeleteToggle}>Cancel</Button>
                </div>
              ) : (
                <Button variant="dangerGhost" size="sm" onClick={onConfirmDeleteToggle}>Delete</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
              {!isSelf && person.role !== 'admin' && (
                <button
                  onClick={onArchive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                  title="Archive"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Archive
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
