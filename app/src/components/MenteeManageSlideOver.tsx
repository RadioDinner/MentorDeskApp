import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import EngagementManageModal from './EngagementManageModal'
import type { Mentee, Offering, MenteeOffering, StaffMember, LessonProgress, QuestionResponse, Lesson, LessonQuestion } from '../types'

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
  const [managingEngagementId, setManagingEngagementId] = useState<string | null>(null)

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

      // Auto-create setup fee invoice if applicable
      const setupFee = template?.setup_fee_cents ?? 0
      if (setupFee > 0 && insertedId) {
        await supabase.from('invoices').insert({
          organization_id: profile.organization_id,
          mentee_id: mentee.id,
          mentee_offering_id: insertedId,
          status: 'draft',
          amount_cents: setupFee,
          currency: template?.currency ?? 'USD',
          line_description: `Setup fee — ${offering?.name ?? 'Engagement'}`,
          due_date: new Date().toISOString().slice(0, 10),
        })
      }

      // Auto-send first recurring invoice if engagement template has auto_send_invoice
      const recurringPrice = template?.recurring_price_cents ?? 0
      if (template?.auto_send_invoice && recurringPrice > 0 && insertedId && offering?.type === 'engagement') {
        const startDate = new Date().toISOString().slice(0, 10)
        const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
        await supabase.from('invoices').insert({
          organization_id: profile.organization_id,
          mentee_id: mentee.id,
          mentee_offering_id: insertedId,
          status: 'sent',
          amount_cents: recurringPrice,
          currency: template?.currency ?? 'USD',
          line_description: `${offering?.name ?? 'Engagement'} — ${new Date(startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          due_date: dueDate,
        })
      }
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
                        {activeEngagements.map(a => <EngagementCard key={a.id} assignment={a} onUpdate={updateAssignment} profile={profile} mentee={mentee} onManage={() => setManagingEngagementId(a.id)} />)}
                        {completedEngagements.length > 0 && activeEngagements.length > 0 && (
                          <div className="border-t border-gray-100 pt-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Completed</p>
                          </div>
                        )}
                        {completedEngagements.map(a => <EngagementCard key={a.id} assignment={a} onUpdate={updateAssignment} profile={profile} mentee={mentee} onManage={() => setManagingEngagementId(a.id)} />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Engagement management modal */}
        {managingEngagementId && (() => {
          const eng = assignments.find(a => a.id === managingEngagementId)
          if (!eng) return null
          return (
            <EngagementManageModal
              assignment={eng}
              profile={profile}
              mentee={mentee}
              onClose={() => setManagingEngagementId(null)}
              onUpdate={updateAssignment}
            />
          )
        })()}
    </div>
  )
}

// ── Sub-components ──

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

function EngagementCard({ assignment, onManage }: { assignment: MenteeOfferingWithDetails; onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>; profile: StaffMember; mentee: Mentee; onManage: () => void }) {
  const offering = assignment.offering
  const isCompleted = assignment.status === 'completed'
  const period = assignment.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? ' / month' : period === 'weekly' ? ' / week' : ''
  const priceCents = assignment.recurring_price_cents ?? offering?.recurring_price_cents ?? 0
  const priceDisplay = (priceCents / 100).toFixed(2)

  const totalCredits = assignment.meeting_count ?? offering?.meeting_count ?? 0
  const used = assignment.sessions_used
  const remaining = totalCredits > 0 ? Math.max(0, totalCredits - used) : null

  // Summary card — click "Manage" to open full modal
  return (
    <div className={`rounded-lg border ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
            {offering?.name ?? 'Unknown engagement'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isCompleted && (
              <button onClick={onManage} className="text-[10px] font-medium text-brand hover:text-brand-hover transition-colors">
                Manage
              </button>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
              {isCompleted ? 'Completed' : 'Active'}
            </span>
          </div>
        </div>

        {totalCredits > 0 ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500">{used} of {totalCredits} sessions</span>
                <span className={`text-[11px] font-medium ${(remaining !== null && remaining <= 1) && !isCompleted ? 'text-amber-600' : 'text-gray-700'}`}>
                  {remaining} remaining
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : (remaining !== null && remaining <= 1) ? 'bg-amber-400' : 'bg-brand'}`}
                  style={{ width: `${totalCredits > 0 ? Math.round((used / totalCredits) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Unlimited sessions · {used} completed</p>
        )}

        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
          {priceCents > 0 && <span>${priceDisplay}{periodLabel}</span>}
          {assignment.assigned_at && <span>Opened {new Date(assignment.assigned_at).toLocaleDateString()}</span>}
          {assignment.ends_at ? <span>Ends {new Date(assignment.ends_at).toLocaleDateString()}</span> : !isCompleted && <span>Indefinite</span>}
        </div>
      </div>
    </div>
  )

}
