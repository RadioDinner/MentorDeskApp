import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee, Offering, MenteeOffering, StaffMember, LessonProgress, QuestionResponse, Lesson, LessonQuestion, EngagementSession, AllocationPeriod } from '../types'

interface Props {
  mentee: Mentee
  profile: StaffMember
  onClose: () => void
}

interface MenteeOfferingWithDetails extends MenteeOffering {
  offering?: Offering
  lesson_count?: number
  completed_lessons?: number
}

export default function MenteeManageSlideOver({ mentee, profile, onClose }: Props) {
  const navigate = useNavigate()

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

        // Fetch completed lesson counts from lesson_progress
        const courseMoIds = menteeOfferings
          .filter(mo => mo.offering?.type === 'course')
          .map(mo => mo.id)
        const completedCounts: Record<string, number> = {}
        if (courseMoIds.length > 0) {
          const { data: progressData } = await supabase
            .from('lesson_progress')
            .select('mentee_offering_id')
            .in('mentee_offering_id', courseMoIds)
            .eq('status', 'completed')

          if (progressData) {
            for (const p of progressData) {
              completedCounts[p.mentee_offering_id] = (completedCounts[p.mentee_offering_id] || 0) + 1
            }
          }
        }

        const enriched: MenteeOfferingWithDetails[] = menteeOfferings.map(mo => ({
          ...mo,
          lesson_count: lessonCounts[mo.offering_id] ?? 0,
          completed_lessons: completedCounts[mo.id] ?? 0,
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
      // Find the offering template to copy pricing/settings
      const allOfferings = [...availableCourses, ...availableEngagements]
      const template = allOfferings.find(o => o.id === offeringId)

      const { data: insertedArr, error: insertErr } = await supabase
        .from('mentee_offerings')
        .insert({
          organization_id: profile.organization_id,
          mentee_id: mentee.id,
          offering_id: offeringId,
          assigned_by: profile.id,
          recurring_price_cents: template?.recurring_price_cents ?? 0,
          setup_fee_cents: template?.setup_fee_cents ?? 0,
          meeting_count: template?.meeting_count ?? null,
          allocation_period: template?.allocation_period ?? 'monthly',
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

  async function updateAssignment(assignmentId: string, updates: Record<string, unknown>) {
    const { error } = await supabase
      .from('mentee_offerings')
      .update(updates)
      .eq('id', assignmentId)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, ...updates } as MenteeOfferingWithDetails : a))
    setMsg({ type: 'success', text: 'Updated.' })
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
    <div
      className="bg-gray-50 rounded-lg border border-gray-200 flex flex-col overflow-hidden"
      style={{ minHeight: 'calc(100vh - 100px)' }}
    >
      {/* Header */}
      <div className="shrink-0 px-5 py-3.5 bg-white border-b border-gray-200 flex items-center justify-between">
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
                        {activeEngagements.map(a => <EngagementCard key={a.id} assignment={a} onUpdate={updateAssignment} profile={profile} mentee={mentee} />)}
                        {completedEngagements.length > 0 && activeEngagements.length > 0 && (
                          <div className="border-t border-gray-100 pt-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Completed</p>
                          </div>
                        )}
                        {completedEngagements.map(a => <EngagementCard key={a.id} assignment={a} onUpdate={updateAssignment} profile={profile} mentee={mentee} />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
    </div>
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
  const completedLessons = assignment.completed_lessons ?? 0
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = assignment.status === 'completed'

  const [expanded, setExpanded] = useState(false)
  const [lessonDetails, setLessonDetails] = useState<(Lesson & { progress: LessonProgress | null; responses: (QuestionResponse & { question: LessonQuestion })[] })[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  async function loadDetails() {
    if (lessonDetails.length > 0) { setExpanded(!expanded); return }
    setExpanded(true)
    setDetailLoading(true)
    try {
      // First fetch lessons and progress + responses in parallel
      const [lessonsRes, progressRes, responsesRes] = await Promise.all([
        supabase.from('lessons').select('*').eq('offering_id', assignment.offering_id).order('order_index', { ascending: true }),
        supabase.from('lesson_progress').select('*').eq('mentee_offering_id', assignment.id),
        supabase.from('question_responses').select('*').eq('mentee_offering_id', assignment.id),
      ])

      const lessons = (lessonsRes.data ?? []) as Lesson[]
      const progressMap: Record<string, LessonProgress> = {}
      for (const p of (progressRes.data ?? []) as LessonProgress[]) {
        progressMap[p.lesson_id] = p
      }

      // Now fetch questions by lesson IDs
      const lessonIds = lessons.map(l => l.id)
      const questionsByLesson: Record<string, LessonQuestion[]> = {}
      if (lessonIds.length > 0) {
        const { data: questionsData } = await supabase
          .from('lesson_questions')
          .select('*')
          .in('lesson_id', lessonIds)
          .order('order_index', { ascending: true })

        for (const q of (questionsData ?? []) as LessonQuestion[]) {
          if (!questionsByLesson[q.lesson_id]) questionsByLesson[q.lesson_id] = []
          questionsByLesson[q.lesson_id].push(q)
        }
      }

      // Build response map by question_id
      const responsesByQuestion: Record<string, QuestionResponse> = {}
      for (const r of (responsesRes.data ?? []) as QuestionResponse[]) {
        responsesByQuestion[r.question_id] = r
      }

      setLessonDetails(lessons.map(l => ({
        ...l,
        progress: progressMap[l.id] ?? null,
        responses: (questionsByLesson[l.id] ?? []).map(q => ({
          ...(responsesByQuestion[q.id] ?? { id: '', organization_id: '', mentee_id: '', mentee_offering_id: '', lesson_id: l.id, question_id: q.id, response_text: null, selected_option_index: null, is_correct: null, answered_at: '', created_at: '' } as QuestionResponse),
          question: q,
        })),
      })))
    } catch (err) {
      console.error('[CourseCard] loadDetails error:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className={`rounded-lg border ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
            {offering?.name ?? 'Unknown course'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={loadDetails}
              className="text-[10px] text-gray-400 hover:text-brand transition-colors"
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {isCompleted ? 'Completed' : 'Active'}
            </span>
          </div>
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

      {/* Expanded detail view */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {detailLoading ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading lesson details...</p>
          ) : lessonDetails.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No lessons in this course yet.</p>
          ) : (
            <div className="space-y-1.5">
              {lessonDetails.map((lesson, idx) => {
                const status = lesson.progress?.status ?? 'not_started'
                const hasResponses = lesson.responses.some(r => r.answered_at)
                return (
                  <LessonDetailRow
                    key={lesson.id}
                    lesson={lesson}
                    index={idx}
                    status={status}
                    hasResponses={hasResponses}
                    responses={lesson.responses}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LessonDetailRow({
  lesson,
  index,
  status,
  hasResponses,
  responses,
}: {
  lesson: Lesson & { progress: LessonProgress | null }
  index: number
  status: string
  hasResponses: boolean
  responses: (QuestionResponse & { question: LessonQuestion })[]
}) {
  const [showResponses, setShowResponses] = useState(false)

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-semibold ${
          status === 'completed'
            ? 'bg-green-100 text-green-600'
            : status === 'in_progress'
              ? 'bg-brand-light text-brand'
              : 'bg-gray-100 text-gray-400'
        }`}>
          {status === 'completed' ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            index + 1
          )}
        </div>
        <p className={`text-xs flex-1 truncate ${status === 'completed' ? 'text-gray-500' : 'text-gray-700'}`}>
          {lesson.title}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {lesson.progress?.completed_at && (
            <span className="text-[9px] text-gray-400">
              {new Date(lesson.progress.completed_at).toLocaleDateString()}
            </span>
          )}
          {hasResponses && (
            <button
              onClick={() => setShowResponses(!showResponses)}
              className="text-[9px] text-brand hover:text-brand-hover transition-colors"
            >
              {showResponses ? 'Hide' : 'Responses'}
            </button>
          )}
        </div>
      </div>

      {showResponses && responses.length > 0 && (
        <div className="ml-7 mb-2 space-y-1.5">
          {responses.map((r) => {
            const q = r.question
            const isQuiz = q.question_type === 'quiz'
            const options = (q.options ?? []) as { text: string; is_correct: boolean }[]
            const answered = !!r.answered_at

            return (
              <div key={q.id} className="rounded border border-gray-100 px-3 py-2 bg-gray-50/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                    isQuiz ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {isQuiz ? 'Quiz' : 'Response'}
                  </span>
                  {answered && isQuiz && (
                    <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                      r.is_correct ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {r.is_correct ? 'Correct' : 'Incorrect'}
                    </span>
                  )}
                  {!answered && (
                    <span className="text-[9px] text-gray-400">Not answered</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-700 mb-1">{q.question_text || 'No question text'}</p>
                {answered && isQuiz && r.selected_option_index != null && (
                  <p className="text-[10px] text-gray-500">
                    Selected: {options[r.selected_option_index]?.text ?? `Option ${r.selected_option_index + 1}`}
                  </p>
                )}
                {answered && !isQuiz && r.response_text && (
                  <p className="text-[10px] text-gray-500 italic">{r.response_text}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EngagementCard({ assignment, onUpdate, profile, mentee }: { assignment: MenteeOfferingWithDetails; onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>; profile: StaffMember; mentee: Mentee }) {
  const offering = assignment.offering
  const isCompleted = assignment.status === 'completed'
  const period = assignment.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? ' / month' : period === 'weekly' ? ' / week' : ''
  const priceCents = assignment.recurring_price_cents ?? offering?.recurring_price_cents ?? 0
  const priceDisplay = (priceCents / 100).toFixed(2)

  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  // Session log state
  const [sessions, setSessions] = useState<EngagementSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [logNotes, setLogNotes] = useState('')
  const [logging, setLogging] = useState(false)

  // Edit state
  const [editPrice, setEditPrice] = useState(priceDisplay)
  const [editMeetings, setEditMeetings] = useState(assignment.meeting_count ? String(assignment.meeting_count) : '')
  const [editSetupFee, setEditSetupFee] = useState(((assignment.setup_fee_cents ?? 0) / 100).toFixed(2))
  const [editPeriod, setEditPeriod] = useState<AllocationPeriod>(period)
  const [editNotes, setEditNotes] = useState(assignment.notes ?? '')
  const [editEndsAt, setEditEndsAt] = useState(assignment.ends_at ? assignment.ends_at.slice(0, 10) : '')
  const [editIndefinite, setEditIndefinite] = useState(!assignment.ends_at)
  const [saving, setSaving] = useState(false)

  // Compute used from actual session logs (falls back to sessions_used if not loaded)
  const used = sessionsLoaded ? sessions.length : assignment.sessions_used
  const totalCredits = assignment.meeting_count ?? offering?.meeting_count ?? 0
  const remaining = Math.max(0, totalCredits - used)

  const allocatedColor = '#6366f1'
  const usedColor = isCompleted ? '#4ade80' : remaining <= 1 ? '#f59e0b' : '#f43f5e'

  async function loadSessions() {
    if (sessionsLoaded) return
    setSessionsLoading(true)
    try {
      const { data } = await supabase
        .from('engagement_sessions')
        .select('*')
        .eq('mentee_offering_id', assignment.id)
        .order('session_date', { ascending: false })
      setSessions((data ?? []) as EngagementSession[])
      setSessionsLoaded(true)
    } catch (err) {
      console.error('[EngagementCard] loadSessions error:', err)
    } finally {
      setSessionsLoading(false)
    }
  }

  async function handleExpand() {
    if (!expanded) {
      setExpanded(true)
      loadSessions()
    } else {
      setExpanded(false)
    }
  }

  async function logSession() {
    if (!logDate) return
    setLogging(true)
    try {
      const { data, error } = await supabase
        .from('engagement_sessions')
        .insert({
          organization_id: profile.organization_id,
          mentee_offering_id: assignment.id,
          mentee_id: mentee.id,
          logged_by: profile.id,
          session_date: logDate,
          notes: logNotes.trim() || null,
        })
        .select()
        .single()

      if (error) { console.error('[EngagementCard] logSession error:', error); return }

      const newSession = data as EngagementSession
      setSessions(prev => [newSession, ...prev])
      setLogNotes('')
      setLogDate(new Date().toISOString().slice(0, 10))

      // Sync sessions_used on the mentee_offering
      await supabase
        .from('mentee_offerings')
        .update({ sessions_used: sessions.length + 1 })
        .eq('id', assignment.id)

      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'created',
        entity_type: 'mentee_offering',
        entity_id: assignment.id,
        details: { sub: 'session_logged', date: logDate, mentee: `${mentee.first_name} ${mentee.last_name}` },
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLogging(false)
    }
  }

  async function deleteSession(sessionId: string) {
    const { error } = await supabase
      .from('engagement_sessions')
      .delete()
      .eq('id', sessionId)
    if (error) { console.error('[EngagementCard] deleteSession error:', error); return }
    const updated = sessions.filter(s => s.id !== sessionId)
    setSessions(updated)
    // Sync sessions_used
    await supabase
      .from('mentee_offerings')
      .update({ sessions_used: updated.length })
      .eq('id', assignment.id)
  }

  async function handleSave() {
    setSaving(true)
    await onUpdate(assignment.id, {
      recurring_price_cents: editPrice ? Math.round(parseFloat(editPrice) * 100) : 0,
      setup_fee_cents: editSetupFee ? Math.round(parseFloat(editSetupFee) * 100) : 0,
      meeting_count: editMeetings ? parseInt(editMeetings) : null,
      allocation_period: editPeriod,
      notes: editNotes.trim() || null,
      ends_at: editIndefinite ? null : (editEndsAt || null),
    })
    setSaving(false)
    setEditing(false)
  }

  const inputClass = 'w-full rounded border border-gray-300 pl-7 pr-2 py-1 text-xs text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20'
  const numInputClass = 'w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20'

  return (
    <div className={`rounded-lg border ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      {/* Summary header */}
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
            {offering?.name ?? 'Unknown engagement'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isCompleted && (
              <button onClick={handleExpand} className="text-[10px] text-gray-400 hover:text-brand transition-colors">
                {expanded ? 'Collapse' : 'Manage'}
              </button>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isCompleted ? 'bg-green-100 text-green-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {isCompleted ? 'Completed' : 'Active'}
            </span>
          </div>
        </div>

        {/* Credit donut charts */}
        {totalCredits > 0 ? (
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <DonutChart value={totalCredits} total={totalCredits} color={allocatedColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{totalCredits}</span>
                </div>
              </div>
              <p className="text-[10px] font-medium text-gray-500">Allocated{periodLabel}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <DonutChart value={used} total={totalCredits} color={usedColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{used}</span>
                </div>
              </div>
              <p className="text-[10px] font-medium text-gray-500">Used</p>
            </div>
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

        {/* Summary footer */}
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
          {priceCents > 0 && <span>${priceDisplay}{periodLabel}</span>}
          {(assignment.setup_fee_cents ?? 0) > 0 && <span>${((assignment.setup_fee_cents ?? 0) / 100).toFixed(2)} setup</span>}
          {assignment.assigned_at && <span>Opened {new Date(assignment.assigned_at).toLocaleDateString()}</span>}
          {assignment.ends_at && <span>Ends {new Date(assignment.ends_at).toLocaleDateString()}</span>}
          {!assignment.ends_at && !isCompleted && <span>Indefinite</span>}
        </div>
      </div>

      {/* Expanded management view */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Log a session */}
          <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Log a Session</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-gray-500 mb-0.5">Date</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className={numInputClass}
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-[10px] text-gray-500 mb-0.5">Notes (optional)</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                  placeholder="e.g., Covered resume review"
                  className={numInputClass}
                />
              </div>
              <button
                onClick={logSession}
                disabled={logging || !logDate}
                className="px-3 py-1 text-[10px] font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-50 transition-colors shrink-0"
              >
                {logging ? '...' : '+ Log'}
              </button>
            </div>
          </div>

          {/* Session history */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Session History ({sessionsLoaded ? sessions.length : assignment.sessions_used})
            </p>
            {sessionsLoading ? (
              <p className="text-[10px] text-gray-400 py-2">Loading...</p>
            ) : sessions.length === 0 ? (
              <p className="text-[10px] text-gray-400 py-2">No sessions logged yet.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-1 group">
                    <span className="text-[10px] font-medium text-gray-600 tabular-nums w-20 shrink-0">
                      {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[10px] text-gray-500 flex-1 truncate">
                      {s.notes || '—'}
                    </span>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-red-500 transition-all shrink-0"
                      title="Remove session"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="px-4 py-3">
            {editing ? (
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Engagement Settings</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Recurring price</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">$</span>
                      <input type="number" step="0.01" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Setup fee</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">$</span>
                      <input type="number" step="0.01" min="0" value={editSetupFee} onChange={e => setEditSetupFee(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Sessions per cycle</label>
                    <input type="number" min="1" value={editMeetings} onChange={e => setEditMeetings(e.target.value)} placeholder="Unlimited" className={numInputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Allocation period</label>
                    <select
                      value={editPeriod}
                      onChange={e => setEditPeriod(e.target.value as AllocationPeriod)}
                      className={numInputClass}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="per_cycle">Per Cycle</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">End date</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIndefinite}
                        onChange={e => { setEditIndefinite(e.target.checked); if (e.target.checked) setEditEndsAt('') }}
                        className="rounded border-gray-300 text-brand focus:ring-brand/20"
                      />
                      Runs indefinitely
                    </label>
                    {!editIndefinite && (
                      <input
                        type="date"
                        value={editEndsAt}
                        onChange={e => setEditEndsAt(e.target.value)}
                        className={numInputClass + ' max-w-36'}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Internal notes about this mentee's engagement..."
                    className={numInputClass + ' resize-none'}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={handleSave} disabled={saving} className="px-2.5 py-1 text-[10px] font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-50 transition-colors">
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Settings</p>
                  <button onClick={() => setEditing(true)} className="text-[10px] text-gray-400 hover:text-brand transition-colors">
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Price</span>
                    <span className="text-gray-700 font-medium">{priceCents > 0 ? `$${priceDisplay}${periodLabel}` : 'Free'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Setup fee</span>
                    <span className="text-gray-700 font-medium">{(assignment.setup_fee_cents ?? 0) > 0 ? `$${((assignment.setup_fee_cents ?? 0) / 100).toFixed(2)}` : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sessions</span>
                    <span className="text-gray-700 font-medium">{totalCredits > 0 ? `${totalCredits} / ${editPeriod === 'monthly' ? 'month' : editPeriod === 'weekly' ? 'week' : 'cycle'}` : 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Ends</span>
                    <span className="text-gray-700 font-medium">{assignment.ends_at ? new Date(assignment.ends_at).toLocaleDateString() : 'Indefinite'}</span>
                  </div>
                </div>
                {assignment.notes && (
                  <p className="mt-2 text-[10px] text-gray-500 italic">{assignment.notes}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
