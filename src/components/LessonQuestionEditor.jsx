import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, HelpCircle, MessageSquare } from 'lucide-react'

export default function LessonQuestionEditor({ questions, onChange }) {
  function addQuestion(type) {
    const q = {
      _key: Math.random(),
      question_text: '',
      question_type: type,
      options: type === 'quiz' ? [{ text: '', is_correct: true }, { text: '', is_correct: false }] : null,
      order_index: questions.length,
    }
    onChange([...questions, q])
  }

  function updateQuestion(idx, field, value) {
    onChange(questions.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  function removeQuestion(idx) {
    onChange(questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order_index: i })))
  }

  function addOption(qIdx) {
    onChange(questions.map((q, i) => {
      if (i !== qIdx) return q
      return { ...q, options: [...(q.options || []), { text: '', is_correct: false }] }
    }))
  }

  function updateOption(qIdx, oIdx, field, value) {
    onChange(questions.map((q, i) => {
      if (i !== qIdx) return q
      const opts = (q.options || []).map((o, j) => {
        if (j !== oIdx) return field === 'is_correct' && value ? { ...o, is_correct: false } : o
        return { ...o, [field]: value }
      })
      return { ...q, options: opts }
    }))
  }

  function removeOption(qIdx, oIdx) {
    onChange(questions.map((q, i) => {
      if (i !== qIdx) return q
      return { ...q, options: (q.options || []).filter((_, j) => j !== oIdx) }
    }))
  }

  return (
    <div style={s.section}>
      <div style={s.header}>
        <HelpCircle size={14} color="#f59e0b" />
        <span style={s.headerTitle}>Questions</span>
        <span style={s.count}>{questions.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
          <button style={s.addTypeBtn} onClick={() => addQuestion('quiz')}>
            <Check size={12} /> Quiz
          </button>
          <button style={{ ...s.addTypeBtn, ...s.addResponseBtn }} onClick={() => addQuestion('response')}>
            <MessageSquare size={12} /> Response
          </button>
        </div>
      </div>

      {questions.length === 0 && (
        <p style={s.hint}>No questions yet. Add a <strong>Quiz</strong> question (has correct answers) or a <strong>Response</strong> question (open-ended feedback).</p>
      )}

      <div style={s.questionList}>
        {questions.map((q, qIdx) => (
          <div key={q._key || q.id || qIdx} style={s.questionCard}>
            <div style={s.questionHeader}>
              <span style={{ ...s.typeBadge, ...(q.question_type === 'quiz' ? s.quizBadge : s.responseBadge) }}>
                {q.question_type === 'quiz' ? 'Quiz' : 'Response'}
              </span>
              <span style={s.qNum}>Q{qIdx + 1}</span>
              <div style={{ flex: 1 }} />
              <select
                style={s.typeSelect}
                value={q.question_type}
                onChange={e => {
                  const newType = e.target.value
                  updateQuestion(qIdx, 'question_type', newType)
                  if (newType === 'quiz' && !q.options) {
                    updateQuestion(qIdx, 'options', [{ text: '', is_correct: true }, { text: '', is_correct: false }])
                  }
                  if (newType === 'response') {
                    updateQuestion(qIdx, 'options', null)
                  }
                }}
              >
                <option value="quiz">Quiz (right/wrong)</option>
                <option value="response">Response (feedback)</option>
              </select>
              <button style={s.deleteQBtn} onClick={() => removeQuestion(qIdx)}><Trash2 size={12} /></button>
            </div>

            <textarea
              style={s.questionInput}
              placeholder="Type your question here..."
              value={q.question_text}
              onChange={e => updateQuestion(qIdx, 'question_text', e.target.value)}
              rows={2}
            />

            {q.question_type === 'quiz' && (
              <div style={s.optionsList}>
                <div style={s.optionsLabel}>Answer options — mark the correct answer</div>
                {(q.options || []).map((opt, oIdx) => (
                  <div key={oIdx} style={s.optionRow}>
                    <button
                      style={{ ...s.correctToggle, ...(opt.is_correct ? s.correctActive : {}) }}
                      onClick={() => updateOption(qIdx, oIdx, 'is_correct', true)}
                      title={opt.is_correct ? 'Correct answer' : 'Mark as correct'}
                    >
                      {opt.is_correct ? <Check size={12} color="#fff" strokeWidth={3} /> : <span style={s.correctEmpty} />}
                    </button>
                    <input
                      style={s.optionInput}
                      placeholder={`Option ${oIdx + 1}...`}
                      value={opt.text}
                      onChange={e => updateOption(qIdx, oIdx, 'text', e.target.value)}
                    />
                    <button
                      style={s.optionDel}
                      onClick={() => removeOption(qIdx, oIdx)}
                      disabled={(q.options || []).length <= 2}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <button style={s.addOptionBtn} onClick={() => addOption(qIdx)}>
                  <Plus size={12} /> Add Option
                </button>
              </div>
            )}

            {q.question_type === 'response' && (
              <div style={s.responseHint}>
                <MessageSquare size={13} color="#6366f1" />
                <span>Mentees will see a text area to type their response. No right or wrong answers.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  section: { borderTop: '1px solid #f3f4f6', padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  header: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  headerTitle: { fontSize: '0.72rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' },
  count: { fontSize: '0.62rem', fontWeight: 700, color: '#d97706', background: '#fef3c7', borderRadius: 99, padding: '0.1rem 0.4rem' },
  hint: { fontSize: '0.78rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 },
  addTypeBtn: {
    display: 'flex', alignItems: 'center', gap: '0.2rem',
    padding: '0.2rem 0.5rem', border: '1px solid #86efac', borderRadius: 4,
    background: '#f0fdf4', color: '#16a34a', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
  },
  addResponseBtn: { border: '1px solid #c7d2fe', background: '#eef2ff', color: '#6366f1' },
  questionList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  questionCard: {
    border: '1.5px solid #fde68a', borderRadius: 6, background: '#fffbeb', padding: '0.75rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  questionHeader: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  typeBadge: { fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' },
  quizBadge: { background: '#dcfce7', color: '#16a34a' },
  responseBadge: { background: '#e0e7ff', color: '#4338ca' },
  qNum: { fontSize: '0.68rem', fontWeight: 700, color: '#92400e' },
  typeSelect: { padding: '0.2rem 0.4rem', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.72rem', color: '#374151', background: '#fff', cursor: 'pointer' },
  deleteQBtn: { width: 22, height: 22, borderRadius: 3, border: '1px solid #fecaca', background: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', cursor: 'pointer' },
  questionInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.5rem 0.65rem', border: '1.5px solid #fde68a', borderRadius: 5,
    fontSize: '0.88rem', color: '#111827', background: '#fff', resize: 'vertical',
    fontFamily: 'inherit', lineHeight: 1.5,
  },
  optionsList: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  optionsLabel: { fontSize: '0.68rem', fontWeight: 600, color: '#92400e', marginBottom: '0.15rem' },
  optionRow: { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  correctToggle: {
    width: 22, height: 22, borderRadius: '50%', border: '2px solid #d1d5db',
    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0, transition: 'all 0.1s',
  },
  correctActive: { background: '#16a34a', border: '2px solid #16a34a' },
  correctEmpty: { width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb' },
  optionInput: {
    flex: 1, padding: '0.35rem 0.55rem', border: '1px solid #e5e7eb', borderRadius: 4,
    fontSize: '0.82rem', color: '#111827', background: '#fff', boxSizing: 'border-box',
  },
  optionDel: {
    width: 20, height: 20, borderRadius: 3, border: '1px solid #e5e7eb', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
    cursor: 'pointer', flexShrink: 0,
  },
  addOptionBtn: {
    display: 'flex', alignItems: 'center', gap: '0.2rem', alignSelf: 'flex-start',
    padding: '0.2rem 0.5rem', border: '1px dashed #d1d5db', borderRadius: 4,
    background: 'transparent', color: '#6b7280', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
    marginTop: '0.15rem',
  },
  responseHint: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 0.65rem', background: '#eef2ff', borderRadius: 5,
    border: '1px solid #c7d2fe', fontSize: '0.78rem', color: '#4338ca',
  },
}
