import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import PairingsGrid from '../components/PairingsGrid'
import type { PairingStatus, FlowStep } from '../types'

interface MentorOption { id: string; first_name: string; last_name: string }
interface MenteeRow { id: string; first_name: string; last_name: string; email: string; flow_step_id: string | null }
interface PairingRow {
  id: string; status: PairingStatus; mentor_id: string; mentee_id: string
  mentor: MentorOption
  mentee: MenteeRow
}

type ViewTab = 'grid' | 'by_mentor' | 'unpaired' | 'by_status'

const STATUS_STYLES: Record<PairingStatus, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-yellow-50 text-yellow-700',
  ended: 'bg-gray-100 text-gray-500',
}

export default function PairingsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<ViewTab>('grid')
  const [mentors, setMentors] = useState<MentorOption[]>([])
  const [mentees, setMentees] = useState<MenteeRow[]>([])
  const [pairings, setPairings] = useState<PairingRow[]>([])
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

  async function fetchAll() {
    if (!profile?.organization_id) { console.warn('[PairingsPage] No profile.organization_id — profile:', profile); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [mentorRes, menteeRes, pairingRes, orgRes] = await Promise.all([
        supabase.from('staff').select('id, first_name, last_name').eq('organization_id', profile.organization_id).eq('role', 'mentor').order('first_name'),
        supabase.from('mentees').select('id, first_name, last_name, email, flow_step_id').eq('organization_id', profile.organization_id).order('first_name'),
        supabase.from('assignments').select(`
          id, status, mentor_id, mentee_id,
          mentor:staff!assignments_mentor_id_fkey ( id, first_name, last_name ),
          mentee:mentees!assignments_mentee_id_fkey ( id, first_name, last_name, email, flow_step_id )
        `).eq('organization_id', profile.organization_id).neq('status', 'ended'),
        supabase.from('organizations').select('mentee_flow').eq('id', profile.organization_id).single(),
      ])

      if (mentorRes.error || menteeRes.error || pairingRes.error) {
        setError(mentorRes.error?.message || menteeRes.error?.message || pairingRes.error?.message || 'Failed to load')
        return
      }

      setMentors(mentorRes.data ?? [])
      setMentees(menteeRes.data as MenteeRow[] ?? [])
      setPairings(pairingRes.data as unknown as PairingRow[] ?? [])
      setFlowSteps((orgRes.data?.mentee_flow as { steps: FlowStep[] })?.steps ?? [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [profile?.organization_id])

  async function quickPair(menteeId: string, mentorId: string) {
    if (!profile) return
    setPairing(true)
    const { error } = await supabase.from('assignments').insert({
      organization_id: profile.organization_id,
      mentor_id: mentorId,
      mentee_id: menteeId,
    })
    setPairing(false)
    if (error) { setError(error.message); return }
    const mentor = mentors.find(m => m.id === mentorId)
    const mentee = mentees.find(m => m.id === menteeId)
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'pairing', details: { mentor: mentor ? `${mentor.first_name} ${mentor.last_name}` : mentorId, mentee: mentee ? `${mentee.first_name} ${mentee.last_name}` : menteeId } })
    setPairingMenteeId(null)
    setSelectedMentorId('')
    fetchAll()
  }

  async function changeMentor(pairingId: string, newMentorId: string) {
    if (!profile) return
    const { error } = await supabase.from('assignments').update({ mentor_id: newMentorId }).eq('id', pairingId)
    if (error) { setError(error.message); return }
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'pairing', entity_id: pairingId, details: { fields: 'mentor_changed' } })
    fetchAll()
  }

  async function changeStatus(pairingId: string, newStatus: PairingStatus) {
    if (!profile) return
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'ended') updates.ended_at = new Date().toISOString()
    const { error } = await supabase.from('assignments').update(updates).eq('id', pairingId)
    if (error) { setError(error.message); return }
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'pairing', entity_id: pairingId, details: { fields: 'status', status: newStatus } })
    fetchAll()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>
  if (error) return <div className="rounded border bg-red-50 border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>

  const pairedMenteeIds = new Set(pairings.map(p => p.mentee_id))
  const unpairedMentees = mentees.filter(m => !pairedMenteeIds.has(m.id))

  const flowStepName = (id: string | null) => {
    if (!id) return null
    return flowSteps.find(s => s.id === id)?.name ?? null
  }

  const TABS: { value: ViewTab; label: string; count: number }[] = [
    { value: 'grid', label: 'Grid', count: pairings.length },
    { value: 'by_mentor', label: 'By Mentor', count: pairings.length },
    { value: 'unpaired', label: 'Unpaired', count: unpairedMentees.length },
    { value: 'by_status', label: 'By Status', count: mentees.length },
  ]

  const selectClass = 'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Pairings</h1>
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
          flowSteps={flowSteps}
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
                    <p className="text-sm font-semibold text-gray-900">{mentor.first_name} {mentor.last_name}</p>
                    <p className="text-xs text-gray-400">{mentorPairings.length} mentee{mentorPairings.length !== 1 ? 's' : ''}</p>
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
                          {flowStepName(p.mentee.flow_step_id) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{flowStepName(p.mentee.flow_step_id)}</span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                          <select
                            value={p.mentor_id}
                            onChange={e => changeMentor(p.id, e.target.value)}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 bg-white"
                          >
                            {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                          </select>
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

      {/* ========== UNPAIRED ========== */}
      {tab === 'unpaired' && (
        <div>
          {unpairedMentees.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
              <p className="text-sm text-gray-500">All mentees are currently paired with a mentor.</p>
            </div>
          ) : (
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {unpairedMentees.map(mentee => (
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

                  <div className="flex items-center gap-2 shrink-0">
                    {pairingMenteeId === mentee.id ? (
                      <>
                        <select value={selectedMentorId} onChange={e => setSelectedMentorId(e.target.value)} className={selectClass}>
                          <option value="">Select mentor...</option>
                          {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                        </select>
                        <button disabled={!selectedMentorId || pairing}
                          onClick={() => quickPair(mentee.id, selectedMentorId)}
                          className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50 transition">
                          {pairing ? '...' : 'Pair'}
                        </button>
                        <button onClick={() => { setPairingMenteeId(null); setSelectedMentorId('') }}
                          className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setPairingMenteeId(mentee.id)}
                        className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover transition">
                        Pair with mentor
                      </button>
                    )}
                  </div>
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
                              <select
                                value={currentPairing.mentor_id}
                                onChange={e => changeMentor(currentPairing.id, e.target.value)}
                                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 bg-white"
                              >
                                {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                              </select>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">Unpaired</span>
                          )}
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
