import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestCall } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import RichTextEditor from '../components/RichTextEditor'
import type { RichTextEditorHandle } from '../components/RichTextEditor'
import { DYNAMIC_FIELDS } from '../lib/dynamicFields'
import type { Offering, Lesson, LessonSection, LessonQuestion, QuizOption, SectionType } from '../types'
import { useToast } from '../context/ToastContext'
import { Skeleton } from '../components/ui'

export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [course, setCourse] = useState<Offering | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [sections, setSections] = useState<LessonSection[]>([])
  const [questions, setQuestions] = useState<LessonQuestion[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)

  // Lesson header state
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDescription, setLessonDescription] = useState('')
  const [lessonDueDays, setLessonDueDays] = useState('')
  const [lessonSaving, setLessonSaving] = useState(false)

  const [enableLessonDueDates, setEnableLessonDueDates] = useState(false)

  // Drag for lesson reorder
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Drag for section reorder
  const secDragRef = useRef<number | null>(null)
  const [secDragOver, setSecDragOver] = useState<number | null>(null)

  const selectedLesson = lessons.find(l => l.id === selectedLessonId) ?? null

  // Fetch course and lessons
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
        if (courseRes.error) { setError(courseRes.error.message); return }
        if ((courseRes.data as Offering).type !== 'course') { setError('This offering is not a course.'); return }
        setCourse(courseRes.data as Offering)
        setLessons((lessonsRes.data as Lesson[]) ?? [])
        setEnableLessonDueDates(orgRes.data?.enable_lesson_due_dates ?? false)
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, profile?.organization_id])

  // Fetch sections + questions when lesson changes
  useEffect(() => {
    if (!selectedLessonId) { setSections([]); setQuestions([]); return }
    async function fetchSectionsAndQuestions() {
      setSectionsLoading(true)
      try {
        const [sectRes, qRes] = await Promise.all([
          supabase.from('lesson_sections').select('*').eq('lesson_id', selectedLessonId!).order('order_index', { ascending: true }),
          supabase.from('lesson_questions').select('*').eq('lesson_id', selectedLessonId!).order('order_index', { ascending: true }),
        ])
        setSections((sectRes.data as LessonSection[]) ?? [])
        setQuestions((qRes.data as LessonQuestion[]) ?? [])
      } catch (err) {
        console.error(err)
      } finally {
        setSectionsLoading(false)
      }
    }
    fetchSectionsAndQuestions()
  }, [selectedLessonId])

  // Populate lesson header when selection changes
  useEffect(() => {
    if (selectedLesson) {
      setLessonTitle(selectedLesson.title)
      setLessonDescription(selectedLesson.description ?? '')
      setLessonDueDays(selectedLesson.due_days_offset != null ? String(selectedLesson.due_days_offset) : '')
    }
  }, [selectedLessonId])

  // --- Lesson actions ---
  async function addLesson() {
    if (!id || !profile) return
    const newIndex = lessons.length
    const { data, error: e } = await supabaseRestCall('lessons', 'POST', {
      offering_id: id, organization_id: profile.organization_id,
      title: `Lesson ${newIndex + 1}`, order_index: newIndex,
    })
    if (e) { toast.error('Failed to add lesson: ' + e.message); return }
    if (!data?.length) return
    const newLesson = data[0] as unknown as Lesson
    setLessons(prev => [...prev, newLesson])
    setSelectedLessonId(newLesson.id)
    await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'offering', entity_id: id, details: { sub: 'lesson', lesson_id: newLesson.id } })
  }

  async function deleteLesson(lessonId: string) {
    if (!profile || !id) return
    const deletedTitle = lessons.find(l => l.id === lessonId)?.title
    try {
      const { error: e } = await supabaseRestCall('lessons', 'DELETE', {}, `id=eq.${lessonId}`)
      if (e) { toast.error('Failed to delete: ' + e.message); return }
      const updated = lessons.filter(l => l.id !== lessonId)
      const reindexed = updated.map((l, i) => ({ ...l, order_index: i }))
      setLessons(reindexed)
      await Promise.all(
        reindexed
          .filter((_l, i) => updated[i].order_index !== i)
          .map(l => supabaseRestCall('lessons', 'PATCH', { order_index: l.order_index }, `id=eq.${l.id}`))
      )
      if (selectedLessonId === lessonId) setSelectedLessonId(reindexed[0]?.id ?? null)
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'offering', entity_id: id, details: { sub: 'lesson_deleted', lesson_id: lessonId, lesson_title: deletedTitle } })
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete')
    }
  }

  async function saveLessonHeader() {
    if (!selectedLesson || !profile) return
    setLessonSaving(true)
    try {
      const updates = {
        title: lessonTitle.trim() || selectedLesson.title,
        description: lessonDescription.trim() || null,
        due_days_offset: enableLessonDueDates && lessonDueDays ? parseInt(lessonDueDays) : null,
      }
      const { error: e } = await supabaseRestCall('lessons', 'PATCH', updates, `id=eq.${selectedLesson.id}`)
      if (e) { toast.error('Save failed: ' + e.message); return }
      setLessons(prev => prev.map(l => l.id === selectedLesson.id ? { ...l, ...updates } as Lesson : l))
      toast.success('Saved.')
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'updated', entity_type: 'offering', entity_id: id!, details: { sub: 'lesson_updated', lesson_id: selectedLesson.id, lesson_title: updates.title } })
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    } finally {
      setLessonSaving(false)
    }
  }

  // Drag-and-drop lesson reorder
  function handleDragStart(index: number) { dragIndexRef.current = index }
  function handleDragOver(e: React.DragEvent, index: number) { e.preventDefault(); setDragOverIndex(index) }
  async function handleDrop(targetIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === targetIndex) { dragIndexRef.current = null; setDragOverIndex(null); return }
    const prev = [...lessons]
    const reordered = [...lessons]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    const updated = reordered.map((l, i) => ({ ...l, order_index: i }))
    setLessons(updated)
    dragIndexRef.current = null; setDragOverIndex(null)
    try {
      const results = await Promise.all(
        updated.map(l => supabaseRestCall('lessons', 'PATCH', { order_index: l.order_index }, `id=eq.${l.id}`))
      )
      if (results.some(r => r.error)) { setLessons(prev) }
    } catch { setLessons(prev) }
  }

  // --- Section actions (all use supabaseRestCall to avoid SDK write hang) ---
  async function addSection(sectionType: SectionType) {
    if (!selectedLessonId || !profile) return
    const newIndex = sections.length
    const { data, error: e } = await supabaseRestCall('lesson_sections', 'POST', {
      lesson_id: selectedLessonId, organization_id: profile.organization_id, order_index: newIndex, section_type: sectionType,
    })
    if (e) { toast.error('Failed to add section: ' + e.message); return }
    if (!data?.length) { toast.error('Section was not created. Please try again.'); return }
    const newSection = data[0] as unknown as LessonSection
    setSections(prev => [...prev, newSection])
    // Auto-create a question for quiz/response sections
    if (sectionType === 'quiz' || sectionType === 'response') {
      await addQuestion(sectionType === 'quiz' ? 'quiz' : 'response', newSection.id)
    }
  }

  // Section drag-to-reorder
  function secDragStart(index: number) { secDragRef.current = index }
  function secDragOverHandler(e: React.DragEvent, index: number) { e.preventDefault(); e.stopPropagation(); setSecDragOver(index) }
  async function secDrop(targetIndex: number) {
    const fromIndex = secDragRef.current
    if (fromIndex === null || fromIndex === targetIndex) { secDragRef.current = null; setSecDragOver(null); return }
    const prev = [...sections]
    const reordered = [...sections]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, order_index: i }))
    setSections(updated)
    secDragRef.current = null; setSecDragOver(null)
    try {
      const results = await Promise.all(
        updated.map(s => supabaseRestCall('lesson_sections', 'PATCH', { order_index: s.order_index }, `id=eq.${s.id}`))
      )
      if (results.some(r => r.error)) { setSections(prev) }
    } catch { setSections(prev) }
  }

  async function updateSection(sectionId: string, updates: Partial<LessonSection>) {
    const { error: e } = await supabaseRestCall('lesson_sections', 'PATCH', updates as Record<string, unknown>, `id=eq.${sectionId}`)
    if (e) { console.error('[CourseBuilder] updateSection error:', e); return }
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, ...updates } as LessonSection : s))
  }

  async function deleteSection(sectionId: string) {
    const { error: e } = await supabaseRestCall('lesson_sections', 'DELETE', {}, `id=eq.${sectionId}`)
    if (e) { toast.error('Failed to delete section.'); return }
    // Remove questions belonging to this section
    setQuestions(prev => prev.filter(q => q.section_id !== sectionId))
    // Calculate new order and update state
    const filtered = sections.filter(s => s.id !== sectionId)
    const reindexed = filtered.map((s, i) => ({ ...s, order_index: i }))
    setSections(reindexed)
    // Re-index in DB (await all to prevent race conditions)
    await Promise.all(
      reindexed
        .filter((_s, i) => filtered[i].order_index !== i)
        .map(s => supabaseRestCall('lesson_sections', 'PATCH', { order_index: s.order_index }, `id=eq.${s.id}`))
    )
  }

  // --- Question actions (all use supabaseRestCall to avoid SDK write hang) ---
  async function addQuestion(type: 'quiz' | 'response', sectionId: string | null) {
    if (!selectedLessonId || !profile) return
    const sectionQuestions = questions.filter(q => q.section_id === sectionId)
    const newIndex = sectionQuestions.length
    const options: QuizOption[] | null = type === 'quiz' ? [{ text: '', is_correct: true }, { text: '', is_correct: false }] : null
    const { data, error: e } = await supabaseRestCall('lesson_questions', 'POST', {
      lesson_id: selectedLessonId, section_id: sectionId,
      organization_id: profile.organization_id,
      question_text: '', question_type: type, options, order_index: newIndex,
    })
    if (e) { toast.error('Failed to add question: ' + e.message); return }
    if (!data?.length) { toast.error('Question was not created. Please try again.'); return }
    setQuestions(prev => [...prev, data[0] as unknown as LessonQuestion])
  }

  async function updateQuestion(questionId: string, updates: Partial<LessonQuestion>) {
    const { error: e } = await supabaseRestCall('lesson_questions', 'PATCH', updates as Record<string, unknown>, `id=eq.${questionId}`)
    if (e) { toast.error('Failed to save question.'); return }
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, ...updates } as LessonQuestion : q))
  }

  async function deleteQuestion(questionId: string) {
    const deleted = questions.find(q => q.id === questionId)
    const { error: e } = await supabaseRestCall('lesson_questions', 'DELETE', {}, `id=eq.${questionId}`)
    if (e) { toast.error('Failed to delete question.'); return }
    // Remove from state and re-index sibling questions
    const filtered = questions.filter(q => q.id !== questionId)
    if (deleted) {
      const toReindex = filtered
        .filter(q => q.section_id === deleted.section_id && q.lesson_id === deleted.lesson_id && q.order_index > deleted.order_index)
      const reindexed = filtered.map(q => {
        if (q.section_id === deleted.section_id && q.lesson_id === deleted.lesson_id && q.order_index > deleted.order_index) {
          return { ...q, order_index: q.order_index - 1 }
        }
        return q
      })
      setQuestions(reindexed)
      // Persist re-indexed order to DB
      await Promise.all(
        toReindex.map(q => supabaseRestCall('lesson_questions', 'PATCH', { order_index: q.order_index - 1 }, `id=eq.${q.id}`))
      )
    } else {
      setQuestions(filtered)
    }
  }

  // --- Render ---
  if (loading) return <Skeleton count={5} className="h-12 w-full" gap="gap-2" />
  if (error || !course) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">{error || 'Course not found.'}</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/courses')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{course.name}</h1>
            <p className="text-xs text-gray-500">Course Builder · {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => navigate(`/courses/${id}/edit`)} className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors">
          Course Settings
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* LEFT: Lesson list */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Lessons</span>
              <button onClick={addLesson} className="text-xs font-medium text-brand hover:text-brand-hover transition-colors">+ Add</button>
            </div>
            {lessons.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400">No lessons yet.</p>
                <button onClick={addLesson} className="mt-2 text-xs font-medium text-brand hover:text-brand-hover transition-colors">Add your first lesson</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {lessons.map((lesson, index) => (
                  <div
                    key={lesson.id} draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null) }}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group ${
                      selectedLessonId === lesson.id ? 'bg-brand-light border-l-2 border-brand' : 'hover:bg-gray-50 border-l-2 border-transparent'
                    } ${dragOverIndex === index ? 'bg-blue-50' : ''}`}
                  >
                    <span className="text-[10px] text-gray-400 w-4 shrink-0 cursor-grab">{index + 1}</span>
                    <span className={`text-sm truncate flex-1 ${selectedLessonId === lesson.id ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{lesson.title}</span>
                    <button onClick={e => { e.stopPropagation(); deleteLesson(lesson.id) }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-xs">&times;</button>
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
              <p className="text-sm text-gray-400">{lessons.length === 0 ? 'Add a lesson to get started.' : 'Select a lesson to edit.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sticky lesson header */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-3 sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text" value={lessonTitle} onChange={e => setLessonTitle(e.target.value)}
                      className="text-base font-semibold text-gray-900 w-full outline-none border-none bg-transparent placeholder-gray-400"
                      placeholder="Lesson title"
                    />
                    <input
                      type="text" value={lessonDescription} onChange={e => setLessonDescription(e.target.value)}
                      className="text-xs text-gray-500 w-full outline-none border-none bg-transparent placeholder-gray-400 mt-0.5"
                      placeholder="Brief description (optional)"
                    />
                  </div>
                  {enableLessonDueDates && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">Due in</span>
                      <input type="number" min="1" value={lessonDueDays} onChange={e => setLessonDueDays(e.target.value)} placeholder="—" className="w-12 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand text-center" />
                      <span className="text-[10px] text-gray-400">days</span>
                    </div>
                  )}
                  <button onClick={saveLessonHeader} disabled={lessonSaving} className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-60 transition-colors shrink-0">
                    {lessonSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Sections */}
              {sectionsLoading ? (
                <div className="py-2"><Skeleton count={3} className="h-8 w-full" gap="gap-2" /></div>
              ) : (
                <>
                  {/* Add buttons before first section */}
                  <AddSectionBar onAdd={addSection} />

                  {sections.map((section, si) => (
                    <div key={section.id}>
                      <div
                        draggable
                        onDragStart={() => secDragStart(si)}
                        onDragOver={e => secDragOverHandler(e, si)}
                        onDrop={() => secDrop(si)}
                        onDragEnd={() => { secDragRef.current = null; setSecDragOver(null) }}
                        className={secDragOver === si ? 'ring-2 ring-brand/30 rounded-md' : ''}
                      >
                        <SectionEditor
                          section={section}
                          questions={questions.filter(q => q.section_id === section.id)}
                          onUpdateSection={updateSection}
                          onDeleteSection={deleteSection}
                          onAddQuestion={addQuestion}
                          onUpdateQuestion={updateQuestion}
                          onDeleteQuestion={deleteQuestion}
                        />
                      </div>
                      {/* Add buttons after each section */}
                      <AddSectionBar onAdd={addSection} />
                    </div>
                  ))}

                  {/* Legacy lesson-level questions (for backwards compat) */}
                  {questions.filter(q => !q.section_id).length > 0 && (
                    <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                      <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Lesson Questions (legacy)</h3>
                      <div className="space-y-4">
                        {questions.filter(q => !q.section_id).map((q, qi) => (
                          <QuestionCard key={q.id} question={q} index={qi} onUpdate={updateQuestion} onDelete={deleteQuestion} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Section Bar (appears between sections) ──

function AddSectionBar({ onAdd }: { onAdd: (type: SectionType) => Promise<void> }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1.5">
      <button type="button" onClick={() => onAdd('text')} className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors">+ Text</button>
      <button type="button" onClick={() => onAdd('video')} className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors">+ Video</button>
      <button type="button" onClick={() => onAdd('quiz')} className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">+ Quiz</button>
      <button type="button" onClick={() => onAdd('response')} className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">+ Response</button>
    </div>
  )
}

// ── Section Editor ──

const SECTION_STYLES: Record<SectionType, { border: string; bg: string; label: string; badge: string }> = {
  text:     { border: 'border-gray-200/80', bg: 'bg-gray-50/50', label: 'Text',     badge: 'bg-gray-100 text-gray-600' },
  video:    { border: 'border-sky-200/80',  bg: 'bg-sky-50/40',  label: 'Video',    badge: 'bg-sky-100 text-sky-600' },
  quiz:     { border: 'border-violet-200/80', bg: 'bg-violet-50/40', label: 'Quiz', badge: 'bg-violet-100 text-violet-600' },
  response: { border: 'border-indigo-200/80', bg: 'bg-indigo-50/40', label: 'Response', badge: 'bg-indigo-100 text-indigo-600' },
}

function SectionEditor({
  section, questions, onUpdateSection, onDeleteSection,
  onAddQuestion, onUpdateQuestion, onDeleteQuestion,
}: {
  section: LessonSection
  questions: LessonQuestion[]
  onUpdateSection: (id: string, updates: Partial<LessonSection>) => Promise<void>
  onDeleteSection: (id: string) => Promise<void>
  onAddQuestion: (type: 'quiz' | 'response', sectionId: string | null) => Promise<void>
  onUpdateQuestion: (id: string, updates: Partial<LessonQuestion>) => Promise<void>
  onDeleteQuestion: (id: string) => Promise<void>
}) {
  const sType = (section.section_type ?? 'text') as SectionType
  const style = SECTION_STYLES[sType]
  const [title, setTitle] = useState(section.title ?? '')
  const [content, setContent] = useState(section.content ?? '')
  const [videoUrl, setVideoUrl] = useState(section.video_url ?? '')
  const [notes, setNotes] = useState(section.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [showDynamicFields, setShowDynamicFields] = useState(false)
  const editorRef = useRef<RichTextEditorHandle | null>(null)

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  async function save() {
    setSaving(true)
    await onUpdateSection(section.id, {
      title: title.trim() || null,
      content: content.trim() || null,
      video_url: videoUrl.trim() || null,
      notes: notes.trim() || null,
    })
    setSaving(false)
  }

  function insertDynamicField(token: string) {
    editorRef.current?.insertText(token)
    setShowDynamicFields(false)
  }

  const menteeFields = DYNAMIC_FIELDS.filter(f => f.group === 'mentee')
  const mentorFields = DYNAMIC_FIELDS.filter(f => f.group === 'mentor')

  return (
    <div className={`bg-white rounded-md border ${style.border} overflow-hidden`}>
      {/* Section header */}
      <div className={`px-5 py-2.5 ${style.bg} border-b border-gray-100 flex items-center justify-between`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-gray-400 cursor-grab text-xs" title="Drag to reorder">&#x2630;</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.badge}`}>{style.label}</span>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={save}
            className="text-sm font-medium text-gray-900 flex-1 outline-none bg-transparent placeholder-gray-400"
            placeholder="Section title (optional)"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={save} disabled={saving}
            className="px-2.5 py-1 text-[11px] font-medium rounded border border-brand/30 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={() => onDeleteSection(section.id)}
            className="px-2.5 py-1 text-[11px] font-medium rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors">
            Delete
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Left: type-specific content */}
        <div className="flex-1 min-w-0 px-5 py-4 space-y-4">
          {/* TEXT section */}
          {sType === 'text' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Content</label>
                <div className="relative">
                  <button type="button" onClick={() => setShowDynamicFields(!showDynamicFields)}
                    className="px-2 py-0.5 text-[10px] font-semibold rounded border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors">
                    {'{ } Dynamic Fields'}
                  </button>
                  {showDynamicFields && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 w-52">
                      <p className="px-3 py-1 text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Click to insert at cursor</p>
                      <div className="border-b border-gray-100 my-1" />
                      <p className="px-3 py-1 text-[10px] text-gray-500 font-semibold">Mentee</p>
                      {menteeFields.map(f => (
                        <button key={f.token} type="button" onClick={() => insertDynamicField(f.token)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 transition-colors flex items-center justify-between">
                          <span className="text-gray-700">{f.label}</span>
                          <code className="text-[10px] text-purple-500 bg-purple-50 px-1 rounded">{f.token}</code>
                        </button>
                      ))}
                      <div className="border-b border-gray-100 my-1" />
                      <p className="px-3 py-1 text-[10px] text-gray-500 font-semibold">Mentor</p>
                      {mentorFields.map(f => (
                        <button key={f.token} type="button" onClick={() => insertDynamicField(f.token)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 transition-colors flex items-center justify-between">
                          <span className="text-gray-700">{f.label}</span>
                          <code className="text-[10px] text-purple-500 bg-purple-50 px-1 rounded">{f.token}</code>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <RichTextEditor content={content} onChange={setContent} placeholder="Write section content..." editorRef={editorRef} />
            </div>
          )}

          {/* VIDEO section */}
          {sType === 'video' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Video URL</label>
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} onBlur={save} className={inputClass} placeholder="https://youtube.com/watch?v=..." />
              {videoUrl && (
                <div className="mt-3 rounded overflow-hidden border border-gray-200">
                  <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                    <iframe src={(() => { const yt = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/); if (yt) return `https://www.youtube.com/embed/${yt[1]}`; const vm = videoUrl.match(/vimeo\.com\/(\d+)/); if (vm) return `https://player.vimeo.com/video/${vm[1]}`; return videoUrl })()}
                      className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Video preview" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUIZ section */}
          {sType === 'quiz' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Quiz Questions</label>
                <button type="button" onClick={() => onAddQuestion('quiz', section.id)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded border border-violet-300 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors">
                  + Add Question
                </button>
              </div>
              {questions.length === 0 ? (
                <p className="text-xs text-gray-400">No quiz questions yet.</p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, qi) => (
                    <QuestionCard key={q.id} question={q} index={qi} onUpdate={onUpdateQuestion} onDelete={onDeleteQuestion} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RESPONSE section */}
          {sType === 'response' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Response Questions</label>
                <button type="button" onClick={() => onAddQuestion('response', section.id)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded border border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                  + Add Question
                </button>
              </div>
              {questions.length === 0 ? (
                <p className="text-xs text-gray-400">No response questions yet.</p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, qi) => (
                    <QuestionCard key={q.id} question={q} index={qi} onUpdate={onUpdateQuestion} onDelete={onDeleteQuestion} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: creator notes */}
        <div className="w-48 shrink-0 border-l border-gray-100 bg-amber-50/30 px-3 py-3">
          <label className="block text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={save}
            rows={4}
            className="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/50 transition resize-none"
            placeholder="Private notes..."
          />
        </div>
      </div>
    </div>
  )
}

// ── Question Card ──

function QuestionCard({
  question, index, onUpdate, onDelete,
}: {
  question: LessonQuestion; index: number
  onUpdate: (id: string, updates: Partial<LessonQuestion>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [text, setText] = useState(question.question_text)
  const [options, setOptions] = useState<QuizOption[]>(question.options ?? [])
  const [validationMsg, setValidationMsg] = useState<string | null>(null)
  const isQuiz = question.question_type === 'quiz'

  function validate(qText?: string, qOptions?: QuizOption[]): string | null {
    const t = (qText ?? text).trim()
    if (!t) return 'Question text is required.'
    if (isQuiz) {
      const opts = qOptions ?? options
      if (opts.length < 2) return 'Quiz questions need at least 2 options.'
      if (opts.some(o => !o.text.trim())) return 'All options need text.'
      if (!opts.some(o => o.is_correct)) return 'Select a correct answer.'
    }
    return null
  }

  function autoSave(overrideText?: string, overrideOptions?: QuizOption[]) {
    const msg = validate(overrideText, overrideOptions)
    setValidationMsg(msg)
    if (msg) return
    onUpdate(question.id, { question_text: (overrideText ?? text).trim(), ...(isQuiz ? { options: overrideOptions ?? options } : {}) })
  }

  function addOption() { setOptions(prev => [...prev, { text: '', is_correct: false }]) }
  function removeOption(idx: number) { const next = options.filter((_, i) => i !== idx); setOptions(next); autoSave(undefined, next) }
  function updateOptionText(idx: number, value: string) { setOptions(prev => prev.map((o, i) => i === idx ? { ...o, text: value } : o)) }
  function setCorrectOption(idx: number) { const next = options.map((o, i) => ({ ...o, is_correct: i === idx })); setOptions(next); autoSave(undefined, next) }

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className={`rounded border p-3 ${validationMsg ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Q{index + 1}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isQuiz ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
            {isQuiz ? 'Quiz' : 'Response'}
          </span>
        </div>
        <button onClick={() => onDelete(question.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Delete</button>
      </div>
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} onBlur={() => autoSave()} className={inputClass + ' resize-none mb-2'} placeholder="Enter your question..." />
      {isQuiz && (
        <div className="space-y-2">
          {options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button type="button" onClick={() => setCorrectOption(oi)} className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${opt.is_correct ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-gray-400'}`}>
                {opt.is_correct && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              </button>
              <input type="text" value={opt.text} onChange={e => updateOptionText(oi, e.target.value)} onBlur={() => autoSave()} placeholder={`Option ${oi + 1}`} className={inputClass} />
              {options.length > 2 && <button onClick={() => removeOption(oi)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">&times;</button>}
            </div>
          ))}
          <button onClick={addOption} className="text-xs font-medium text-brand hover:text-brand-hover transition-colors">+ Add option</button>
        </div>
      )}
      {validationMsg && <p className="mt-2 text-[10px] text-amber-600">{validationMsg}</p>}
    </div>
  )
}
