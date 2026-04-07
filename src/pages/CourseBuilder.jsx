import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ArrowLeft, Plus, Trash2, Clock, RotateCcw, Check, Unlock,
  ChevronDown, ChevronRight, X, Save,
  MoreVertical, Copy, ArrowUp, ArrowDown, Video, Link
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import RichTextEditor from '../components/RichTextEditor'
import LessonQuestionEditor from '../components/LessonQuestionEditor'

const DELIVERY_MODES = [
  { value: 'all_unlocked', label: 'All Unlocked', desc: 'All lessons available from the start' },
  { value: 'scheduled', label: 'Scheduled Release', desc: 'Lessons release on a set schedule' },
  { value: 'on_completion', label: 'On Completion', desc: 'Next lesson unlocks on completion' },
]
const SCHEDULE_UNITS = ['Days', 'Weeks']

function newLesson(order) {
  return { title: '', description: '', content: '', video_url: '', order_index: order, due_days_offset: '', _key: Math.random(), questions: [] }
}

export default function CourseBuilder() {
  const { id: offeringId } = useParams()
  const navigate = useNavigate()
  const { organizationId } = useRole()
  const [offering, setOffering] = useState(null)
  const [course, setCourse] = useState(null)
  const [lessons, setLessons] = useState([])
  const [deliveryMode, setDeliveryMode] = useState('scheduled')
  const [scheduleInterval, setScheduleInterval] = useState(7)
  const [scheduleUnit, setScheduleUnit] = useState('Days')
  const [dueDateMode, setDueDateMode] = useState('none') // 'none' | 'course' | 'lesson'
  const [expectedCompletionDays, setExpectedCompletionDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [openLessonIdx, setOpenLessonIdx] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [menuOpenIdx, setMenuOpenIdx] = useState(null)

  useEffect(() => { load() }, [offeringId])

  async function load() {
    setLoading(true)
    const [offeringRes, courseRes] = await Promise.all([
      supabase.from('offerings').select('*').eq('id', offeringId).single(),
      supabase.from('courses').select('*').eq('offering_id', offeringId).single(),
    ])

    const off = offeringRes.data
    if (off) setOffering(off)

    if (courseRes.data) {
      const c = courseRes.data
      setCourse(c)
      setDeliveryMode(c.delivery_mode || 'scheduled')
      setScheduleInterval(c.schedule_interval || 7)
      setScheduleUnit(c.schedule_unit || 'Days')
      setDueDateMode(c.due_date_mode || 'none')
      setExpectedCompletionDays(c.expected_completion_days ?? '')

      const { data: lessonData } = await supabase
        .from('lessons').select('*').eq('course_id', c.id).order('order_index')
      if (lessonData && lessonData.length > 0) {
        const lessonIds = lessonData.map(l => l.id)
        // Load questions for all lessons
        let questionsMap = {}
        if (lessonIds.length > 0) {
          const { data: qData } = await supabase
            .from('lesson_questions').select('*').in('lesson_id', lessonIds).order('order_index')
          if (qData) {
            for (const q of qData) {
              if (!questionsMap[q.lesson_id]) questionsMap[q.lesson_id] = []
              questionsMap[q.lesson_id].push({ ...q, _key: q.id })
            }
          }
        }
        setLessons(lessonData.map(l => ({
          ...l, _key: Math.random(),
          questions: questionsMap[l.id] || [],
        })))
      } else {
        scaffoldLessons(off)
      }
    } else {
      scaffoldLessons(off)
    }
    setLoading(false)
  }

  function scaffoldLessons(off) {
    const count = (off?.duration_unit === 'Lessons' && off?.duration_value > 0) ? off.duration_value : 1
    setLessons(Array.from({ length: count }, (_, i) => newLesson(i)))
  }

  // Lesson operations
  function addLesson() {
    setLessons(ls => [...ls, newLesson(ls.length)])
  }
  function removeLesson(idx) {
    setLessons(ls => ls.filter((_, i) => i !== idx).map((l, i) => ({ ...l, order_index: i })))
    if (openLessonIdx === idx) setOpenLessonIdx(null)
    else if (openLessonIdx > idx) setOpenLessonIdx(openLessonIdx - 1)
    setMenuOpenIdx(null)
  }
  function updateLesson(idx, field, value) {
    setLessons(ls => ls.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  function duplicateLesson(idx) {
    const src = lessons[idx]
    const dup = { ...src, id: undefined, _key: Math.random(), title: (src.title || '') + ' (copy)', order_index: lessons.length }
    setLessons(ls => [...ls, dup])
    setMenuOpenIdx(null)
  }
  function moveLesson(idx, dir) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= lessons.length) return
    setLessons(ls => {
      const next = [...ls]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next.map((l, i) => ({ ...l, order_index: i }))
    })
    if (openLessonIdx === idx) setOpenLessonIdx(newIdx)
    else if (openLessonIdx === newIdx) setOpenLessonIdx(idx)
    setMenuOpenIdx(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    const coursePayload = {
      offering_id: offeringId,
      delivery_mode: deliveryMode,
      schedule_interval: deliveryMode === 'scheduled' ? parseInt(scheduleInterval) : null,
      schedule_unit: deliveryMode === 'scheduled' ? scheduleUnit : null,
      due_date_mode: dueDateMode,
      expected_completion_days: dueDateMode === 'course' && expectedCompletionDays ? parseInt(expectedCompletionDays) : null,
    }

    let courseId = course?.id
    if (courseId) {
      await supabase.from('courses').update(coursePayload).eq('id', courseId)
    } else {
      const { data } = await supabase.from('courses').insert({ ...coursePayload, organization_id: organizationId }).select().single()
      if (data) { courseId = data.id; setCourse(data) }
    }

    if (courseId) {
      const { data: dbLessons } = await supabase.from('lessons').select('id').eq('course_id', courseId)
      const dbIds = new Set((dbLessons || []).map(l => l.id))
      const uiIds = new Set(lessons.filter(l => l.id).map(l => l.id))
      const toDelete = [...dbIds].filter(id => !uiIds.has(id))
      if (toDelete.length > 0) await supabase.from('lessons').delete().in('id', toDelete)

      // Save all lessons in parallel, then save all questions in parallel
      const savedLessonIds = await Promise.all(lessons.map(async (l, i) => {
        const payload = {
          title: l.title?.trim() || '',
          description: l.description?.trim() || null,
          content: l.content || null,
          video_url: l.video_url?.trim() || null,
          order_index: i,
          due_days_offset: dueDateMode === 'lesson' && l.due_days_offset ? parseInt(l.due_days_offset) : null,
        }
        if (l.id) {
          await supabase.from('lessons').update(payload).eq('id', l.id)
          return l.id
        } else {
          const { data: inserted } = await supabase.from('lessons').insert({ ...payload, course_id: courseId, organization_id: organizationId }).select('id').single()
          return inserted?.id || null
        }
      }))

      // Delete all old questions in one batch, then insert all new ones in one batch
      const validLessonIds = savedLessonIds.filter(Boolean)
      if (validLessonIds.length > 0) {
        await supabase.from('lesson_questions').delete().in('lesson_id', validLessonIds)
      }

      const allQuestionInserts = []
      lessons.forEach((l, i) => {
        const lessonId = savedLessonIds[i]
        if (!lessonId || !l.questions) return
        l.questions
          .filter(q => q.question_text.trim())
          .forEach((q, qi) => {
            allQuestionInserts.push({
              lesson_id: lessonId,
              organization_id: organizationId,
              question_text: q.question_text.trim(),
              question_type: q.question_type,
              options: q.question_type === 'quiz' ? (q.options || []).filter(o => o.text.trim()) : null,
              order_index: qi,
            })
          })
      })
      if (allQuestionInserts.length > 0) {
        await supabase.from('lesson_questions').insert(allQuestionInserts)
      }
    }

    // Reload to get saved IDs, but preserve local content/questions
    const localLessons = [...lessons]
    const { data: freshCourse } = await supabase.from('courses').select('*').eq('offering_id', offeringId).single()
    if (freshCourse) {
      setCourse(freshCourse)
      const [{ data: freshLessons }, { data: qData }] = await Promise.all([
        supabase.from('lessons').select('*').eq('course_id', freshCourse.id).order('order_index'),
        supabase.from('lesson_questions').select('*').eq('organization_id', organizationId).order('order_index'),
      ])
      if (freshLessons) {
        const lessonIds = new Set(freshLessons.map(l => l.id))
        const qMap = {}
        for (const q of (qData || [])) {
          if (!lessonIds.has(q.lesson_id)) continue
          if (!qMap[q.lesson_id]) qMap[q.lesson_id] = []
          qMap[q.lesson_id].push({ ...q, _key: q.id })
        }
        setLessons(freshLessons.map((fl, i) => {
          const local = localLessons[i]
          return {
            ...fl,
            _key: local?._key || Math.random(),
            content: fl.content || local?.content || '',
            video_url: fl.video_url || local?.video_url || '',
            due_days_offset: fl.due_days_offset ?? local?.due_days_offset ?? '',
            questions: qMap[fl.id] || local?.questions || [],
          }
        }))
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
  if (!offering) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Offering not found.</div>

  const openLesson = openLessonIdx !== null ? lessons[openLessonIdx] : null

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={() => navigate('/admin/offerings')}>
          <ArrowLeft size={15} /> Offerings
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={s.title}>Course Builder</h1>
          <p style={s.sub}>{offering.name} — {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</p>
        </div>
        <button style={s.settingsBtn} onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? 'Hide Settings' : 'Course Settings'}
        </button>
        <button style={{ ...s.saveBtn, ...(saved ? s.savedBtn : {}) }} onClick={handleSave} disabled={saving}>
          {saved ? <><Check size={14} strokeWidth={2.5} /> Saved!</> : saving ? 'Saving...' : <><Save size={14} /> Save</>}
        </button>
      </div>

      {/* Collapsible settings */}
      {showSettings && (
        <div style={s.settingsPanel}>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px' }}>
              <h3 style={s.settingLabel}>Delivery Mode</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {DELIVERY_MODES.map(mode => (
                  <button key={mode.value} style={{ ...s.modeCard, ...(deliveryMode === mode.value ? s.modeCardActive : {}) }} onClick={() => setDeliveryMode(mode.value)} type="button">
                    {mode.value === 'all_unlocked' ? <Unlock size={14} color={deliveryMode === mode.value ? '#6366f1' : '#9ca3af'} /> : mode.value === 'scheduled' ? <Clock size={14} color={deliveryMode === mode.value ? '#6366f1' : '#9ca3af'} /> : <RotateCcw size={14} color={deliveryMode === mode.value ? '#6366f1' : '#9ca3af'} />}
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{mode.label}</span>
                  </button>
                ))}
              </div>
              {deliveryMode === 'scheduled' && (
                <div style={s.inlineRow}>
                  <span style={s.inlineLabel}>Every</span>
                  <input style={s.numInput} type="number" min="1" value={scheduleInterval} onChange={e => setScheduleInterval(e.target.value)} />
                  <select style={s.unitSelect} value={scheduleUnit} onChange={e => setScheduleUnit(e.target.value)}>
                    {SCHEDULE_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Due Dates */}
            <div style={{ flex: '1 1 280px' }}>
              <h3 style={s.settingLabel}>Due Dates</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {[
                  { value: 'none', label: 'No Due Dates' },
                  { value: 'course', label: 'Course Deadline' },
                  { value: 'lesson', label: 'Per-Lesson' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    style={{ ...s.modeCard, ...(dueDateMode === opt.value ? s.modeCardActive : {}) }}
                    onClick={() => setDueDateMode(opt.value)}
                    type="button"
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{opt.label}</span>
                  </button>
                ))}
              </div>
              {dueDateMode === 'course' && (
                <div style={s.inlineRow}>
                  <span style={s.inlineLabel}>Complete within</span>
                  <input style={s.numInput} type="number" min="1" value={expectedCompletionDays} onChange={e => setExpectedCompletionDays(e.target.value)} placeholder="e.g. 42" />
                  <span style={s.inlineLabel}>days of enrollment</span>
                </div>
              )}
              {dueDateMode === 'lesson' && (
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0.25rem 0 0' }}>
                  Set due dates for each lesson below in the lesson editor.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main layout: lesson list + editor */}
      <div style={s.main}>
        {/* Lesson list sidebar */}
        <div style={s.lessonList}>
          <div style={s.listHeader}>
            <span style={s.listTitle}>Lessons</span>
            <button style={s.addBtn} onClick={addLesson}><Plus size={14} /> Add</button>
          </div>

          <div style={s.listBody}>
            {lessons.map((lesson, idx) => {
              const isOpen = openLessonIdx === idx
              const hasTitle = lesson.title?.trim()
              const qCount = (lesson.questions || []).length
              const hasVideo = !!lesson.video_url?.trim()
              const hasContent = lesson.content && lesson.content !== '<p></p>' && lesson.content.trim()
              return (
                <div key={lesson._key} style={{ position: 'relative' }}>
                  <button
                    style={{ ...s.lessonItem, ...(isOpen ? s.lessonItemActive : {}) }}
                    onClick={() => setOpenLessonIdx(isOpen ? null : idx)}
                  >
                    <div style={s.lessonNum}>{idx + 1}</div>
                    <div style={s.lessonInfo}>
                      <div style={s.lessonName}>{hasTitle ? lesson.title : `Lesson ${idx + 1}`}</div>
                      <div style={s.lessonMeta}>
                        {!hasTitle && <span style={s.metaTag}>Untitled</span>}
                        {!hasContent && hasTitle && <span style={s.metaTag}>No content</span>}
                        {hasContent && <span style={{ ...s.metaTag, background: '#dcfce7', color: '#16a34a' }}>Has content</span>}
                        {hasVideo && <span style={{ ...s.metaTag, background: '#fef2f2', color: '#dc2626' }}>Video</span>}
                        {qCount > 0 && <span style={{ ...s.metaTag, background: '#fef3c7', color: '#d97706' }}>{qCount} Q</span>}
                      </div>
                    </div>
                    {isOpen ? <ChevronDown size={14} color="#6366f1" /> : <ChevronRight size={14} color="#9ca3af" />}
                  </button>

                  {/* Context menu trigger */}
                  <button
                    style={s.menuBtn}
                    onClick={e => { e.stopPropagation(); setMenuOpenIdx(menuOpenIdx === idx ? null : idx) }}
                  >
                    <MoreVertical size={13} />
                  </button>

                  {/* Context menu dropdown */}
                  {menuOpenIdx === idx && (
                    <div style={s.menuDropdown}>
                      <button style={s.menuItem} onClick={() => moveLesson(idx, -1)} disabled={idx === 0}>
                        <ArrowUp size={13} /> Move Up
                      </button>
                      <button style={s.menuItem} onClick={() => moveLesson(idx, 1)} disabled={idx === lessons.length - 1}>
                        <ArrowDown size={13} /> Move Down
                      </button>
                      <button style={s.menuItem} onClick={() => duplicateLesson(idx)}>
                        <Copy size={13} /> Duplicate
                      </button>
                      <button style={{ ...s.menuItem, color: '#ef4444' }} onClick={() => removeLesson(idx)} disabled={lessons.length === 1}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button style={s.addFullBtn} onClick={addLesson}>
            <Plus size={14} /> Add Lesson
          </button>
        </div>

        {/* Editor panel */}
        <div style={s.editor}>
          {openLesson ? (
            <>
              <div style={s.editorHeader}>
                <div style={{ flex: 1 }}>
                  <div style={s.editorNum}>Lesson {openLessonIdx + 1} of {lessons.length}</div>
                  <input
                    style={s.titleInput}
                    placeholder={`Lesson ${openLessonIdx + 1} title...`}
                    value={openLesson.title || ''}
                    onChange={e => updateLesson(openLessonIdx, 'title', e.target.value)}
                  />
                </div>
                <button style={s.closeEditor} onClick={() => setOpenLessonIdx(null)}><X size={16} /></button>
              </div>

              {/* Video */}
              <div style={s.videoSection}>
                <div style={s.videoHeader}>
                  <Video size={14} color={openLesson.video_url ? '#dc2626' : '#9ca3af'} />
                  <span style={s.videoTitle}>Lesson Video</span>
                  {openLesson.video_url && <span style={s.videoBadge}>Active</span>}
                </div>
                <div style={s.videoInputRow}>
                  <Link size={13} color="#9ca3af" />
                  <input
                    style={s.videoInput}
                    placeholder="Paste a YouTube or Vimeo URL..."
                    value={openLesson.video_url || ''}
                    onChange={e => updateLesson(openLessonIdx, 'video_url', e.target.value)}
                  />
                  {openLesson.video_url && (
                    <button style={s.videoClearBtn} onClick={() => updateLesson(openLessonIdx, 'video_url', '')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                {openLesson.video_url && (() => {
                  const url = openLesson.video_url.trim()
                  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
                  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
                  const embedUrl = ytMatch
                    ? `https://www.youtube.com/embed/${ytMatch[1]}`
                    : vimeoMatch
                      ? `https://player.vimeo.com/video/${vimeoMatch[1]}`
                      : null
                  if (!embedUrl) return <div style={s.videoHint}>Paste a valid YouTube or Vimeo URL to see a preview.</div>
                  return (
                    <div style={s.videoPreview}>
                      <iframe
                        src={embedUrl}
                        style={s.videoIframe}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Lesson video preview"
                      />
                    </div>
                  )
                })()}
              </div>

              {/* Per-lesson due date */}
              {dueDateMode === 'lesson' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Due:</span>
                  <input
                    style={{ ...s.numInput, width: 70 }}
                    type="number"
                    min="1"
                    value={openLesson.due_days_offset || ''}
                    onChange={e => updateLesson(openLessonIdx, 'due_days_offset', e.target.value)}
                    placeholder="—"
                  />
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>days after enrollment</span>
                </div>
              )}

              {/* Rich text editor */}
              <div style={s.editorContent}>
                <RichTextEditor
                  key={openLesson._key}
                  content={openLesson.content || ''}
                  onChange={html => updateLesson(openLessonIdx, 'content', html)}
                  placeholder="Write your lesson content here... Use the toolbar for formatting, or embed a video."
                />
              </div>

              {/* Questions */}
              <LessonQuestionEditor
                questions={openLesson.questions || []}
                onChange={qs => updateLesson(openLessonIdx, 'questions', qs)}
              />
            </>
          ) : (
            <div style={s.emptyEditor}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.15 }}>&#128221;</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Select a lesson</div>
              <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Click a lesson from the list to start editing</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { maxWidth: '100%' },
  header: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
  back: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 5, background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', flexShrink: 0, cursor: 'pointer' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.1rem' },
  sub: { color: '#9ca3af', fontSize: '0.78rem' },
  settingsBtn: { padding: '0.45rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 5, background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#374151', cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 5, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' },
  savedBtn: { background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' },

  settingsPanel: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow)', padding: '1.25rem', marginBottom: '1rem', border: '1px solid #f3f4f6' },
  settingLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' },
  modeCard: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', cursor: 'pointer' },
  modeCardActive: { border: '1.5px solid #6366f1', background: '#eef2ff' },
  inlineRow: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  inlineLabel: { fontSize: '0.82rem', color: '#374151', fontWeight: 500 },
  numInput: { width: 56, padding: '0.35rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 5, fontSize: '0.82rem', textAlign: 'center', color: '#111827' },
  unitSelect: { padding: '0.35rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 5, fontSize: '0.82rem', color: '#374151', backgroundColor: '#fff' },
  toggle: { display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' },
  toggleTrack: { width: 40, height: 22, borderRadius: 49, position: 'relative', transition: 'background 0.15s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, width: 18, height: 18, backgroundColor: '#fff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.15s' },

  // Main layout
  main: { display: 'flex', gap: '1rem', alignItems: 'flex-start' },

  // Lesson list
  lessonList: { width: 280, flexShrink: 0, backgroundColor: '#fff', borderRadius: 6, border: '1px solid #f3f4f6', boxShadow: 'var(--shadow)', overflow: 'hidden', position: 'sticky', top: '1rem' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.85rem', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' },
  listTitle: { fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.25rem 0.55rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  listBody: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' },
  lessonItem: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
    padding: '0.6rem 0.85rem', paddingRight: '2rem',
    border: 'none', borderBottom: '1px solid #f9fafb', background: '#fff',
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
  },
  lessonItemActive: { background: '#eef2ff', borderLeftColor: '#6366f1' },
  lessonNum: { width: 22, height: 22, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', flexShrink: 0 },
  lessonInfo: { flex: 1, minWidth: 0 },
  lessonName: { fontSize: '0.82rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lessonMeta: { display: 'flex', gap: '0.3rem', marginTop: '0.15rem', flexWrap: 'wrap' },
  metaTag: { fontSize: '0.62rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: 3, background: '#f3f4f6', color: '#9ca3af' },
  menuBtn: { position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 3, border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  menuDropdown: { position: 'absolute', right: '0.4rem', top: '100%', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden', width: 140 },
  menuItem: { display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', padding: '0.45rem 0.65rem', border: 'none', background: 'none', fontSize: '0.78rem', fontWeight: 500, color: '#374151', cursor: 'pointer', textAlign: 'left' },
  addFullBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', width: '100%', padding: '0.6rem', border: 'none', borderTop: '1px solid #f3f4f6', background: '#f9fafb', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },

  // Editor
  editor: { flex: 1, minWidth: 0, backgroundColor: '#fff', borderRadius: 6, border: '1px solid #f3f4f6', boxShadow: 'var(--shadow)', overflow: 'hidden' },
  editorHeader: { display: 'flex', gap: '0.5rem', padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' },
  editorNum: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' },
  titleInput: { width: '100%', boxSizing: 'border-box', padding: '0.3rem 0', border: 'none', borderBottom: '2px solid #e5e7eb', fontSize: '1.1rem', fontWeight: 700, color: '#111827', background: 'transparent', outline: 'none', marginBottom: '0.3rem' },
  closeEditor: { width: 28, height: 28, borderRadius: 5, border: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', flexShrink: 0 },
  // Video
  videoSection: { padding: '0.75rem 1.25rem', borderBottom: '1px solid #f3f4f6' },
  videoHeader: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' },
  videoTitle: { fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  videoBadge: { fontSize: '0.6rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', borderRadius: 99, padding: '0.1rem 0.4rem' },
  videoInputRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: 5, background: '#f9fafb' },
  videoInput: { flex: 1, border: 'none', outline: 'none', fontSize: '0.82rem', color: '#111827', background: 'transparent' },
  videoClearBtn: { width: 20, height: 20, borderRadius: 3, border: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', cursor: 'pointer', flexShrink: 0 },
  videoHint: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.4rem', fontStyle: 'italic' },
  videoPreview: { marginTop: '0.5rem', borderRadius: 6, overflow: 'hidden', background: '#000', aspectRatio: '16/9' },
  videoIframe: { width: '100%', height: '100%', border: 'none', display: 'block' },

  editorContent: { padding: '0.75rem 1.25rem' },
  emptyEditor: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', minHeight: 400, textAlign: 'center' },
}
