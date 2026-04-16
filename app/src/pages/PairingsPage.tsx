import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import PairingsGrid from '../components/PairingsGrid'
import type { PairingStatus, FlowStep } from '../types'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'
import { Skeleton } from '../components/ui'

interface MentorOption { id: string; first_name: string; last_name: string; max_active_mentees: number | null }
interface MenteeRow { id: string; first_name: string; last_name: string; email: string; flow_step_id: string | null }
interface OfferingOption { id: string; name: string; type: 'course' | 'engagement' }
interface PairingRow {
  id: string; status: PairingStatus; mentor_id: string; mentee_id: string; offering_id: string | null
  mentor: MentorOption
  mentee: MenteeRow
  offering?: OfferingOption | null
}

type ViewTab = 'grid' | 'by_mentor' | 'by_offering' | 'by_status' | 'unpaired'

export default function PairingsPage() {
  const { profile, isMenteeMode } = useAuth()
  const isAdminOrOps = !isMenteeMode && (profile?.role === 'admin' || profile?.role === 'operations')
  const toast = useToast()
  const [tab, setTab] = useState<ViewTab>('grid')
  const [mentors, setMentors] = useState<MentorOption[]>([])
  const [mentees, setMentees] = useState<MenteeRow[]>([])
  const [pairings, setPairings] = useState<PairingRow[]>([])
  const [offerings, setOfferings] = useState<OfferingOption[]>([])
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Quick pair state
  const [pairingMenteeId, setPairingMenteeId] = useState<string | null>(null)
  const [selectedMentorId, setSelectedMentorId] = useState('')
  const [pairing, setPairing] = useState(false)

  // Filter state
  const [filterMentor, setFilterMentor] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOffering, setFilterOffering] = useState('')

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  async function fetchAll() {
    if (!profile?.organization_id) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [mentorRes, menteeRes, pairingRes, offeringRes, orgRes] = await Promise.all([
        supabase.from('staff').select('id, first_name, last_name, max_active_mentees').eq('organization_id', profile.organization_id).in('role', ['mentor', 'assistant_mentor']).order('first_name'),
        supabase.from('mentees').select('id, first_name, last_name, email, flow_step_id').eq('organization_id', profile.organization_id).order('first_name'),
        supabase.from('pairings').select(`
          id, status, mentor_id, mentee_id, offering_id,
          mentor:staff!pairings_mentor_id_fkey ( id, first_name, last_name, max_active_mentees ),
          mentee:mentees!pairings_mentee_id_fkey ( id, first_name, last_name, email, flow_step_id ),
          offering:offerings ( id, name, type )
        `).eq('organization_id', profile.organization_id).neq('status', 'ended'),
        supabase.from('offerings').select('id, name, type').eq('organization_id', profile.organization_id).order('name'),
        supabase.from('organizations').select('mentee_flow').eq('id', profile.organization_id).single(),
      ])

      if (mentorRes.error || menteeRes.error || pairingRes.error) {
        setError(mentorRes.error?.message || menteeRes.error?.message || pairingRes.error?.message || 'Failed to load')
        return
      }

      setMentors(mentorRes.data ?? [])
      setMentees(menteeRes.data as MenteeRow[] ?? [])
      setPairings(pairingRes.data as unknown as PairingRow[] ?? [])
      setOfferings((offeringRes.data ?? []) as OfferingOption[])
      setFlowSteps((orgRes.data?.mentee_flow as { steps: FlowStep[] })?.steps ?? [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [profile?.organization_id])

  async function quickPair(menteeId: string, mentorId: string) {
    if (!profile) return
    setPairing(true)
    const { data: inserted, error } = await supabase.from('pairings').insert({
      organization_id: profile.organization_id,
      mentor_id: mentorId,
      mentee_id: menteeId,
    }).select('id').single()
    setPairing(false)
    if (error) { reportSupabaseError(error, { component: 'PairingsPage', action: 'quickPair' }); toast.error(error.message); return }
    const mentor = mentors.find(m => m.id === mentorId)
    const mentee = mentees.find(m => m.id === menteeId)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'pairing', entity_id: inserted?.id, details: { mentor: mentor ? `${mentor.first_name} ${mentor.last_name}` : mentorId, mentee: mentee ? `${mentee.first_name} ${mentee.last_name}` : menteeId } })
    setPairingMenteeId(null)
    setSelectedMentorId('')
    fetchAll()
  }

  async function changeMentor(pairingId: string, newMentorId: string) {
    if (!profile) return
    const { error } = await supabase.from('pairings').update({ mentor_id: newMentorId }).eq('id', pairingId)
    if (error) { reportSupabaseError(error, { component: 'PairingsPage', action: 'changeMentor' }); toast.error(error.message); return }
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'pairing', entity_id: pairingId, details: { fields: 'mentor_changed' } })
    fetchAll()
  }

  async function changeStatus(pairingId: string, newStatus: PairingStatus) {
    if (!profile) return
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'ended') updates.ended_at = new Date().toISOString()
    const { error } = await supabase.from('pairings').update(updates).eq('id', pairingId)
    if (error) { reportSupabaseError(error, { component: 'PairingsPage', action: 'changeStatus' }); toast.error(error.message); return }
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'pairing', entity_id: pairingId, details: { fields: 'status', status: newStatus } })
    fetchAll()
  }

  if (loading) return <div className="py-4"><Skeleton count={8} className="h-11 w-full" gap="gap-2" /></div>
  if (error) return <div className="rounded border bg-red-50 border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>

  const pairedMenteeIds = new Set(pairings.map(p => p.mentee_id))
  const unpairedMentees = mentees.filter(m => !pairedMenteeIds.has(m.id))

  // Compute active mentee count per mentor
  const mentorPairingCounts: Record<string, number> = {}
  for (const p of pairings) {
    if (p.status === 'active' || p.status === 'paused') {
      mentorPairingCounts[p.mentor_id] = (mentorPairingCounts[p.mentor_id] ?? 0) + 1
    }
  }

  function isMentorAtCapacity(mentorId: string): boolean {
    const mentor = mentors.find(m => m.id === mentorId)
    if (!mentor?.max_active_mentees) return false
    return (mentorPairingCounts[mentorId] ?? 0) >= mentor.max_active_mentees
  }

  function getMentorCapacityLabel(mentorId: string): string | null {
    const mentor = mentors.find(m => m.id === mentorId)
    if (!mentor?.max_active_mentees) return null
    const current = mentorPairingCounts[mentorId] ?? 0
    return `${current}/${mentor.max_active_mentees}`
  }

  const flowStepName = (id: string | null) => {
    if (!id) return null
    return flowSteps.find(s => s.id === id)?.name ?? null
  }

  const TABS: { value: ViewTab; label: string; count: number }[] = [
    { value: 'grid', label: 'Grid', count: pairings.length },
    { value: 'by_mentor', label: 'By Mentor', count: mentors.length },
    { value: 'by_offering', label: 'By Offering', count: offerings.length },
    { value: 'by_status', label: 'By Status', count: mentees.length },
    { value: 'unpaired', label: 'Unpaired / Waiting', count: unpairedMentees.length },
  ]

  const selectClass = 'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pairings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pairings.length} active pairing{pairings.length !== 1 ? 's' : ''}
            {unpairedMentees.length > 0 && <span className="text-amber-600"> · {unpairedMentees.length} unpaired</span>}
          </p>
        </div>
        {unpairedMentees.length > 0 && tab !== 'unpaired' && (
          <Button onClick={() => setTab('unpaired')}>
            Assign Mentors ({unpairedMentees.length})
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.value ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t.label} <span className="text-xs text-gray-400 ml-1">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ========== GRID ========== */}
      {tab === 'grid' && (
        <PairingsGrid
          pairings={pairings}
          mentors={mentors}
          mentees={mentees}
          offerings={offerings}
          flowSteps={flowSteps}
          canEdit={isAdminOrOps}
          onChangeMentor={changeMentor}
          onChangeStatus={changeStatus}
        />
      )}

      {/* ========== BY MENTOR ========== */}
      {tab === 'by_mentor' && (
        <div>
          {/* Filter */}
          <div className="flex items-center gap-3 mb-4">
            <select value={filterMentor} onChange={e => setFilterMentor(e.target.value)} className={selectClass}>
              <option value="">All mentors</option>
              {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </select>
            {filterMentor && <button onClick={() => setFilterMentor('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          </div>

          {mentors.filter(m => !filterMentor || m.id === filterMentor).map(mentor => {
            const mentorPairings = pairings.filter(p => p.mentor_id === mentor.id)
            if (mentorPairings.length === 0 && filterMentor) return null

            return (
              <div key={mentor.id} className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-600">
                    {mentor.first_name[0]}{mentor.last_name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{mentor.first_name} {mentor.last_name}</p>
                      {isMentorAtCapacity(mentor.id) && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">At capacity</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {mentorPairings.length} mentee{mentorPairings.length !== 1 ? 's' : ''}
                      {mentor.max_active_mentees && <span> · {mentor.max_active_mentees} max</span>}
                    </p>
                  </div>
                </div>

                {mentorPairings.length === 0 ? (
                  <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4 text-sm text-gray-400 ml-11">
                    No mentees paired
                  </div>
                ) : (
                  <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100 ml-11">
                    {mentorPairings.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center text-[10px] font-semibold text-green-600 shrink-0">
                            {p.mentee.first_name[0]}{p.mentee.last_name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.mentee.first_name} {p.mentee.last_name}</p>
                            <p className="text-xs text-gray-500 truncate">{p.mentee.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {flowStepName(p.mentee.flow_step_id) ? (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">{flowStepName(p.mentee.flow_step_id)}</span>
                          ) : (
                            <span className="text-[11px] text-gray-300">No status</span>
                          )}
                          {isAdminOrOps && (
                            <select
                              value={p.mentor_id}
                              onChange={e => changeMentor(p.id, e.target.value)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 bg-white"
                            >
                              {mentors.map(m => {
                              const atCap = isMentorAtCapacity(m.id)
                              const capLabel = getMentorCapacityLabel(m.id)
                              return <option key={m.id} value={m.id} disabled={atCap}>{m.first_name} {m.last_name}{capLabel ? ` (${capLabel})` : ''}{atCap ? ' — at capacity' : ''}</option>
                            })}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ========== BY OFFERING ========== */}
      {tab === 'by_offering' && (
        <div>
          {/* Filter */}
          <div className="flex items-center gap-3 mb-4">
            <select value={filterOffering} onChange={e => setFilterOffering(e.target.value)} className={selectClass}>
              <option value="">All offerings</option>
              <option value="__none__">No offering (general)</option>
              {offerings.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.type})</option>
              ))}
            </select>
            {filterOffering && <button onClick={() => setFilterOffering('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          </div>

          {(() => {
            // Build groups: each offering + a "General" bucket for pairings without an offering_id
            const groups: { key: string; label: string; sub?: string; pairings: PairingRow[] }[] = []
            const passesFilter = (offeringId: string | null) => {
              if (!filterOffering) return true
              if (filterOffering === '__none__') return offeringId === null
              return offeringId === filterOffering
            }

            for (const off of offerings) {
              if (!passesFilter(off.id)) continue
              const ps = pairings.filter(p => p.offering_id === off.id)
              groups.push({ key: off.id, label: off.name, sub: off.type, pairings: ps })
            }
            if (passesFilter(null)) {
              const general = pairings.filter(p => p.offering_id == null)
              groups.push({ key: '__general__', label: 'General (no offering)', pairings: general })
            }

            // Hide empty groups unless they match an explicit filter
            const visible = filterOffering ? groups : groups.filter(g => g.pairings.length > 0)

            if (visible.length === 0) {
              return (
                <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No pairings match this filter.</p>
                  <p className="text-xs text-gray-400 mt-1">Pairings are grouped by the offering they're tied to.</p>
                </div>
              )
            }

            return visible.map(group => (
              <div key={group.key} className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 ${
                    group.key === '__general__'
                      ? 'bg-gray-50 text-gray-500'
                      : group.sub === 'engagement' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {group.label[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                      {group.sub && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{group.sub}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {group.pairings.length} pairing{group.pairings.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {group.pairings.length === 0 ? (
                  <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4 text-sm text-gray-400 ml-11">
                    No pairings assigned
                  </div>
                ) : (
                  <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100 ml-11">
                    {group.pairings.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center text-[10px] font-semibold text-green-600 shrink-0">
                            {p.mentee.first_name[0]}{p.mentee.last_name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.mentee.first_name} {p.mentee.last_name}</p>
                            <p className="text-xs text-gray-500 truncate">{p.mentee.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isAdminOrOps && <span className="text-xs text-gray-400 hidden sm:inline">with</span>}
                          {isAdminOrOps ? (
                            <select
                              value={p.mentor_id}
                              onChange={e => changeMentor(p.id, e.target.value)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 bg-white"
                            >
                              {mentors.map(m => {
                                const atCap = isMentorAtCapacity(m.id)
                                const capLabel = getMentorCapacityLabel(m.id)
                                return <option key={m.id} value={m.id} disabled={atCap}>{m.first_name} {m.last_name}{capLabel ? ` (${capLabel})` : ''}{atCap ? ' — at capacity' : ''}</option>
                              })}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-600">{p.mentor.first_name} {p.mentor.last_name}</span>
                          )}
                          {flowStepName(p.mentee.flow_step_id) ? (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">{flowStepName(p.mentee.flow_step_id)}</span>
                          ) : (
                            <span className="text-[11px] text-gray-300">No status</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          })()}
        </div>
      )}

      {/* ========== UNPAIRED / WAITING LIST ========== */}
      {tab === 'unpaired' && (
        <div>
          <div className="mb-4">
            <p className="text-xs text-gray-500">Mentees without an active pairing. Ordered by their position in the mentee flow — the earliest onboarding steps float to the top of the waiting list.</p>
          </div>
          {unpairedMentees.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
              <p className="text-sm text-gray-500">Waiting list is empty — all mentees are currently paired.</p>
            </div>
          ) : (
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {unpairedMentees
                .slice()
                .sort((a, b) => {
                  const aStep = flowSteps.find(s => s.id === a.flow_step_id)
                  const bStep = flowSteps.find(s => s.id === b.flow_step_id)
                  const aOrder = aStep?.in_flow ? aStep.order : 999
                  const bOrder = bStep?.in_flow ? bStep.order : 999
                  if (aOrder !== bOrder) return aOrder - bOrder
                  return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
                })
                .map(mentee => (
                <div key={mentee.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-xs font-semibold text-green-600 shrink-0">
                      {mentee.first_name[0]}{mentee.last_name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{mentee.first_name} {mentee.last_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                        {flowStepName(mentee.flow_step_id) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{flowStepName(mentee.flow_step_id)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdminOrOps && (
                    <div className="flex items-center gap-2 shrink-0">
                      {pairingMenteeId === mentee.id ? (
                        <>
                          <select value={selectedMentorId} onChange={e => setSelectedMentorId(e.target.value)} className={selectClass}>
                            <option value="">Select mentor...</option>
                            {mentors.map(m => {
                              const atCap = isMentorAtCapacity(m.id)
                              const capLabel = getMentorCapacityLabel(m.id)
                              return <option key={m.id} value={m.id} disabled={atCap}>{m.first_name} {m.last_name}{capLabel ? ` (${capLabel})` : ''}{atCap ? ' — at capacity' : ''}</option>
                            })}
                          </select>
                          <Button size="sm" disabled={!selectedMentorId || pairing}
                            onClick={() => quickPair(mentee.id, selectedMentorId)}>
                            {pairing ? '...' : 'Pair'}
                          </Button>
                          <button onClick={() => { setPairingMenteeId(null); setSelectedMentorId('') }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setPairingMenteeId(mentee.id)}>
                          Pair with mentor
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== BY STATUS ========== */}
      {tab === 'by_status' && (
        <div>
          {/* Filter */}
          <div className="flex items-center gap-3 mb-4">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
              <option value="">All statuses</option>
              <option value="__none__">No status set</option>
              {flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {flowSteps.filter(s => !s.in_flow).map(s => (
                <option key={s.id} value={s.id}>{s.name} (non-flow)</option>
              ))}
            </select>
            {filterStatus && <button onClick={() => setFilterStatus('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          </div>

          {(() => {
            const filtered = filterStatus === '__none__'
              ? mentees.filter(m => !m.flow_step_id)
              : filterStatus
                ? mentees.filter(m => m.flow_step_id === filterStatus)
                : mentees

            // Group by status
            const groups: { label: string; mentees: MenteeRow[] }[] = []
            if (!filterStatus) {
              const byStep = new Map<string, MenteeRow[]>()
              const noStatus: MenteeRow[] = []
              for (const m of filtered) {
                if (!m.flow_step_id) { noStatus.push(m); continue }
                const arr = byStep.get(m.flow_step_id) ?? []
                arr.push(m)
                byStep.set(m.flow_step_id, arr)
              }
              for (const step of flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order)) {
                const ms = byStep.get(step.id)
                if (ms && ms.length > 0) groups.push({ label: step.name, mentees: ms })
              }
              for (const step of flowSteps.filter(s => !s.in_flow)) {
                const ms = byStep.get(step.id)
                if (ms && ms.length > 0) groups.push({ label: step.name, mentees: ms })
              }
              if (noStatus.length > 0) groups.push({ label: 'No status', mentees: noStatus })
            } else {
              if (filtered.length > 0) {
                const label = filterStatus === '__none__' ? 'No status' : flowSteps.find(s => s.id === filterStatus)?.name ?? 'Unknown'
                groups.push({ label, mentees: filtered })
              }
            }

            if (groups.length === 0) {
              return (
                <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No mentees match this filter.</p>
                </div>
              )
            }

            return groups.map(group => (
              <div key={group.label} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
                  <span className="text-xs text-gray-300">({group.mentees.length})</span>
                </div>
                <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
                  {group.mentees.map(mentee => {
                    const currentPairing = pairings.find(p => p.mentee_id === mentee.id)
                    return (
                      <div key={mentee.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-[10px] font-semibold text-green-600 shrink-0">
                            {mentee.first_name[0]}{mentee.last_name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{mentee.first_name} {mentee.last_name}</p>
                            <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {currentPairing ? (
                            <>
                              <span className="text-xs text-gray-400">Mentor:</span>
                              {isAdminOrOps ? (
                                <select
                                  value={currentPairing.mentor_id}
                                  onChange={e => changeMentor(currentPairing.id, e.target.value)}
                                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 bg-white"
                                >
                                  {mentors.map(m => {
                                  const atCap = isMentorAtCapacity(m.id)
                                  const capLabel = getMentorCapacityLabel(m.id)
                                  return <option key={m.id} value={m.id} disabled={atCap}>{m.first_name} {m.last_name}{capLabel ? ` (${capLabel})` : ''}{atCap ? ' — at capacity' : ''}</option>
                                })}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-600">{currentPairing.mentor.first_name} {currentPairing.mentor.last_name}</span>
                              )}
                            </>
                          ) : isAdminOrOps ? (
                            pairingMenteeId === mentee.id ? (
                              <>
                                <select value={selectedMentorId} onChange={e => setSelectedMentorId(e.target.value)} className={selectClass}>
                                  <option value="">Select mentor...</option>
                                  {mentors.map(m => {
                                  const atCap = isMentorAtCapacity(m.id)
                                  const capLabel = getMentorCapacityLabel(m.id)
                                  return <option key={m.id} value={m.id} disabled={atCap}>{m.first_name} {m.last_name}{capLabel ? ` (${capLabel})` : ''}{atCap ? ' — at capacity' : ''}</option>
                                })}
                                </select>
                                <Button size="sm" disabled={!selectedMentorId || pairing}
                                  onClick={() => quickPair(mentee.id, selectedMentorId)}>
                                  {pairing ? '...' : 'Pair'}
                                </Button>
                                <button onClick={() => { setPairingMenteeId(null); setSelectedMentorId('') }}
                                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                              </>
                            ) : (
                              <Button size="sm" onClick={() => setPairingMenteeId(mentee.id)}>
                                Pair with mentor
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </div>
  )
}
