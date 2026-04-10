import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import EngagementManageModal from './EngagementManageModal'
import type { Mentee, Offering, MenteeOffering, StaffMember, LessonProgress, QuestionResponse, Lesson, LessonQuestion, FlowStep } from '../types'

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
  const [allEngagements, setAllEngagements] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [allowMultiEngagement, setAllowMultiEngagement] = useState(false)

  const [showCourseSelect, setShowCourseSelect] = useState(false)
  const [showEngagementSelect, setShowEngagementSelect] = useState(false)
  const [managingEngagementId, setManagingEngagementId] = useState<string | null>(null)
  const [confirmMultiEngagement, setConfirmMultiEngagement] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setMsg({ type: 'error', text: 'Request timed out. Please try again.' })
  }, []))

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Fetch data — parallelized to minimize total wait time
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Round 1: Fire all independent queries in parallel
        const [orgRes, moRes, offeringsRes] = await Promise.all([
          supabase.from('organizations').select('allow_multi_engagement').eq('id', profile.organization_id).single(),
          supabase.from('mentee_offerings').select('*, offering:offerings(*)').eq('mentee_id', mentee.id).in('status', ['active', 'completed']).order('assigned_at', { ascending: false }),
          supabase.from('offerings').select('*').eq('organization_id', profile.organization_id).order('name'),
        ])

        setAllowMultiEngagement(orgRes.data?.allow_multi_engagement ?? false)

        const menteeOfferings = (moRes.data ?? []) as (MenteeOffering & { offering: Offering })[]
        const offerings = (offeringsRes.data ?? []) as Offering[]
        const assignedIds = new Set(menteeOfferings.filter(mo => mo.status === 'active').map(mo => mo.offering_id))
        const allEngs = offerings.filter(o => o.type === 'engagement')
        setAllEngagements(allEngs)
        setAvailableCourses(offerings.filter(o => o.type === 'course' && !assignedIds.has(o.id)))
        setAvailableEngagements(allEngs)

        // Round 2: Fetch lesson counts + progress in parallel (depends on round 1 IDs)
        const courseOfferingIds = menteeOfferings.filter(mo => mo.offering?.type === 'course').map(mo => mo.offering_id)
        const courseMoIds = menteeOfferings.filter(mo => mo.offering?.type === 'course').map(mo => mo.id)

        const [lessonsRes, progressRes] = await Promise.all([
          courseOfferingIds.length > 0
            ? supabase.from('lessons').select('offering_id').in('offering_id', courseOfferingIds)
            : Promise.resolve({ data: [] }),
          courseMoIds.length > 0
            ? supabase.from('lesson_progress').select('mentee_offering_id').in('mentee_offering_id', courseMoIds).eq('status', 'completed')
            : Promise.resolve({ data: [] }),
        ])

        const lessonCounts: Record<string, number> = {}
        if (lessonsRes.data) for (const l of lessonsRes.data as { offering_id: string }[]) lessonCounts[l.offering_id] = (lessonCounts[l.offering_id] || 0) + 1

        const completedCounts: Record<string, number> = {}
        if (progressRes.data) for (const p of progressRes.data as { mentee_offering_id: string }[]) completedCounts[p.mentee_offering_id] = (completedCounts[p.mentee_offering_id] || 0) + 1

        setAssignments(menteeOfferings.map(mo => ({
          ...mo,
          lesson_count: lessonCounts[mo.offering_id] ?? 0,
          completed_lessons: completedCounts[mo.id] ?? 0,
        })))
      } catch (err) {
        console.error('[MenteeManageSlideOver] fetch error:', err)
        setMsg({ type: 'error', text: 'Failed to load data. Please try again.' })
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

      // Update mentee flow step if the offering is part of the active mentee flow
      try {
        const { data: orgFlow } = await supabase
          .from('organizations')
          .select('mentee_flow')
          .eq('id', profile.organization_id)
          .single()
        if (orgFlow?.mentee_flow) {
          const steps = ((orgFlow.mentee_flow as { steps: FlowStep[] }).steps ?? [])
          const matchingStep = steps.find(s => s.in_flow && s.offering_id === offeringId)
          if (matchingStep) {
            await supabase.from('mentees').update({ flow_step_id: matchingStep.id }).eq('id', mentee.id)
          }
        }
      } catch (err) {
        console.error('[MenteeManageSlideOver] flow step update error:', err)
      }

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
  const engagementBlocked = hasActiveEngagement && !allowMultiEngagement

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
                    {allEngagements.length > 0 && (
                      engagementBlocked ? (
                        <span
                          title="Simultaneous engagements disabled per company settings. Contact your admin to have this changed."
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-300 border border-gray-200 rounded cursor-not-allowed"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Assign
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            if (hasActiveEngagement) {
                              setConfirmMultiEngagement(true)
                            } else {
                              setShowEngagementSelect(!showEngagementSelect); setShowCourseSelect(false)
                            }
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand border border-brand/30 rounded hover:bg-brand-light transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Assign
                        </button>
                      )
                    )}
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
                        {availableEngagements.length > 0 && (
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

        {/* Confirmation dialog: open engagement when one is already active */}
        {confirmMultiEngagement && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20 rounded-lg">
            <div className="bg-white rounded-lg border border-gray-200 shadow-xl px-6 py-5 max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Open another engagement?</h3>
              <p className="text-xs text-gray-500 mb-4">
                This mentee already has {activeEngagements.length} active engagement{activeEngagements.length !== 1 ? 's' : ''}. Are you sure you want to open an additional engagement?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmMultiEngagement(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirmMultiEngagement(false); setShowEngagementSelect(true); setShowCourseSelect(false) }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition-colors"
                >
                  Yes, open engagement
                </button>
              </div>
            </div>
          </div>
        )}

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
              {/* Overall quiz grade summary */}
              {(() => {
                const allQuizResponses = lessonDetails.flatMap(l => l.responses.filter(r => r.question.question_type === 'quiz' && r.answered_at))
                const totalQ = allQuizResponses.length
                const correctQ = allQuizResponses.filter(r => r.is_correct).length
                if (totalQ === 0) return null
                const pctGrade = Math.round((correctQ / totalQ) * 100)
                const color = pctGrade >= 90 ? 'text-green-700 bg-green-50 border-green-200' : pctGrade >= 70 ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-red-700 bg-red-50 border-red-200'
                return (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-md border mb-1 ${color}`}>
                    <span className="text-[11px] font-medium">Quiz Grade</span>
                    <span className="text-[11px] font-bold tabular-nums">{correctQ}/{totalQ} correct ({pctGrade}%)</span>
                  </div>
                )
              })()}
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

  // Compute quiz grade
  const quizResponses = responses.filter(r => r.question.question_type === 'quiz' && r.answered_at)
  const totalQuiz = quizResponses.length
  const correctQuiz = quizResponses.filter(r => r.is_correct).length
  const totalQuestions = responses.length
  const answeredQuestions = responses.filter(r => r.answered_at).length
  const gradeColor = totalQuiz > 0
    ? correctQuiz === totalQuiz ? 'text-green-600 bg-green-50' : correctQuiz >= totalQuiz * 0.7 ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'
    : ''

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
          {/* Quiz grade badge */}
          {totalQuiz > 0 && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${gradeColor}`}>
              {correctQuiz}/{totalQuiz}
            </span>
          )}
          {/* Question count */}
          {totalQuestions > 0 && totalQuiz === 0 && (
            <span className="text-[9px] text-gray-400 tabular-nums">{answeredQuestions}/{totalQuestions} Q</span>
          )}
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
