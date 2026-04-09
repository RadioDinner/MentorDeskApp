import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import MenteeManagePanel from '../components/MenteeManageSlideOver'
import type { Mentee } from '../types'

export default function MenteesListPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedMenteeId, setSelectedMenteeId] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  const isMentor = profile?.role === 'mentor' || profile?.role === 'assistant_mentor'
  const isCompact = !!selectedMenteeId

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[MenteesListPage] No profile.organization_id — profile:', profile); setLoading(false); return }

    async function fetchMentees() {
      setLoading(true)
      try {
        if (isMentor) {
          const { data: pairingsData, error: pairErr } = await withTimeout(
            supabase.from('pairings').select('mentee_id').eq('mentor_id', profile!.id).in('status', ['active', 'paused']),
            10000, 'fetchPairings',
          )
          if (pairErr) { setError(pairErr.message); return }
          const menteeIds = (pairingsData ?? []).map((a: { mentee_id: string }) => a.mentee_id)
          if (menteeIds.length === 0) {
            setMentees([])
          } else {
            const { data, error: fetchError } = await withTimeout(
              supabase.from('mentees').select('*').in('id', menteeIds).order('first_name', { ascending: true }),
              10000, 'fetchAssignedMentees',
            )
            if (fetchError) { setError(fetchError.message); return }
            setMentees(data as Mentee[])
          }
        } else {
          const { data, error: fetchError } = await withTimeout(
            supabase.from('mentees').select('*').eq('organization_id', profile!.organization_id).order('first_name', { ascending: true }),
            10000, 'fetchAllMentees',
          )
          if (fetchError) { setError(fetchError.message); return }
          setMentees(data as Mentee[])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchMentees()
  }, [profile?.organization_id, profile?.id, profile?.role])

  async function archiveMentee(id: string) {
    if (!profile) return
    const now = new Date().toISOString()
    const { error: e } = await supabase.from('mentees').update({ archived_at: now }).eq('id', id)
    if (e) return
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: now } : m))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'archived', entity_type: 'mentee', entity_id: id })
  }

  async function unarchiveMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').update({ archived_at: null }).eq('id', id)
    if (e) return
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: null } : m))
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'unarchived', entity_type: 'mentee', entity_id: id })
  }

  async function deleteMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').delete().eq('id', id)
    if (e) return
    setMentees(ms => ms.filter(m => m.id !== id))
    setConfirmDelete(null)
    if (selectedMenteeId === id) setSelectedMenteeId(null)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'mentee', entity_id: id })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load mentees: {error}
      </div>
    )
  }

  const activeMentees = mentees.filter(m => !m.archived_at)
  const archivedMentees = mentees.filter(m => m.archived_at)
  const displayMentees = showArchived ? mentees : activeMentees
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
                  onClick={() => setShowArchived(!showArchived)}
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
                <button
                  onClick={() => navigate('/mentees/new')}
                  className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
                >
                  + Create Mentee Account
                </button>
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
            {displayMentees.map(mentee => {
              const isArchived = !!mentee.archived_at
              const isSelected = selectedMenteeId === mentee.id
              const isConfirming = confirmDelete === mentee.id

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
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-brand' : isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
                        {mentee.first_name} {mentee.last_name}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{mentee.email}</p>
                    </div>
                  </button>
                )
              }

              /* ── Full row (no panel open) ── */
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
                      </div>
                      <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isArchived && (
                      <button
                        onClick={() => setSelectedMenteeId(mentee.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:text-brand hover:border-brand hover:bg-brand-light transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Manage
                      </button>
                    )}
                    {isMentor ? (
                      <button
                        onClick={() => navigate(`/mentees/${mentee.id}/edit`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        View
                      </button>
                    ) : isArchived ? (
                      <>
                        <button onClick={() => unarchiveMentee(mentee.id)} className="px-3 py-1.5 text-xs font-medium text-brand border border-gray-200 rounded hover:bg-brand-light transition-colors">
                          Re-activate
                        </button>
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => deleteMentee(mentee.id)} className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors">Confirm</button>
                            <button onClick={() => setConfirmDelete(null)} className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(mentee.id)} className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors">Delete</button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => navigate(`/mentees/${mentee.id}/edit`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => archiveMentee(mentee.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors"
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
