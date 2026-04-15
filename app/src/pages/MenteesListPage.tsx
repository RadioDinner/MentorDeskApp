import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import MenteeManagePanel from '../components/MenteeManageSlideOver'
import LoadingErrorState from '../components/LoadingErrorState'
import type { Mentee } from '../types'
import Button from '../components/ui/Button'
import { Skeleton, PageBar } from '../components/ui'

const PAGE_SIZE = 25

interface MenteeProgressSummary {
  activeCourses: number
  totalLessons: number
  completedLessons: number
  activeEngagements: number
}

/** Count of journeys with pending_assignment_node_id set, per mentee. */
type PendingJourneyMap = Record<string, number>

export default function MenteesListPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedMenteeId, setSelectedMenteeId] = useState<string | null>(null)
  const [progressMap, setProgressMap] = useState<Record<string, MenteeProgressSummary>>({})
  const [pendingJourneyMap, setPendingJourneyMap] = useState<PendingJourneyMap>({})
  const [page, setPage] = useState(1)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'assistant_mentor'
  const isCompact = !!selectedMenteeId
  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[MenteesListPage] No profile.organization_id — profile:', profile); setLoading(false); return }
    const orgId = profile.organization_id
    const profileId = profile.id
    const mentorMode = isMentor

    async function loadMentees() {
      setLoading(true)
      setError(null)
      try {
        if (mentorMode) {
          // Raw REST to avoid SDK auth-lock hangs
          const pairingsRes = await supabaseRestGet<{ mentee_id: string }>(
            'pairings',
            `select=mentee_id&mentor_id=eq.${profileId}&status=in.(active,paused)`,
            { label: 'mentees:pairings' },
          )
          if (pairingsRes.error) { setError(pairingsRes.error.message); return }
          const menteeIds = (pairingsRes.data ?? []).map(p => p.mentee_id)
          if (menteeIds.length === 0) {
            setMentees([])
            return
          }
          const idList = menteeIds.join(',')
          const menteesRes = await supabaseRestGet<Mentee>(
            'mentees',
            `select=*&id=in.(${idList})&order=first_name.asc`,
            { label: 'mentees:assigned' },
          )
          if (menteesRes.error) { setError(menteesRes.error.message); return }
          setMentees(menteesRes.data ?? [])
        } else {
          const menteesRes = await supabaseRestGet<Mentee>(
            'mentees',
            `select=*&organization_id=eq.${orgId}&order=first_name.asc`,
            { label: 'mentees:all' },
          )
          if (menteesRes.error) { setError(menteesRes.error.message); return }
          setMentees(menteesRes.data ?? [])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[MenteesListPage] loadMentees error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadMentees
    loadMentees()
  }, [profile?.organization_id, profile?.id, profile?.role, isMentor])

  // Fetch course progress summaries for all mentees
  useEffect(() => {
    if (mentees.length === 0 || !profile?.organization_id) return

    async function fetchProgress() {
      try {
        const menteeIds = mentees.filter(m => !m.archived_at).map(m => m.id)
        if (menteeIds.length === 0) return

        // Get active mentee_offerings (courses + engagements)
        const { data: moData } = await supabase
          .from('mentee_offerings')
          .select('id, mentee_id, offering_id, status, offering:offerings(type)')
          .in('mentee_id', menteeIds)
          .eq('status', 'active')

        if (!moData || moData.length === 0) return

        // Supabase returns the joined offering as an object for .single()-style joins
        const menteeOfferings = (moData as unknown as { id: string; mentee_id: string; offering_id: string; status: string; offering: { type: string } | null }[])

        // Count courses/engagements per mentee
        const summaries: Record<string, MenteeProgressSummary> = {}
        const courseMoIds: string[] = []
        const courseOfferingIds = new Set<string>()

        for (const mo of menteeOfferings) {
          if (!summaries[mo.mentee_id]) {
            summaries[mo.mentee_id] = { activeCourses: 0, totalLessons: 0, completedLessons: 0, activeEngagements: 0 }
          }
          if (mo.offering?.type === 'course') {
            summaries[mo.mentee_id].activeCourses++
            courseMoIds.push(mo.id)
            courseOfferingIds.add(mo.offering_id)
          } else if (mo.offering?.type === 'engagement') {
            summaries[mo.mentee_id].activeEngagements++
          }
        }

        // Fetch lesson counts + completed progress in parallel
        const [lessonsRes, progressRes] = await Promise.all([
          courseOfferingIds.size > 0
            ? supabase.from('lessons').select('offering_id').in('offering_id', Array.from(courseOfferingIds))
            : Promise.resolve({ data: [] }),
          courseMoIds.length > 0
            ? supabase.from('lesson_progress').select('mentee_offering_id, mentee_id').in('mentee_offering_id', courseMoIds).eq('status', 'completed')
            : Promise.resolve({ data: [] }),
        ])

        if (lessonsRes.data) {
          const lessonCountsByOffering: Record<string, number> = {}
          for (const l of lessonsRes.data as { offering_id: string }[]) {
            lessonCountsByOffering[l.offering_id] = (lessonCountsByOffering[l.offering_id] || 0) + 1
          }
          for (const mo of menteeOfferings) {
            if (mo.offering?.type === 'course' && summaries[mo.mentee_id]) {
              summaries[mo.mentee_id].totalLessons += lessonCountsByOffering[mo.offering_id] ?? 0
            }
          }
        }

        if (progressRes.data) {
          for (const p of progressRes.data as { mentee_offering_id: string; mentee_id: string }[]) {
            if (summaries[p.mentee_id]) {
              summaries[p.mentee_id].completedLessons++
            }
          }
        }

        setProgressMap(summaries)
      } catch (err) {
        console.error('[MenteesListPage] fetchProgress error:', err)
      }
    }

    fetchProgress()
  }, [mentees, profile?.organization_id])

  // Fetch count of pending-assignment journeys per mentee so the list
  // can surface a badge when a mentor needs to manually confirm an
  // offering that a journey advance wants to open.
  useEffect(() => {
    if (mentees.length === 0) return

    async function fetchPendingJourneys() {
      try {
        const menteeIds = mentees.filter(m => !m.archived_at).map(m => m.id)
        if (menteeIds.length === 0) { setPendingJourneyMap({}); return }

        const { data } = await supabase
          .from('mentee_journeys')
          .select('mentee_id')
          .in('mentee_id', menteeIds)
          .eq('status', 'active')
          .not('pending_assignment_node_id', 'is', null)

        const map: PendingJourneyMap = {}
        for (const row of (data ?? []) as { mentee_id: string }[]) {
          map[row.mentee_id] = (map[row.mentee_id] || 0) + 1
        }
        setPendingJourneyMap(map)
      } catch (err) {
        console.error('[MenteesListPage] fetchPendingJourneys error:', err)
      }
    }

    fetchPendingJourneys()
  }, [mentees, profile?.organization_id])

  async function archiveMentee(id: string) {
    if (!profile) return
    const now = new Date().toISOString()
    const { error: e } = await supabase.from('mentees').update({ archived_at: now }).eq('id', id)
    if (e) { toast.error(e.message); return }
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: now } : m))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'archived', entity_type: 'mentee', entity_id: id })
  }

  async function unarchiveMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').update({ archived_at: null }).eq('id', id)
    if (e) { toast.error(e.message); return }
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: null } : m))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'unarchived', entity_type: 'mentee', entity_id: id })
  }

  async function deleteMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').delete().eq('id', id)
    if (e) { toast.error(e.message); return }
    setMentees(ms => ms.filter(m => m.id !== id))
    setConfirmDelete(null)
    if (selectedMenteeId === id) setSelectedMenteeId(null)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'mentee', entity_id: id })
  }

  if (loading) return <div className="py-4"><Skeleton count={8} className="h-11 w-full" gap="gap-2" /></div>

  if (error) {
    return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
  }

  const activeMentees = mentees.filter(m => !m.archived_at)
  const archivedMentees = mentees.filter(m => m.archived_at)
  const displayMentees = showArchived ? mentees : activeMentees
  // Compact mode shows all mentees (side-nav); full-width view paginates
  const paginatedMentees = isCompact
    ? displayMentees
    : displayMentees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedMentee = mentees.find(m => m.id === selectedMenteeId) ?? null

  return (
    <div className="flex gap-5 -mr-6" style={{ minHeight: 'calc(100vh - 100px)' }}>
      {/* ── Mentee list column ── */}
      <div className={`shrink-0 transition-all duration-200 ${isCompact ? 'w-64' : 'w-full max-w-4xl'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between mb-4 ${isCompact ? 'flex-col items-stretch gap-2' : ''}`}>
          <div>
            <h1 className={`font-semibold text-gray-900 ${isCompact ? 'text-base' : 'text-xl'}`}>
              {isMentor ? 'My Mentees' : 'Mentees'}
            </h1>
            {!isCompact && (
              <p className="text-sm text-gray-500 mt-0.5">
                {isMentor
                  ? `${activeMentees.length} assigned to you`
                  : `${activeMentees.length} active${archivedMentees.length > 0 ? `, ${archivedMentees.length} de-activated` : ''}`
                }
              </p>
            )}
          </div>
          {!isCompact && (
            <div className="flex items-center gap-3">
              {!isMentor && archivedMentees.length > 0 && (
                <button
                  onClick={() => { setShowArchived(!showArchived); setPage(1) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                    showArchived
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {showArchived ? 'Hide de-activated' : `Show de-activated (${archivedMentees.length})`}
                </button>
              )}
              {!isMentor && (
                <Button onClick={() => navigate('/mentees/new')}>+ Create Mentee Account</Button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        {displayMentees.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No mentees found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {paginatedMentees.map(mentee => {
              const isArchived = !!mentee.archived_at
              const isSelected = selectedMenteeId === mentee.id
              const isConfirming = confirmDelete === mentee.id

              const pendingCount = pendingJourneyMap[mentee.id] ?? 0

              /* ── Compact row (when panel is open) ── */
              if (isCompact) {
                return (
                  <button
                    key={mentee.id}
                    onClick={() => !isArchived && setSelectedMenteeId(mentee.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-light border-l-2 border-brand'
                        : isArchived
                          ? 'bg-gray-50/50 opacity-50 cursor-default border-l-2 border-transparent'
                          : 'hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      isSelected ? 'bg-brand text-white' : isArchived ? 'bg-gray-200 text-gray-400' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {mentee.first_name[0]}{mentee.last_name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-medium truncate ${isSelected ? 'text-brand' : isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
                          {mentee.first_name} {mentee.last_name}
                        </p>
                        {pendingCount > 0 && !isArchived && (
                          <span
                            title={`${pendingCount} pending journey assignment${pendingCount !== 1 ? 's' : ''}`}
                            className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500"
                          />
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">{mentee.email}</p>
                    </div>
                  </button>
                )
              }

              /* ── Full row (no panel open) ── */
              const progress = progressMap[mentee.id]
              const progressPct = progress && progress.totalLessons > 0
                ? Math.round((progress.completedLessons / progress.totalLessons) * 100)
                : null

              return (
                <div key={mentee.id} className={`flex items-center justify-between px-5 py-4 ${isArchived ? 'bg-gray-50/50' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                      isArchived ? 'bg-gray-200 text-gray-400' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {mentee.first_name[0]}{mentee.last_name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
                          {mentee.first_name} {mentee.last_name}
                        </p>
                        {isArchived && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium shrink-0">De-activated</span>
                        )}
                        {!isArchived && pendingCount > 0 && (
                          <span
                            title={`${pendingCount} journey assignment${pendingCount !== 1 ? 's' : ''} pending your confirmation. Open Manage to confirm.`}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium shrink-0"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {pendingCount} pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                      {/* Progress summary (visible when not archived) */}
                      {!isArchived && progress && (progress.activeCourses > 0 || progress.activeEngagements > 0) && (
                        <div className="flex items-center gap-3 mt-1.5">
                          {progress.activeCourses > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400">
                                {progress.activeCourses} course{progress.activeCourses !== 1 ? 's' : ''}
                              </span>
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand rounded-full transition-all"
                                  style={{ width: `${progressPct ?? 0}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-medium text-gray-500 tabular-nums">
                                {progress.completedLessons}/{progress.totalLessons}
                              </span>
                            </div>
                          )}
                          {progress.activeEngagements > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {progress.activeEngagements} engagement{progress.activeEngagements !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isArchived && (
                      <Button variant="secondary" size="sm" onClick={() => setSelectedMenteeId(mentee.id)}>
                        Manage
                      </Button>
                    )}
                    {isMentor ? (
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/mentees/${mentee.id}/edit`)}>
                        View
                      </Button>
                    ) : isArchived ? (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => unarchiveMentee(mentee.id)}>Re-activate</Button>
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <Button variant="danger" size="sm" onClick={() => deleteMentee(mentee.id)}>Confirm</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button variant="dangerGhost" size="sm" onClick={() => setConfirmDelete(mentee.id)}>Delete</Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/mentees/${mentee.id}/edit`)}>
                          Edit
                        </Button>
                        <button
                          onClick={() => archiveMentee(mentee.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!isCompact && (
          <PageBar page={page} pageSize={PAGE_SIZE} total={displayMentees.length} onPage={setPage} className="mt-2" />
        )}
      </div>

      {/* ── Manage panel ── */}
      {selectedMentee && profile && (
        <div className="flex-1 min-w-0">
          <MenteeManagePanel
            mentee={selectedMentee}
            profile={profile}
            onClose={() => setSelectedMenteeId(null)}
          />
        </div>
      )}
    </div>
  )
}
