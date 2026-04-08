import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout, testSupabaseConnectivity, supabaseRestCall } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import RichTextEditor from '../components/RichTextEditor'
import type { Offering, Lesson, LessonQuestion, QuizOption } from '../types'

export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Offering | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  // Selected lesson
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<LessonQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)

  // Lesson editing state
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDescription, setLessonDescription] = useState('')
  const [lessonContent, setLessonContent] = useState('')
  const [lessonVideoUrl, setLessonVideoUrl] = useState('')
  const [lessonDueDays, setLessonDueDays] = useState('')
  const [lessonSaving, setLessonSaving] = useState(false)
  const [lessonMsg, setLessonMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Org settings
  const [enableLessonDueDates, setEnableLessonDueDates] = useState(false)

  // Drag state for lesson reorder
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [connTest, setConnTest] = useState<Record<string, string> | null>(null)

  const selectedLesson = lessons.find(l => l.id === selectedLessonId) ?? null

  async function runConnTest() {
    if (!profile) return
    setConnTest({ status: 'testing...' })
    const results = await testSupabaseConnectivity(profile.organization_id)
    setConnTest(results)
  }

  // Fetch course, lessons, and org settings
  useEffect(() => {
    if (!id || !profile) return
    async function fetchData() {
      setLoading(true)
      try {
        const [courseRes, lessonsRes, orgRes] = await Promise.all([
          supabase.from('offerings').select('*').eq('id', id!).single(),
          supabase.from('lessons').select('*').eq('offering_id', id!).order('order_index', { ascending: true }),
          supabase.from('organizations').select('enable_lesson_due_dates').eq('id', profile!.organization_id).single(),
        ])

        console.log('[CourseBuilder] fetchData results:', { courseErr: courseRes.error, lessonsErr: lessonsRes.error, lessonCount: lessonsRes.data?.length })
        if (courseRes.error) { console.error('[CourseBuilder] fetchData: course error', courseRes.error); setError(courseRes.error.message); return }
        if ((courseRes.data as Offering).type !== 'course') { setError('This offering is not a course.'); return }

        setCourse(courseRes.data as Offering)
        setLessons((lessonsRes.data as Lesson[]) ?? [])
        setEnableLessonDueDates(orgRes.data?.enable_lesson_due_dates ?? false)
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, profile?.organization_id])

  // Fetch questions when selected lesson changes
  useEffect(() => {
    if (!selectedLessonId) { setQuestions([]); return }
    async function fetchQuestions() {
      setQuestionsLoading(true)
      try {
        const { data } = await supabase
          .from('lesson_questions')
          .select('*')
          .eq('lesson_id', selectedLessonId!)
          .order('order_index', { ascending: true })
        setQuestions((data as LessonQuestion[]) ?? [])
      } catch (err) {
        console.error(err)
      } finally {
        setQuestionsLoading(false)
      }
    }
    fetchQuestions()
  }, [selectedLessonId])

  // Populate editor when selected lesson changes
  useEffect(() => {
    if (selectedLesson) {
      setLessonTitle(selectedLesson.title)
      setLessonDescription(selectedLesson.description ?? '')
      setLessonContent(selectedLesson.content ?? '')
      setLessonVideoUrl(selectedLesson.video_url ?? '')
      setLessonDueDays(selectedLesson.due_days_offset != null ? String(selectedLesson.due_days_offset) : '')
      setLessonMsg(null)
    }
  }, [selectedLessonId])

  // --- Actions ---

  async function addLesson() {
    if (!id || !profile) { console.error('[CourseBuilder] addLesson: no id or profile', { id, profile }); return }
    const newIndex = lessons.length
    console.log('[CourseBuilder] addLesson: inserting lesson', { offering_id: id, order_index: newIndex })

    // Use raw REST call — SDK write calls have been timing out
    const { data, error: e } = await supabaseRestCall(
      'lessons',
      'POST',
      {
        offering_id: id,
        organization_id: profile.organization_id,
        title: `Lesson ${newIndex + 1}`,
        order_index: newIndex,
      },
    )

    if (e) {
      console.error('[CourseBuilder] addLesson FAILED:', e.message)
      reportSupabaseError(e, { component: 'CourseBuilderPage', action: 'addLesson' })
      setLessonMsg({ type: 'error', text: 'Failed to add lesson: ' + e.message })
      return
    }
    console.log('[CourseBuilder] addLesson response:', data)
    if (!data?.length) { console.warn('[CourseBuilder] addLesson: no data returned'); return }
    const newLesson = data[0] as unknown as Lesson
    setLessons(prev => [...prev, newLesson])
    setSelectedLessonId(newLesson.id)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'offering', entity_id: id, details: { sub: 'lesson', lesson_id: newLesson.id, title: newLesson.title } })
  }

  async function deleteLesson(lessonId: string) {
    if (!profile || !id) return
    const { error: e } = await withTimeout(supabase.from('lessons').delete().eq('id', lessonId), 15000, 'deleteLesson')
    if (e) { setLessonMsg({ type: 'error', text: 'Failed to delete lesson: ' + e.message }); return }
    const updated = lessons.filter(l => l.id !== lessonId)
    // Reindex
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].order_index !== i) {
        updated[i] = { ...updated[i], order_index: i }
        await supabase.from('lessons').update({ order_index: i }).eq('id', updated[i].id)
      }
    }
    setLessons(updated)
    if (selectedLessonId === lessonId) {
      setSelectedLessonId(updated.length > 0 ? updated[0].id : null)
    }
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'offering', entity_id: id, details: { sub: 'lesson', lesson_id: lessonId } })
  }

  async function saveLesson() {
    if (!selectedLesson || !profile) return
    setLessonSaving(true)
    setLessonMsg(null)

    try {
      const updates: Record<string, unknown> = {
        title: lessonTitle.trim() || selectedLesson.title,
        description: lessonDescription.trim() || null,
        content: lessonContent.trim() || null,
        video_url: lessonVideoUrl.trim() || null,
        due_days_offset: enableLessonDueDates && lessonDueDays ? parseInt(lessonDueDays) : null,
      }

      console.log('[CourseBuilder] saveLesson: updating', selectedLesson.id, updates)
      // Use raw REST call — SDK write calls have been timing out
      const { error: e } = await supabaseRestCall(
        'lessons',
        'PATCH',
        updates as Record<string, unknown>,
        `id=eq.${selectedLesson.id}`,
      )
      if (e) { console.error('[CourseBuilder] saveLesson FAILED:', e.message); reportSupabaseError(e, { component: 'CourseBuilderPage', action: 'saveLesson' }); setLessonMsg({ type: 'error', text: 'Save failed: ' + e.message }); return }

      console.log('[CourseBuilder] saveLesson: SUCCESS')
      setLessons(prev => prev.map(l => l.id === selectedLesson.id ? { ...l, ...updates } as Lesson : l))
      setLessonMsg({ type: 'success', text: 'Lesson saved.' })
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'offering', entity_id: course?.id ?? '', details: { sub: 'lesson', lesson_id: selectedLesson.id, title: lessonTitle.trim() } })
    } catch (err) {
      setLessonMsg({ type: 'error', text: (err as Error).message || 'Failed to save lesson' })
      console.error(err)
    } finally {
      setLessonSaving(false)
    }
  }

  // Drag-and-drop lesson reorder
  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  async function handleDrop(targetIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === targetIndex) {
      dragIndexRef.current = null
      setDragOverIndex(null)
      return
    }

    const reordered = [...lessons]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    const updated = reordered.map((l, i) => ({ ...l, order_index: i }))
    setLessons(updated)
    dragIndexRef.current = null
    setDragOverIndex(null)

    // Persist new order
    for (const l of updated) {
      await supabase.from('lessons').update({ order_index: l.order_index }).eq('id', l.id)
    }
  }

  // --- Questions ---

  async function addQuestion(type: 'quiz' | 'response') {
    if (!selectedLessonId || !profile) return
    const newIndex = questions.length
    const options: QuizOption[] | null = type === 'quiz' ? [{ text: '', is_correct: true }, { text: '', is_correct: false }] : null

    try {
      console.log('[CourseBuilder] addQuestion:', { type, lesson_id: selectedLessonId, order_index: newIndex })
      // Use raw REST call — SDK write calls have been timing out
      const { data, error: e } = await supabaseRestCall(
        'lesson_questions',
        'POST',
        {
          lesson_id: selectedLessonId,
          organization_id: profile.organization_id,
          question_text: '',
          question_type: type,
          options,
          order_index: newIndex,
        },
      )

      if (e) { console.error('[CourseBuilder] addQuestion FAILED:', e.message); reportSupabaseError(e, { component: 'CourseBuilderPage', action: 'addQuestion' }); setLessonMsg({ type: 'error', text: 'Failed to add question: ' + e.message }); return }
      console.log('[CourseBuilder] addQuestion response:', data)
      if (!data?.length) { console.warn('[CourseBuilder] addQuestion: no data returned'); return }
      setQuestions(prev => [...prev, data[0] as unknown as LessonQuestion])
    } catch (err) {
      setLessonMsg({ type: 'error', text: 'Failed to add question: ' + ((err as Error).message || 'Unknown error') })
      console.error(err)
    }
  }

  async function updateQuestion(questionId: string, updates: Partial<LessonQuestion>) {
    const { error: e } = await withTimeout(supabase.from('lesson_questions').update(updates).eq('id', questionId), 15000, 'updateQuestion')
    if (e) { console.error('[CourseBuilder] updateQuestion FAILED:', e.message); return }
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, ...updates } as LessonQuestion : q))
  }

  async function deleteQuestion(questionId: string) {
    const { error: e } = await withTimeout(supabase.from('lesson_questions').delete().eq('id', questionId), 15000, 'deleteQuestion')
    if (e) { console.error('[CourseBuilder] deleteQuestion FAILED:', e.message); return }
    setQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  // --- Render ---

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error || !course) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'Course not found.'}
        </div>
      </div>
    )
  }

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/courses')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{course.name}</h1>
            <p className="text-xs text-gray-500">Course Builder &middot; {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runConnTest}
            className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            title="Test Supabase read/write connectivity"
          >
            Test DB
          </button>
          <button
            onClick={() => navigate(`/courses/${id}/edit`)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Course Settings
          </button>
        </div>
      </div>

      {connTest && (
        <div className="mb-4 rounded border bg-gray-50 border-gray-200 px-4 py-3 text-xs font-mono text-gray-700">
          <p className="font-semibold mb-1">DB Connectivity Test:</p>
          {Object.entries(connTest).map(([k, v]) => (
            <p key={k}>{k}: <span className={v.startsWith('OK') ? 'text-green-600' : v === 'testing...' ? 'text-amber-600' : 'text-red-600'}>{v}</span></p>
          ))}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* LEFT: Lesson list */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Lessons</span>
              <button
                onClick={addLesson}
                className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
              >
                + Add
              </button>
            </div>

            {lessons.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400">No lessons yet.</p>
                <button onClick={addLesson} className="mt-2 text-xs font-medium text-brand hover:text-brand-hover transition-colors">
                  Add your first lesson
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {lessons.map((lesson, index) => (
                  <div
                    key={lesson.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null) }}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group ${
                      selectedLessonId === lesson.id
                        ? 'bg-brand-light border-l-2 border-brand'
                        : 'hover:bg-gray-50 border-l-2 border-transparent'
                    } ${dragOverIndex === index ? 'bg-blue-50' : ''}`}
                  >
                    <span className="text-[10px] text-gray-400 w-4 shrink-0 cursor-grab" title="Drag to reorder">
                      {index + 1}
                    </span>
                    <span className={`text-sm truncate flex-1 ${selectedLessonId === lesson.id ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                      {lesson.title}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteLesson(lesson.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-xs"
                      title="Delete lesson"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Lesson editor */}
        <div className="flex-1 min-w-0">
          {!selectedLesson ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-16 text-center">
              <p className="text-sm text-gray-400">
                {lessons.length === 0 ? 'Add a lesson to get started.' : 'Select a lesson to edit.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status message */}
              {lessonMsg && (
                <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${
                  lessonMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <span className="mt-0.5">{lessonMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                  {lessonMsg.text}
                </div>
              )}

              {/* Lesson details */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Lesson Details</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={lessonTitle}
                      onChange={e => setLessonTitle(e.target.value)}
                      className={inputClass}
                      placeholder="Lesson title"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={lessonDescription}
                      onChange={e => setLessonDescription(e.target.value)}
                      className={inputClass + ' resize-none'}
                      placeholder="Brief summary of this lesson (optional)"
                    />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Content</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Lesson content</label>
                    <RichTextEditor
                      content={lessonContent}
                      onChange={setLessonContent}
                      placeholder="Write your lesson content here..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Video URL</label>
                    <input
                      type="url"
                      value={lessonVideoUrl}
                      onChange={e => setLessonVideoUrl(e.target.value)}
                      className={inputClass}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                    {lessonVideoUrl && (
                      <p className="text-[10px] text-gray-400 mt-1">Video will be embedded in the lesson view for mentees.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Due date (if enabled) */}
              {enableLessonDueDates && (
                <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                  <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Due Date</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Days after enrollment</label>
                    <input
                      type="number"
                      min="1"
                      value={lessonDueDays}
                      onChange={e => setLessonDueDays(e.target.value)}
                      className={inputClass + ' max-w-32'}
                      placeholder="e.g. 7"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">This lesson will be due X days after the mentee enrolls in the course.</p>
                  </div>
                </div>
              )}

              {/* Questions */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Questions</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestion('response')}
                      className="px-2.5 py-1 text-xs font-semibold rounded border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      + Response
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('quiz')}
                      className="px-2.5 py-1 text-xs font-semibold rounded border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    >
                      + Quiz
                    </button>
                  </div>
                </div>

                {questionsLoading ? (
                  <p className="text-xs text-gray-400">Loading questions...</p>
                ) : questions.length === 0 ? (
                  <p className="text-xs text-gray-400">No questions yet. Add a response or quiz question above.</p>
                ) : (
                  <div className="space-y-4">
                    {questions.map((q, qi) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        index={qi}
                        onUpdate={updateQuestion}
                        onDelete={deleteQuestion}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Save */}
              <div className="flex items-center gap-3">
                <button
                  onClick={saveLesson}
                  disabled={lessonSaving}
                  className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {lessonSaving ? 'Saving...' : 'Save Lesson'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Question Card Component ---

function QuestionCard({
  question,
  index,
  onUpdate,
  onDelete,
}: {
  question: LessonQuestion
  index: number
  onUpdate: (id: string, updates: Partial<LessonQuestion>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [text, setText] = useState(question.question_text)
  const [options, setOptions] = useState<QuizOption[]>(question.options ?? [])

  const isQuiz = question.question_type === 'quiz'

  function autoSave(overrideText?: string, overrideOptions?: QuizOption[]) {
    const updates: Partial<LessonQuestion> = { question_text: (overrideText ?? text).trim() }
    if (isQuiz) {
      updates.options = overrideOptions ?? options
    }
    onUpdate(question.id, updates)
  }

  function addOption() {
    const next = [...options, { text: '', is_correct: false }]
    setOptions(next)
  }

  function removeOption(idx: number) {
    const next = options.filter((_, i) => i !== idx)
    setOptions(next)
    autoSave(undefined, next)
  }

  function updateOptionText(idx: number, value: string) {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, text: value } : o))
  }

  function setCorrectOption(idx: number) {
    const next = options.map((o, i) => ({ ...o, is_correct: i === idx }))
    setOptions(next)
    autoSave(undefined, next)
  }

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Q{index + 1}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            isQuiz ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
          }`}>
            {isQuiz ? 'Quiz' : 'Response'}
          </span>
        </div>
        <button
          onClick={() => onDelete(question.id)}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Question</label>
          <textarea
            rows={2}
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => autoSave()}
            className={inputClass + ' resize-none'}
            placeholder="Enter your question..."
          />
        </div>

        {isQuiz && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Answer options</label>
            <div className="space-y-2">
              {options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectOption(oi)}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      opt.is_correct ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    title={opt.is_correct ? 'Correct answer' : 'Mark as correct'}
                  >
                    {opt.is_correct && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={e => updateOptionText(oi, e.target.value)}
                    onBlur={() => autoSave()}
                    placeholder={`Option ${oi + 1}`}
                    className={inputClass}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(oi)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addOption}
              className="mt-2 text-xs font-medium text-brand hover:text-brand-hover transition-colors"
            >
              + Add option
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
