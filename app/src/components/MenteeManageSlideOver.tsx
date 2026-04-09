import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee, Offering, MenteeOffering, StaffMember } from '../types'

interface Props {
  mentee: Mentee
  profile: StaffMember
  onClose: () => void
}

interface MenteeOfferingWithDetails extends MenteeOffering {
  offering?: Offering
  lesson_count?: number
}

export default function MenteeManageSlideOver({ mentee, profile, onClose }: Props) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  const [assignments, setAssignments] = useState<MenteeOfferingWithDetails[]>([])
  const [availableCourses, setAvailableCourses] = useState<Offering[]>([])
  const [availableEngagements, setAvailableEngagements] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [allowMultiEngagement, setAllowMultiEngagement] = useState(false)

  const [showCourseSelect, setShowCourseSelect] = useState(false)
  const [showEngagementSelect, setShowEngagementSelect] = useState(false)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch org settings for multi-engagement flag
        const { data: orgData } = await supabase
          .from('organizations')
          .select('allow_multi_engagement')
          .eq('id', profile.organization_id)
          .single()

        setAllowMultiEngagement(orgData?.allow_multi_engagement ?? false)

        const { data: moData } = await supabase
          .from('mentee_offerings')
          .select('*, offering:offerings(*)')
          .eq('mentee_id', mentee.id)
          .in('status', ['active', 'completed'])
          .order('assigned_at', { ascending: false })

        const menteeOfferings = (moData ?? []) as (MenteeOffering & { offering: Offering })[]

        const courseOfferingIds = menteeOfferings
          .filter(mo => mo.offering?.type === 'course')
          .map(mo => mo.offering_id)

        const lessonCounts: Record<string, number> = {}
        if (courseOfferingIds.length > 0) {
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('offering_id')
            .in('offering_id', courseOfferingIds)

          if (lessonsData) {
            for (const l of lessonsData) {
              lessonCounts[l.offering_id] = (lessonCounts[l.offering_id] || 0) + 1
            }
          }
        }

        const enriched: MenteeOfferingWithDetails[] = menteeOfferings.map(mo => ({
          ...mo,
          lesson_count: lessonCounts[mo.offering_id] ?? 0,
        }))
        setAssignments(enriched)

        const { data: allOfferings } = await supabase
          .from('offerings')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('name')

        const offerings = (allOfferings ?? []) as Offering[]
        const assignedIds = new Set(menteeOfferings.filter(mo => mo.status === 'active').map(mo => mo.offering_id))

        setAvailableCourses(offerings.filter(o => o.type === 'course' && !assignedIds.has(o.id)))
        setAvailableEngagements(offerings.filter(o => o.type === 'engagement' && !assignedIds.has(o.id)))
      } catch (err) {
        console.error('[MenteeManageSlideOver] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [mentee.id, profile.organization_id])

  async function assignOffering(offeringId: string) {
    setAssigning(true)
    setMsg(null)
    try {
      const { data: insertedArr, error: insertErr } = await supabase
        .from('mentee_offerings')
        .insert({
          organization_id: profile.organization_id,
          mentee_id: mentee.id,
          offering_id: offeringId,
          assigned_by: profile.id,
        })
        .select('id')

      if (insertErr) { setMsg({ type: 'error', text: insertErr.message }); return }
      const insertedId = insertedArr?.[0]?.id

      const { data } = await supabase
        .from('mentee_offerings')
        .select('*, offering:offerings(*)')
        .eq('id', insertedId)
        .single()

      const newMo = (data ?? { id: insertedId, mentee_id: mentee.id, offering_id: offeringId, organization_id: profile.organization_id, assigned_by: profile.id, status: 'active', sessions_used: 0, assigned_at: new Date().toISOString(), started_at: null, completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) as MenteeOffering & { offering: Offering }

      let lessonCount = 0
      if (newMo.offering?.type === 'course') {
        const { count } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('offering_id', offeringId)
        lessonCount = count ?? 0
      }

      setAssignments(prev => [{ ...newMo, lesson_count: lessonCount }, ...prev])

      if (newMo.offering?.type === 'course') {
        setAvailableCourses(prev => prev.filter(o => o.id !== offeringId))
      } else {
        setAvailableEngagements(prev => prev.filter(o => o.id !== offeringId))
      }

      const offering = newMo.offering
      setMsg({ type: 'success', text: `${offering?.type === 'course' ? 'Course assigned' : 'Engagement opened'} successfully.` })
      setShowCourseSelect(false)
      setShowEngagementSelect(false)

      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'created',
        entity_type: 'mentee_offering',
        entity_id: newMo.id,
        details: {
          mentee: `${mentee.first_name} ${mentee.last_name}`,
          offering: offering?.name,
          type: offering?.type,
        },
      })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Failed to assign' })
      console.error(err)
    } finally {
      setAssigning(false)
    }
  }

  const activeCourses = assignments.filter(a => a.offering?.type === 'course' && a.status === 'active')
  const completedCourses = assignments.filter(a => a.offering?.type === 'course' && a.status === 'completed')
  const activeEngagements = assignments.filter(a => a.offering?.type === 'engagement' && a.status === 'active')
  const completedEngagements = assignments.filter(a => a.offering?.type === 'engagement' && a.status === 'completed')

  // Engagement open button logic
  const hasActiveEngagement = activeEngagements.length > 0
  const canOpenEngagement = availableEngagements.length > 0 && (!hasActiveEngagement || allowMultiEngagement)
  const showOpenButtonDisabled = availableEngagements.length > 0 && hasActiveEngagement && !allowMultiEngagement

  const selectClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 bottom-0 z-50 w-[calc(100%-14rem)] bg-gray-50 shadow-2xl border-l border-gray-200 flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
              {mentee.first_name[0]}{mentee.last_name[0]}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {mentee.first_name} {mentee.last_name}
              </h2>
              <p className="text-xs text-gray-500">{mentee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { onClose(); navigate(`/mentees/${mentee.id}/edit`) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
              Edit Profile
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status message */}
        {msg && (
          <div className={`shrink-0 px-6 py-2.5 text-sm flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <span>{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {msg.text}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="text-sm text-gray-400 text-center py-12">Loading...</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-md border border-gray-200/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Active Courses</p>
                  <p className="text-2xl font-bold text-gray-900">{activeCourses.length}</p>
                </div>
                <div className="bg-white rounded-md border border-gray-200/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Open Engagements</p>
                  <p className="text-2xl font-bold text-gray-900">{activeEngagements.length}</p>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-2 gap-5">
                {/* Courses column */}
                <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Courses</h3>
                      <p className="text-[11px] text-gray-400">{activeCourses.length} active, {completedCourses.length} completed</p>
                    </div>
                    {availableCourses.length > 0 && (
                      <button
                        onClick={() => { setShowCourseSelect(!showCourseSelect); setShowEngagementSelect(false) }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand border border-brand/30 rounded hover:bg-brand-light transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Assign
                      </button>
                    )}
                  </div>

                  <div className="px-4 py-3">
                    {showCourseSelect && (
                      <div className="mb-3">
                        <select className={selectClass} value="" disabled={assigning} onChange={e => { if (e.target.value) assignOffering(e.target.value) }}>
                          <option value="">Select a course...</option>
                          {availableCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}

                    {activeCourses.length === 0 && completedCourses.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400">No courses assigned.</p>
                        {availableCourses.length > 0 && (
                          <button onClick={() => setShowCourseSelect(true)} className="mt-2 text-xs font-medium text-brand hover:text-brand-hover transition-colors">
                            Assign first course
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {activeCourses.map(a => <CourseCard key={a.id} assignment={a} />)}
                        {completedCourses.length > 0 && activeCourses.length > 0 && (
                          <div className="border-t border-gray-100 pt-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Completed</p>
                          </div>
                        )}
                        {completedCourses.map(a => <CourseCard key={a.id} assignment={a} />)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Engagements column */}
                <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Engagements</h3>
                      <p className="text-[11px] text-gray-400">{activeEngagements.length} active, {completedEngagements.length} completed</p>
                    </div>
                    {canOpenEngagement ? (
                      <button
                        onClick={() => { setShowEngagementSelect(!showEngagementSelect); setShowCourseSelect(false) }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand border border-brand/30 rounded hover:bg-brand-light transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Open
                      </button>
                    ) : showOpenButtonDisabled ? (
                      <span
                        title="Multiple open engagements are disabled for this organization. Enable in Company Settings."
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-300 border border-gray-200 rounded cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Open
                      </span>
                    ) : null}
                  </div>

                  <div className="px-4 py-3">
                    {showEngagementSelect && (
                      <div className="mb-3">
                        <select className={selectClass} value="" disabled={assigning} onChange={e => { if (e.target.value) assignOffering(e.target.value) }}>
                          <option value="">Select an engagement...</option>
                          {availableEngagements.map(eng => <option key={eng.id} value={eng.id}>{eng.name}</option>)}
                        </select>
                      </div>
                    )}

                    {activeEngagements.length === 0 && completedEngagements.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400">No engagements open.</p>
                        {canOpenEngagement && (
                          <button onClick={() => setShowEngagementSelect(true)} className="mt-2 text-xs font-medium text-brand hover:text-brand-hover transition-colors">
                            Open first engagement
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {activeEngagements.map(a => <EngagementCard key={a.id} assignment={a} />)}
                        {completedEngagements.length > 0 && activeEngagements.length > 0 && (
                          <div className="border-t border-gray-100 pt-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Completed</p>
                          </div>
                        )}
                        {completedEngagements.map(a => <EngagementCard key={a.id} assignment={a} />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Sub-components ──

function DonutChart({ value, total, color, size = 56 }: { value: number; total: number; color: string; size?: number }) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = total > 0 ? Math.min(value / total, 1) : 0
  const offset = circumference * (1 - pct)

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      {/* Background track */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      {/* Filled arc */}
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

function CourseCard({ assignment }: { assignment: MenteeOfferingWithDetails }) {
  const offering = assignment.offering
  const totalLessons = assignment.lesson_count ?? 0
  const completedLessons = 0 // Will come from lesson_progress table later
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = assignment.status === 'completed'

  return (
    <div className={`rounded-lg border px-4 py-3.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
          {offering?.name ?? 'Unknown course'}
        </p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
          isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {isCompleted ? 'Completed' : 'Active'}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-500">Progress</span>
            <span className="text-[11px] font-medium text-gray-700 tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : 'bg-brand'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="text-center shrink-0">
          <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">{completedLessons}<span className="text-gray-300">/{totalLessons}</span></p>
          <p className="text-[10px] text-gray-400 mt-0.5">lessons</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-gray-400">
        {assignment.assigned_at && (
          <span>Assigned {new Date(assignment.assigned_at).toLocaleDateString()}</span>
        )}
        {offering?.expected_completion_days && (
          <span>{offering.expected_completion_days}d expected</span>
        )}
      </div>
    </div>
  )
}

function EngagementCard({ assignment }: { assignment: MenteeOfferingWithDetails }) {
  const offering = assignment.offering
  const totalCredits = offering?.meeting_count ?? 0
  const used = assignment.sessions_used
  const remaining = Math.max(0, totalCredits - used)
  const isCompleted = assignment.status === 'completed'
  const period = offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? ' / month' : period === 'weekly' ? ' / week' : ''

  const allocatedColor = '#6366f1' // indigo
  const usedColor = isCompleted ? '#4ade80' : remaining <= 1 ? '#f59e0b' : '#f43f5e' // green / amber / rose

  return (
    <div className={`rounded-lg border px-4 py-3.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
          {offering?.name ?? 'Unknown engagement'}
        </p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
          isCompleted ? 'bg-green-100 text-green-600' : 'bg-rose-50 text-rose-600'
        }`}>
          {isCompleted ? 'Completed' : 'Active'}
        </span>
      </div>

      {totalCredits > 0 ? (
        <div className="flex items-center gap-5">
          {/* Allocated donut */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <DonutChart value={totalCredits} total={totalCredits} color={allocatedColor} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-900 tabular-nums">{totalCredits}</span>
              </div>
            </div>
            <p className="text-[10px] font-medium text-gray-500">Allocated{periodLabel}</p>
          </div>

          {/* Used donut */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <DonutChart value={used} total={totalCredits} color={usedColor} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-900 tabular-nums">{used}</span>
              </div>
            </div>
            <p className="text-[10px] font-medium text-gray-500">Used</p>
          </div>

          {/* Stats */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${remaining <= 1 && !isCompleted ? 'text-amber-600' : 'text-gray-900'}`}>
              {remaining} remaining
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {used} of {totalCredits} sessions used
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Unlimited sessions</p>
      )}

      {assignment.assigned_at && (
        <div className="mt-2.5 pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">
            Opened {new Date(assignment.assigned_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  )
}
