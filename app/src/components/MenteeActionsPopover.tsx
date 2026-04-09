import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee, Offering, MenteeOffering, StaffMember } from '../types'

interface Props {
  mentee: Mentee
  profile: StaffMember
  onClose: () => void
  anchorRef: HTMLElement | null
}

interface MenteeOfferingWithDetails extends MenteeOffering {
  offering?: Offering
  lesson_count?: number
}

export default function MenteeActionsPopover({ mentee, profile, onClose, anchorRef }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  const [assignments, setAssignments] = useState<MenteeOfferingWithDetails[]>([])
  const [availableCourses, setAvailableCourses] = useState<Offering[]>([])
  const [availableEngagements, setAvailableEngagements] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dropdowns
  const [showCourseSelect, setShowCourseSelect] = useState(false)
  const [showEngagementSelect, setShowEngagementSelect] = useState(false)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef && !anchorRef.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, anchorRef])

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
        // Fetch mentee's current offerings with offering details
        const { data: moData } = await supabase
          .from('mentee_offerings')
          .select('*, offering:offerings(*)')
          .eq('mentee_id', mentee.id)
          .in('status', ['active', 'completed'])
          .order('assigned_at', { ascending: false })

        const menteeOfferings = (moData ?? []) as (MenteeOffering & { offering: Offering })[]

        // For courses, get lesson counts
        const courseOfferingIds = menteeOfferings
          .filter(mo => mo.offering?.type === 'course')
          .map(mo => mo.offering_id)

        let lessonCounts: Record<string, number> = {}
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

        // Fetch all offerings in the org to populate the assign dropdowns
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
        console.error('[MenteeActionsPopover] fetch error:', err)
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
      const { data, error } = await supabase
        .from('mentee_offerings')
        .insert({
          organization_id: profile.organization_id,
          mentee_id: mentee.id,
          offering_id: offeringId,
          assigned_by: profile.id,
        })
        .select('*, offering:offerings(*)')
        .single()

      if (error) {
        setMsg({ type: 'error', text: error.message })
        return
      }

      const newMo = data as MenteeOffering & { offering: Offering }
      // Get lesson count if course
      let lessonCount = 0
      if (newMo.offering?.type === 'course') {
        const { count } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('offering_id', offeringId)
        lessonCount = count ?? 0
      }

      setAssignments(prev => [{ ...newMo, lesson_count: lessonCount }, ...prev])

      // Remove from available list
      if (newMo.offering?.type === 'course') {
        setAvailableCourses(prev => prev.filter(o => o.id !== offeringId))
      } else {
        setAvailableEngagements(prev => prev.filter(o => o.id !== offeringId))
      }

      const offering = newMo.offering
      setMsg({ type: 'success', text: `${offering?.type === 'course' ? 'Course assigned' : 'Engagement opened'}.` })
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

  // Position popover
  const popoverStyle: React.CSSProperties = { position: 'fixed', zIndex: 50 }
  if (anchorRef) {
    const rect = anchorRef.getBoundingClientRect()
    popoverStyle.top = rect.bottom + 6
    popoverStyle.right = window.innerWidth - rect.right
  }

  const activeCourses = assignments.filter(a => a.offering?.type === 'course' && a.status === 'active')
  const completedCourses = assignments.filter(a => a.offering?.type === 'course' && a.status === 'completed')
  const activeEngagements = assignments.filter(a => a.offering?.type === 'engagement' && a.status === 'active')
  const completedEngagements = assignments.filter(a => a.offering?.type === 'engagement' && a.status === 'completed')

  return (
    <div ref={popoverRef} style={popoverStyle} className="w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{mentee.first_name} {mentee.last_name}</p>
          <p className="text-[11px] text-gray-500">Courses &amp; Engagements</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`px-4 py-2 text-xs ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            {/* ── Courses Section ── */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Courses</p>
                {availableCourses.length > 0 && (
                  <button
                    onClick={() => { setShowCourseSelect(!showCourseSelect); setShowEngagementSelect(false) }}
                    className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
                  >
                    + Assign
                  </button>
                )}
              </div>

              {showCourseSelect && (
                <div className="mb-2">
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
                    value=""
                    disabled={assigning}
                    onChange={e => { if (e.target.value) assignOffering(e.target.value) }}
                  >
                    <option value="">Select a course...</option>
                    {availableCourses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeCourses.length === 0 && completedCourses.length === 0 ? (
                <p className="text-xs text-gray-400 pb-2">No courses assigned.</p>
              ) : (
                <div className="space-y-2 pb-2">
                  {activeCourses.map(a => (
                    <CourseCard key={a.id} assignment={a} />
                  ))}
                  {completedCourses.map(a => (
                    <CourseCard key={a.id} assignment={a} />
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Engagements Section ── */}
            <div className="px-4 pt-3 pb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Engagements</p>
                {availableEngagements.length > 0 && (
                  <button
                    onClick={() => { setShowEngagementSelect(!showEngagementSelect); setShowCourseSelect(false) }}
                    className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
                  >
                    + Open
                  </button>
                )}
              </div>

              {showEngagementSelect && (
                <div className="mb-2">
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
                    value=""
                    disabled={assigning}
                    onChange={e => { if (e.target.value) assignOffering(e.target.value) }}
                  >
                    <option value="">Select an engagement...</option>
                    {availableEngagements.map(eng => (
                      <option key={eng.id} value={eng.id}>{eng.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeEngagements.length === 0 && completedEngagements.length === 0 ? (
                <p className="text-xs text-gray-400">No engagements open.</p>
              ) : (
                <div className="space-y-2">
                  {activeEngagements.map(a => (
                    <EngagementCard key={a.id} assignment={a} />
                  ))}
                  {completedEngagements.map(a => (
                    <EngagementCard key={a.id} assignment={a} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function CourseCard({ assignment }: { assignment: MenteeOfferingWithDetails }) {
  const offering = assignment.offering
  const totalLessons = assignment.lesson_count ?? 0
  const completedLessons = 0 // Will come from lesson_progress table later
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = assignment.status === 'completed'

  return (
    <div className={`rounded border px-3 py-2.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className={`text-xs font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
          {offering?.name ?? 'Unknown course'}
        </p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
          isCompleted
            ? 'bg-green-100 text-green-600'
            : 'bg-blue-50 text-blue-600'
        }`}>
          {isCompleted ? 'Completed' : 'Active'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : 'bg-brand'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
          {completedLessons}/{totalLessons} lessons
        </span>
      </div>
    </div>
  )
}

