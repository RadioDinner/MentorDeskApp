import { useState } from 'react'
import { CheckCircle, ChevronLeft, Play, FileText, HelpCircle, MessageSquare } from 'lucide-react'

function getEmbedUrl(url) {
  if (!url) return null
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return null
}

export default function LessonViewer({
  lesson,
  questions = [],
  responses = {},
  onSubmitResponse,
  onMarkComplete,
  isCompleted,
  onBack,
  onFeedback,
}) {
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState({})
  const embedUrl = getEmbedUrl(lesson.video_url)

  function handleQuizSelect(questionId, optionIndex) {
    if (submitted[questionId]) return
    setAnswers(a => ({ ...a, [questionId]: optionIndex }))
  }

  async function handleSubmitAnswer(question) {
    const qid = question.id
    if (question.question_type === 'quiz') {
      const selected = answers[qid]
      if (selected == null) return
      const isCorrect = question.options?.[selected]?.is_correct || false
      await onSubmitResponse(qid, { selected_option: selected, is_correct: isCorrect })
    } else {
      const text = answers[qid]
      if (!text?.trim()) return
      await onSubmitResponse(qid, { response_text: text.trim() })
    }
    setSubmitted(s => ({ ...s, [qid]: true }))
  }

  const hasContent = lesson.content && lesson.content !== '<p></p>'

  return (
    <div style={st.container}>
      <button style={st.backBtn} onClick={onBack}>
        <ChevronLeft size={16} /> Back to Courses
      </button>

      <div style={st.header}>
        <div style={st.lessonBadge}>Lesson {lesson.order_index + 1}</div>
        <h1 style={st.title}>{lesson.title}</h1>
        {lesson.description && <p style={st.desc}>{lesson.description}</p>}
        {isCompleted && (
          <span style={st.completedTag}><CheckCircle size={14} /> Completed</span>
        )}
      </div>

      {/* Video */}
      {embedUrl && (
        <div style={st.videoSection}>
          <div style={st.videoWrap}>
            <iframe
              src={embedUrl}
              style={st.videoIframe}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Lesson video"
            />
          </div>
        </div>
      )}

      {/* Lesson content */}
      {hasContent && (
        <div style={st.contentSection}>
          <div style={st.sectionHeader}>
            <FileText size={15} color="#6366f1" />
            <span>Lesson Content</span>
          </div>
          <div
            style={st.richContent}
            dangerouslySetInnerHTML={{ __html: lesson.content }}
          />
        </div>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <div style={st.questionsSection}>
          <div style={st.sectionHeader}>
            <HelpCircle size={15} color="#f59e0b" />
            <span>Questions</span>
          </div>
          {questions.map((q, qi) => {
            const existing = responses[q.id]
            const isQuiz = q.question_type === 'quiz'
            const wasSubmitted = !!existing || submitted[q.id]

            return (
              <div key={q.id} style={st.questionCard}>
                <div style={st.questionNum}>Q{qi + 1}</div>
                <div style={st.questionText}>{q.question_text}</div>

                {isQuiz ? (
                  <div style={st.optionsList}>
                    {(q.options || []).map((opt, oi) => {
                      const isSelected = existing
                        ? existing.selected_option === oi
                        : answers[q.id] === oi
                      const showResult = wasSubmitted
                      const isCorrect = opt.is_correct

                      return (
                        <button
                          key={oi}
                          style={{
                            ...st.optionBtn,
                            ...(isSelected ? st.optionSelected : {}),
                            ...(showResult && isCorrect ? st.optionCorrect : {}),
                            ...(showResult && isSelected && !isCorrect ? st.optionWrong : {}),
                            cursor: wasSubmitted ? 'default' : 'pointer',
                          }}
                          onClick={() => handleQuizSelect(q.id, oi)}
                          disabled={wasSubmitted}
                        >
                          <span style={st.optionLetter}>{String.fromCharCode(65 + oi)}</span>
                          <span>{opt.text}</span>
                          {showResult && isCorrect && <CheckCircle size={14} color="#16a34a" style={{ marginLeft: 'auto' }} />}
                        </button>
                      )
                    })}
                    {wasSubmitted && existing?.is_correct && (
                      <div style={st.resultCorrect}>Correct!</div>
                    )}
                    {wasSubmitted && existing && !existing.is_correct && (
                      <div style={st.resultWrong}>Not quite — see the correct answer above.</div>
                    )}
                  </div>
                ) : (
                  <div style={st.responseArea}>
                    {wasSubmitted ? (
                      <div style={st.submittedResponse}>
                        <div style={st.submittedLabel}>Your response:</div>
                        <div style={st.submittedText}>
                          {existing?.response_text || answers[q.id]}
                        </div>
                      </div>
                    ) : (
                      <textarea
                        style={st.responseInput}
                        placeholder="Type your response here..."
                        value={answers[q.id] || ''}
                        onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                        rows={3}
                      />
                    )}
                  </div>
                )}

                {!wasSubmitted && (
                  <button
                    style={st.submitBtn}
                    onClick={() => handleSubmitAnswer(q)}
                    disabled={isQuiz ? answers[q.id] == null : !answers[q.id]?.trim()}
                  >
                    Submit Answer
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Actions bar */}
      <div style={st.completeSection}>
        {!isCompleted && onMarkComplete && (
          <button style={st.completeBtn} onClick={onMarkComplete}>
            <CheckCircle size={16} />
            Mark Lesson Complete
          </button>
        )}
        {onFeedback && (
          <button style={st.feedbackBtn} onClick={onFeedback}>
            <MessageSquare size={14} />
            Send Feedback
          </button>
        )}
      </div>
    </div>
  )
}

const st = {
  container: { maxWidth: 780, margin: '0 auto' },
  backBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#6366f1', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '1rem' },
  header: { marginBottom: '1.5rem' },
  lessonBadge: { fontSize: '0.72rem', fontWeight: 700, color: '#6366f1', backgroundColor: '#eef2ff', padding: '0.2rem 0.6rem', borderRadius: 79, display: 'inline-block', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.3rem' },
  desc: { fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.6 },
  completedTag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4', padding: '0.3rem 0.75rem', borderRadius: 79, marginTop: '0.5rem' },
  videoSection: { marginBottom: '1.5rem' },
  videoWrap: { position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  videoIframe: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' },
  contentSection: { backgroundColor: '#fff', borderRadius: 10, border: '1px solid #f3f4f6', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f3f4f6' },
  richContent: { fontSize: '0.9rem', color: '#374151', lineHeight: 1.7 },
  questionsSection: { backgroundColor: '#fff', borderRadius: 10, border: '1px solid #f3f4f6', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  questionCard: { padding: '1rem 0', borderBottom: '1px solid #f3f4f6' },
  questionNum: { fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', backgroundColor: '#fffbeb', padding: '0.15rem 0.5rem', borderRadius: 4, display: 'inline-block', marginBottom: '0.4rem' },
  questionText: { fontWeight: 600, color: '#111827', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.5 },
  optionsList: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  optionBtn: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: '0.875rem', color: '#374151', textAlign: 'left', width: '100%' },
  optionSelected: { borderColor: '#6366f1', backgroundColor: '#eef2ff', fontWeight: 600 },
  optionCorrect: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  optionWrong: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  optionLetter: { width: 24, height: 24, borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 },
  resultCorrect: { marginTop: '0.5rem', fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 },
  resultWrong: { marginTop: '0.5rem', fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 },
  responseArea: { marginBottom: '0.5rem' },
  responseInput: { width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', color: '#111827', resize: 'vertical', boxSizing: 'border-box', backgroundColor: '#fff' },
  submittedResponse: { padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' },
  submittedLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' },
  submittedText: { fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 },
  submitBtn: { marginTop: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' },
  completeSection: { display: 'flex', justifyContent: 'center', gap: '0.75rem', padding: '1.5rem 0', flexWrap: 'wrap' },
  completeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' },
  feedbackBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', background: 'none', border: '1.5px solid #c7d2fe', color: '#6366f1', borderRadius: 9, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
}
