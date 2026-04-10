import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { replaceDynamicFields } from '../lib/dynamicFields'
import type { DynamicFieldContext } from '../lib/dynamicFields'
import type {
  Offering, Lesson, LessonSection, LessonQuestion, MenteeOffering,
  LessonProgress, QuestionResponse, QuizOption,
} from '../types'

interface LessonWithProgress extends Lesson {
  progress: LessonProgress | null
}

export default function MenteeCourseViewerPage() {
  const { id } = useParams<{ id: string }>()
  const { menteeProfile, profile } = useAuth()
  const navigate = useNavigate()

  const [menteeOffering, setMenteeOffering] = useState<MenteeOffering | null>(null)
  const [course, setCourse] = useState<Offering | null>(null)
  const [lessons, setLessons] = useState<LessonWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [sections, setSections] = useState<LessonSection[]>([])
  const [questions, setQuestions] = useState<LessonQuestion[]>([])
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>({})
  const [contentLoading, setContentLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fieldCtx, setFieldCtx] = useState<DynamicFieldContext>({})

  const menteeId = menteeProfile?.id
  const orgId = menteeProfile?.organization_id ?? profile?.organization_id
  const selectedLesson = lessons.find(l => l.id === selectedLessonId) ?? null

  // Fetch course data
  useEffect(() => {
    if (!id || !menteeId) { setLoading(false); return }
    async function fetchData() {
      setLoading(true)
      try {
        const { data: moData, error: moErr } = await supabase
          .from('mentee_offerings').select('*, offering:offerings(*)').eq('id', id!).eq('mentee_id', menteeId!).single()
        if (moErr || !moData) { setError('Course assignment not found.'); return }
        const mo = moData as MenteeOffering & { offering: Offering }
        if (mo.offering?.type !== 'course') { setError('This is not a course.'); return }
        setMenteeOffering(mo)
        setCourse(mo.offering)

        // Build dynamic field context: mentee data + mentor from active pairing
        const ctx: DynamicFieldContext = {
          mentee_first_name: menteeProfile?.first_name,
          mentee_last_name: menteeProfile?.last_name,
          mentee_email: menteeProfile?.email,
          mentee_phone: menteeProfile?.phone ?? undefined,
        }
        const { data: pairingData } = await supabase
          .from('pairings')
          .select('mentor:staff!pairings_mentor_id_fkey(first_name, last_name, email, phone)')
          .eq('mentee_id', menteeId!)
          .eq('status', 'active')
          .limit(1)
          .single()
        if (pairingData?.mentor) {
          const m = pairingData.mentor as unknown as { first_name: string; last_name: string; email: string; phone: string | null }
          ctx.mentor_first_name = m.first_name
          ctx.mentor_last_name = m.last_name
          ctx.mentor_email = m.email
          ctx.mentor_phone = m.phone ?? undefined
        }
        setFieldCtx(ctx)

        const { data: lessonsData } = await supabase.from('lessons').select('*').eq('offering_id', mo.offering_id).order('order_index', { ascending: true })
        const allLessons = (lessonsData ?? []) as Lesson[]

        const { data: progressData } = await supabase.from('lesson_progress').select('*').eq('mentee_offering_id', id!).eq('mentee_id', menteeId!)
        const progressMap: Record<string, LessonProgress> = {}
        if (progressData) for (const p of progressData as LessonProgress[]) progressMap[p.lesson_id] = p

        const enriched = allLessons.map(l => ({ ...l, progress: progressMap[l.id] ?? null }))
        setLessons(enriched)
        const firstIncomplete = enriched.find(l => l.progress?.status !== 'completed')
        setSelectedLessonId(firstIncomplete?.id ?? enriched[0]?.id ?? null)
      } catch (err) {
        setError((err as Error).message || 'Failed to load course')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, menteeId])

  // Fetch sections + questions + responses when lesson changes
  useEffect(() => {
    if (!selectedLessonId || !menteeId || !id) { setSections([]); setQuestions([]); setResponses({}); return }
    async function fetchContent() {
      setContentLoading(true)
      try {
        const [sectRes, qRes, rRes] = await Promise.all([
          supabase.from('lesson_sections').select('*').eq('lesson_id', selectedLessonId!).order('order_index', { ascending: true }),
          supabase.from('lesson_questions').select('*').eq('lesson_id', selectedLessonId!).order('order_index', { ascending: true }),
          supabase.from('question_responses').select('*').eq('lesson_id', selectedLessonId!).eq('mentee_id', menteeId!).eq('mentee_offering_id', id!),
        ])
        setSections((sectRes.data as LessonSection[]) ?? [])
        setQuestions((qRes.data as LessonQuestion[]) ?? [])
        const rMap: Record<string, QuestionResponse> = {}
        if (rRes.data) for (const r of rRes.data as QuestionResponse[]) rMap[r.question_id] = r
        setResponses(rMap)
      } catch (err) { console.error(err) }
      finally { setContentLoading(false) }
    }
    fetchContent()
  }, [selectedLessonId, menteeId, id])

  // Mark lesson as started
  useEffect(() => {
    if (!selectedLesson || !menteeId || !id || !orgId) return
    if (selectedLesson.progress?.status === 'in_progress' || selectedLesson.progress?.status === 'completed') return
    async function markStarted() {
      const now = new Date().toISOString()
      if (selectedLesson!.progress) {
        await supabase.from('lesson_progress').update({ status: 'in_progress', started_at: now, updated_at: now }).eq('id', selectedLesson!.progress!.id)
      } else {
        const { data } = await supabase.from('lesson_progress').insert({
          organization_id: orgId!, mentee_id: menteeId!, mentee_offering_id: id!, lesson_id: selectedLesson!.id, status: 'in_progress', started_at: now,
        }).select().single()
        if (data) setLessons(prev => prev.map(l => l.id === selectedLesson!.id ? { ...l, progress: data as LessonProgress } : l))
      }
    }
    markStarted()
  }, [selectedLessonId])

  // Auto-save response (debounced for text, immediate for quiz)
  const saveResponse = useCallback(async (questionId: string, responseText: string | null, selectedOptionIndex: number | null, isCorrect: boolean | null) => {
    if (!menteeId || !id || !orgId || !selectedLessonId) return
    const existing = responses[questionId]
    const now = new Date().toISOString()
    if (existing) {
      const { error: e } = await supabase.from('question_responses').update({
        response_text: responseText, selected_option_index: selectedOptionIndex, is_correct: isCorrect, answered_at: now,
      }).eq('id', existing.id)
      if (!e) setResponses(prev => ({ ...prev, [questionId]: { ...existing, response_text: responseText, selected_option_index: selectedOptionIndex, is_correct: isCorrect, answered_at: now } }))
    } else {
      const { data, error: e } = await supabase.from('question_responses').insert({
        organization_id: orgId, mentee_id: menteeId, mentee_offering_id: id, lesson_id: selectedLessonId,
        question_id: questionId, response_text: responseText, selected_option_index: selectedOptionIndex, is_correct: isCorrect,
      }).select().single()
      if (data && !e) setResponses(prev => ({ ...prev, [questionId]: data as QuestionResponse }))
    }
  }, [menteeId, id, orgId, selectedLessonId, responses])

  async function completeLesson() {
    if (!selectedLesson || !menteeId || !id || !orgId) return
    setSaving(true); setMsg(null)
    try {
      const now = new Date().toISOString()
      if (selectedLesson.progress) {
        const { error: e } = await supabase.from('lesson_progress').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', selectedLesson.progress.id)
        if (e) { setMsg({ type: 'error', text: e.message }); return }
      } else {
        const { error: e } = await supabase.from('lesson_progress').insert({
          organization_id: orgId, mentee_id: menteeId, mentee_offering_id: id, lesson_id: selectedLesson.id, status: 'completed', started_at: now, completed_at: now,
        })
        if (e) { setMsg({ type: 'error', text: e.message }); return }
      }
      setLessons(prev => prev.map(l => l.id === selectedLesson.id ? { ...l, progress: { ...(l.progress ?? {}), status: 'completed', completed_at: now } as LessonProgress } : l))
      const updatedLessons = lessons.map(l => l.id === selectedLesson.id ? { ...l, progress: { status: 'completed' } } : l)
      if (updatedLessons.every(l => l.progress?.status === 'completed')) {
        await supabase.from('mentee_offerings').update({ status: 'completed', completed_at: now }).eq('id', id)
        setMsg({ type: 'success', text: 'Course completed! All lessons finished.' })
      } else {
        setMsg({ type: 'success', text: 'Lesson completed!' })
        const idx = lessons.findIndex(l => l.id === selectedLesson.id)
        if (lessons[idx + 1]) setTimeout(() => setSelectedLessonId(lessons[idx + 1].id), 800)
      }
    } catch (err) { setMsg({ type: 'error', text: (err as Error).message || 'Failed' }) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>
  if (error || !course || !menteeOffering) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => navigate('/my-courses')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">&larr; Back to My Courses</button>
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">{error || 'Course not found.'}</div>
      </div>
    )
  }

  const completedCount = lessons.filter(l => l.progress?.status === 'completed').length
  const totalCount = lessons.length
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const isLessonCompleted = selectedLesson?.progress?.status === 'completed'

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/my-courses')} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{course.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-gray-500">{completedCount}/{totalCount} lessons completed</p>
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${overallPct}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600 tabular-nums">{overallPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 flex items-start gap-3 rounded border px-3 py-2 text-sm ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>{msg.text}
        </div>
      )}

      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* LEFT: Lesson sidebar */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Lessons</span>
            </div>
            <div className="divide-y divide-gray-50 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {lessons.map((lesson, index) => {
                const status = lesson.progress?.status ?? 'not_started'
                const isSelected = selectedLessonId === lesson.id
                return (
                  <button key={lesson.id} onClick={() => { setSelectedLessonId(lesson.id); setMsg(null) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-brand-light border-l-2 border-brand' : 'hover:bg-gray-50 border-l-2 border-transparent'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold ${
                      status === 'completed' ? 'bg-green-100 text-green-600' : status === 'in_progress' ? 'bg-brand-light text-brand' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {status === 'completed' ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{lesson.title}</p>
                      {status === 'completed' && lesson.progress?.completed_at && (
                        <p className="text-[10px] text-gray-400 truncate">{new Date(lesson.progress.completed_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Lesson content */}
        <div className="flex-1 min-w-0">
          {!selectedLesson ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-16 text-center">
              <p className="text-sm text-gray-400">{lessons.length === 0 ? 'No lessons in this course yet.' : 'Select a lesson to begin.'}</p>
            </div>
          ) : contentLoading ? (
            <div className="text-sm text-gray-400 text-center py-8">Loading lesson...</div>
          ) : (
            <div className="space-y-4">
              {/* Sticky lesson header */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-3 sticky top-0 z-10 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{selectedLesson.title}</h2>
                    {selectedLesson.description && <p className="text-xs text-gray-500 mt-0.5">{selectedLesson.description}</p>}
                  </div>
                  {isLessonCompleted && <span className="text-[10px] font-medium px-2 py-1 rounded bg-green-100 text-green-600 shrink-0">Completed</span>}
                </div>
              </div>

              {/* Legacy content (for lessons without sections) */}
              {sections.length === 0 && selectedLesson.content && (
                <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                  <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: replaceDynamicFields(selectedLesson.content, fieldCtx) }} />
                </div>
              )}
              {sections.length === 0 && selectedLesson.video_url && (
                <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
                  <VideoEmbed url={selectedLesson.video_url} />
                </div>
              )}

              {/* Sections — type-aware rendering */}
              {sections.map(section => {
                const sType = (section as LessonSection & { section_type?: string }).section_type ?? 'text'
                const sectionQuestions = questions.filter(q => q.section_id === section.id)
                const showContent = sType === 'text'
                const showVideo = sType === 'video'
                const showQuestions = sType === 'quiz' || sType === 'response'
                return (
                  <div key={section.id} className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
                    {section.title && (
                      <div className="px-5 pt-5 pb-2">
                        <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                      </div>
                    )}
                    {showVideo && section.video_url && <VideoEmbed url={section.video_url} />}
                    {showContent && section.content && (
                      <div className="px-5 py-4">
                        <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: replaceDynamicFields(section.content, fieldCtx) }} />
                      </div>
                    )}
                    {showQuestions && sectionQuestions.length > 0 && (
                      <div className="px-5 py-5">
                        <div className="space-y-4">
                          {sectionQuestions.map((q, qi) => (
                            <MenteeQuestionCard key={q.id} question={q} index={qi} response={responses[q.id] ?? null}
                              onSave={saveResponse} disabled={isLessonCompleted ?? false} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Legacy lesson-level questions */}
              {questions.filter(q => !q.section_id).length > 0 && (
                <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Questions</h3>
                  <div className="space-y-5">
                    {questions.filter(q => !q.section_id).map((q, qi) => (
                      <MenteeQuestionCard key={q.id} question={q} index={qi} response={responses[q.id] ?? null}
                        onSave={saveResponse} disabled={isLessonCompleted ?? false} />
                    ))}
                  </div>
                </div>
              )}

              {/* Complete lesson */}
              {!isLessonCompleted && (
                <div className="flex items-center gap-3">
                  <button onClick={completeLesson} disabled={saving}
                    className="rounded bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 transition">
                    {saving ? 'Saving...' : 'Complete Lesson'}
                  </button>
                  {questions.length > 0 && Object.keys(responses).length < questions.length && (
                    <p className="text-xs text-amber-600">{questions.length - Object.keys(responses).length} question{questions.length - Object.keys(responses).length !== 1 ? 's' : ''} unanswered</p>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                {(() => {
                  const idx = lessons.findIndex(l => l.id === selectedLessonId)
                  const prev = idx > 0 ? lessons[idx - 1] : null
                  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null
                  return (
                    <>
                      {prev ? (
                        <button onClick={() => { setSelectedLessonId(prev.id); setMsg(null) }} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                          {prev.title}
                        </button>
                      ) : <div />}
                      {next ? (
                        <button onClick={() => { setSelectedLessonId(next.id); setMsg(null) }} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
                          {next.title}
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                      ) : <div />}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Video Embed ──
function VideoEmbed({ url }: { url: string }) {
  let embedUrl = url
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <iframe src={embedUrl} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Lesson video" />
    </div>
  )
}

// ── Mentee Question Card with auto-save ──
function MenteeQuestionCard({ question, index, response, onSave, disabled }: {
  question: LessonQuestion; index: number; response: QuestionResponse | null
  onSave: (questionId: string, responseText: string | null, selectedOptionIndex: number | null, isCorrect: boolean | null) => Promise<void>
  disabled: boolean
}) {
  const isQuiz = question.question_type === 'quiz'
  const options = (question.options ?? []) as QuizOption[]
  const [text, setText] = useState(response?.response_text ?? '')
  const [selectedOption, setSelectedOption] = useState<number | null>(response?.selected_option_index ?? null)
  const [submitted, setSubmitted] = useState(!!response)
  const [showResult, setShowResult] = useState(!!response && isQuiz)
  const [autoSaved, setAutoSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (response) { setText(response.response_text ?? ''); setSelectedOption(response.selected_option_index ?? null); setSubmitted(true); if (isQuiz) setShowResult(true) }
  }, [response?.id])

  // Auto-save text responses with debounce
  function handleTextChange(value: string) {
    setText(value)
    setAutoSaved(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (value.trim()) {
        await onSave(question.id, value.trim(), null, null)
        setSubmitted(true)
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1500)
  }

  async function handleQuizSubmit() {
    if (selectedOption === null) return
    const correct = options[selectedOption]?.is_correct ?? false
    await onSave(question.id, null, selectedOption, correct)
    setShowResult(true)
    setSubmitted(true)
  }

  // Auto-save quiz selection immediately
  async function handleQuizSelect(idx: number) {
    setSelectedOption(idx)
    if (!submitted) return // Only auto-save if they haven't submitted yet — let them click Submit
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-500">Q{index + 1}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isQuiz ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
          {isQuiz ? 'Quiz' : 'Response'}
        </span>
        {submitted && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-600">Answered</span>}
        {autoSaved && <span className="text-[10px] text-gray-400">Auto-saved</span>}
      </div>
      <p className="text-sm text-gray-800 mb-3">{question.question_text}</p>

      {isQuiz ? (
        <div className="space-y-2">
          {options.map((opt, oi) => {
            const isSelected = selectedOption === oi
            const showCorrect = showResult && opt.is_correct
            const showWrong = showResult && isSelected && !opt.is_correct
            return (
              <button key={oi} type="button" disabled={disabled || (submitted && showResult)}
                onClick={() => handleQuizSelect(oi)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left text-sm transition-all ${
                  showCorrect ? 'border-green-300 bg-green-50 text-green-800' : showWrong ? 'border-red-300 bg-red-50 text-red-800'
                  : isSelected ? 'border-brand bg-brand-light text-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                } disabled:cursor-default`}>
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  showCorrect ? 'border-green-500 bg-green-500' : showWrong ? 'border-red-500 bg-red-500' : isSelected ? 'border-brand bg-brand' : 'border-gray-300'
                }`}>
                  {(showCorrect || (isSelected && !showResult)) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                  {showWrong && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                </div>
                <span>{opt.text}</span>
              </button>
            )
          })}
          {!submitted && !disabled && (
            <button onClick={handleQuizSubmit} disabled={selectedOption === null}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-50 transition-colors">
              Submit Answer
            </button>
          )}
        </div>
      ) : (
        <div>
          <textarea rows={3} value={text} onChange={e => handleTextChange(e.target.value)} disabled={disabled}
            placeholder="Type your response..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition resize-none disabled:bg-gray-50 disabled:text-gray-500" />
          <p className="text-[10px] text-gray-400 mt-1">Your response is saved automatically as you type.</p>
        </div>
      )}
    </div>
  )
}