function EngagementCard({ assignment }: { assignment: MenteeOfferingWithDetails }) {
  const offering = assignment.offering
  const totalCredits = offering?.meeting_count ?? 0
  const used = assignment.sessions_used
  const remaining = Math.max(0, totalCredits - used)
  const pct = totalCredits > 0 ? Math.round((used / totalCredits) * 100) : 0
  const isCompleted = assignment.status === 'completed'
  const period = offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/mo' : period === 'weekly' ? '/wk' : ''

  return (
    <div className={`rounded border px-3 py-2.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className={`text-xs font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
          {offering?.name ?? 'Unknown engagement'}
        </p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
          isCompleted
            ? 'bg-green-100 text-green-600'
            : 'bg-rose-50 text-rose-600'
        }`}>
          {isCompleted ? 'Completed' : 'Active'}
        </span>
      </div>
      {totalCredits > 0 ? (
        <>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isCompleted ? 'bg-green-400' : remaining <= 1 ? 'bg-amber-400' : 'bg-rose-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
              {used}/{totalCredits}{periodLabel}
            </span>
          </div>
          <p className="text-[10px] text-gray-400">
            {remaining} session{remaining !== 1 ? 's' : ''} remaining
          </p>
        </>
      ) : (
        <p className="text-[10px] text-gray-400">Unlimited sessions</p>
      )}
    </div>
  )
}
