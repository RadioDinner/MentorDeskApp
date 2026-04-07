import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Bug, X, Send, CheckCircle, AlertCircle, MessageSquare, Mail } from 'lucide-react'
export default function BugReportButton({ inline }) {
  const location = useLocation()
  const organizationId = null // Super admin app has no org context
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(null) // null | 'form' | 'email'
  const [trying, setTrying] = useState('')
  const [happened, setHappened] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  function handleOpen() {
    setOpen(true)
    setMode(null)
    setResult(null)
  }

  async function handleSend() {
    if (sending) return
    setSending(true)
    setResult(null)

    const { error } = await supabase.from('bug_reports').insert({
      screen: location.pathname,
      trying: trying || null,
      happened: happened || null,
      browser: navigator.userAgent,
      organization_id: organizationId,
    })

    setSending(false)

    if (error) {
      setResult({ type: 'error', text: 'Failed to submit report. Please try again.' })
    } else {
      setResult({ type: 'success', text: 'Report submitted! An administrator will review it.' })
      setTimeout(() => {
        setResult(null)
        setOpen(false)
        setMode(null)
        setTrying('')
        setHappened('')
      }, 2500)
    }
  }

  function handleEmailReport() {
    const subject = encodeURIComponent(`Bug Report: ${location.pathname}`)
    const body = encodeURIComponent(
      `Page: ${location.pathname}\nBrowser: ${navigator.userAgent}\n\nWhat I was trying to do:\n\n\nWhat happened:\n\n`
    )
    window.open(`mailto:support@mentordesk.app?subject=${subject}&body=${body}`, '_self')
    setOpen(false)
    setMode(null)
  }

  // Inline sidebar button (no floating FAB)
  const trigger = inline ? (
    <button style={s.sidebarBtn} onClick={handleOpen}>
      <Bug size={14} strokeWidth={2} />
      <span>Report a Problem</span>
    </button>
  ) : (
    <button style={s.fab} onClick={handleOpen} title="Report a problem">
      <Bug size={14} strokeWidth={2} />
      <span>Report a Problem</span>
    </button>
  )

  return (
    <>
      {trigger}

      {open && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) { setOpen(false); setMode(null) } }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <div style={s.modalTitleRow}>
                <div style={s.bugIcon}><Bug size={14} color="#6366f1" strokeWidth={2} /></div>
                <span style={s.modalTitle}>Report a Problem</span>
              </div>
              <button style={s.closeBtn} onClick={() => { setOpen(false); setMode(null) }}><X size={16} /></button>
            </div>

            {!mode ? (
              <div style={s.modalBody}>
                <p style={s.modePrompt}>How would you like to report the issue?</p>
                <div style={s.modeGrid}>
                  <button style={s.modeCard} onClick={() => setMode('form')}>
                    <div style={{ ...s.modeIcon, backgroundColor: '#eef2ff' }}>
                      <MessageSquare size={20} color="#6366f1" />
                    </div>
                    <div style={s.modeCardTitle}>Submit a Report</div>
                    <div style={s.modeCardDesc}>Describe the issue and we'll route it to an administrator.</div>
                  </button>
                  <button style={s.modeCard} onClick={handleEmailReport}>
                    <div style={{ ...s.modeIcon, backgroundColor: '#f0fdfa' }}>
                      <Mail size={20} color="#0d9488" />
                    </div>
                    <div style={s.modeCardTitle}>Send an Email</div>
                    <div style={s.modeCardDesc}>Opens your email client with a pre-filled bug report template.</div>
                  </button>
                </div>
                <div style={s.screenPill}>
                  <span style={s.screenLabel}>Screen:</span>
                  <code style={s.screenPath}>{location.pathname}</code>
                </div>
              </div>
            ) : (
              <div style={s.modalBody}>
                <div style={s.screenPill}>
                  <span style={s.screenLabel}>Screen:</span>
                  <code style={s.screenPath}>{location.pathname}</code>
                </div>

                <div style={s.field}>
                  <label style={s.label}>What were you trying to do?</label>
                  <textarea
                    style={s.textarea}
                    placeholder="e.g. I was trying to add a new arrangement…"
                    value={trying}
                    onChange={e => setTrying(e.target.value)}
                    rows={3}
                  />
                </div>

                <div style={s.field}>
                  <label style={s.label}>What happened?</label>
                  <textarea
                    style={s.textarea}
                    placeholder="e.g. I got an error saying 'column not found'…"
                    value={happened}
                    onChange={e => setHappened(e.target.value)}
                    rows={3}
                  />
                </div>

                {result && (
                  <div style={result.type === 'success' ? s.successMsg : s.errorMsg}>
                    {result.type === 'success'
                      ? <CheckCircle size={14} style={{ flexShrink: 0 }} />
                      : <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    }
                    {result.text}
                  </div>
                )}

                <p style={s.note}>
                  Your report will be sent to a company administrator for review.
                </p>
              </div>
            )}

            <div style={s.modalFooter}>
              {mode === 'form' && (
                <button style={s.backBtn} onClick={() => setMode(null)}>Back</button>
              )}
              <div style={{ flex: 1 }} />
              <button style={s.cancelBtn} onClick={() => { setOpen(false); setMode(null) }}>Cancel</button>
              {mode === 'form' && (
                <button style={s.sendBtn} onClick={handleSend} disabled={sending || result?.type === 'success'}>
                  {sending ? 'Submitting…' : result?.type === 'success' ? '✓ Submitted' : <><Send size={13} strokeWidth={2.5} /> Submit Report</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s = {
  // Sidebar inline button style
  sidebarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: 'rgba(156,163,175,0.8)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.12s',
  },
  // Legacy floating button (for non-admin layouts)
  fab: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.45rem 0.85rem',
    background: 'rgba(17, 24, 39, 0.82)',
    backdropFilter: 'blur(8px)',
    color: 'rgba(209, 213, 219, 0.9)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 99,
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    zIndex: 50,
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    transition: 'background 0.15s',
    letterSpacing: '0.01em',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '1rem',
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.1rem 1.25rem',
    borderBottom: '1px solid #f3f4f6',
  },
  modalTitleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  bugIcon: {
    width: 28, height: 28, borderRadius: 6,
    background: '#eef2ff', border: '1px solid #c7d2fe',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#111827' },
  closeBtn: {
    background: 'none', border: 'none', color: '#9ca3af',
    cursor: 'pointer', padding: 4, borderRadius: 5,
    display: 'flex', alignItems: 'center',
  },
  modalBody: { padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  modePrompt: { fontSize: '0.875rem', color: '#6b7280', margin: 0 },
  modeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  modeCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    padding: '1.1rem 0.75rem', background: '#fff', border: '1.5px solid #e5e7eb',
    borderRadius: 10, cursor: 'pointer', textAlign: 'center',
    transition: 'border-color 0.12s, box-shadow 0.12s',
  },
  modeIcon: { width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modeCardTitle: { fontWeight: 700, color: '#111827', fontSize: '0.85rem' },
  modeCardDesc: { fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 },
  screenPill: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.4rem 0.75rem', background: '#f9fafb',
    borderRadius: 6, border: '1px solid #e5e7eb',
  },
  screenLabel: { fontSize: '0.73rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' },
  screenPath: { fontSize: '0.8rem', color: '#374151', fontFamily: 'monospace' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.78rem', fontWeight: 600, color: '#374151' },
  textarea: {
    padding: '0.65rem 0.85rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: 7,
    fontSize: '0.875rem',
    color: '#111827',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  note: { fontSize: '0.73rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 },
  successMsg: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 0.85rem', borderRadius: 7,
    backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
    color: '#15803d', fontSize: '0.82rem', fontWeight: 500,
  },
  errorMsg: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 0.85rem', borderRadius: 7,
    backgroundColor: '#fef2f2', border: '1px solid #fecaca',
    color: '#dc2626', fontSize: '0.82rem', fontWeight: 500,
  },
  modalFooter: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6',
  },
  backBtn: {
    padding: '0.55rem 0.85rem', background: 'none',
    border: '1.5px solid #e5e7eb', borderRadius: 7,
    fontSize: '0.85rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '0.55rem 1rem', background: 'none',
    border: '1.5px solid #e5e7eb', borderRadius: 7,
    fontSize: '0.85rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer',
  },
  sendBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.55rem 1.1rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', borderRadius: 7,
    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
  },
}
