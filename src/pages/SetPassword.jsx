import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { KeyRound, CheckCircle, Eye, EyeOff } from 'lucide-react'

export default function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) { setError(updateError.message); return }
    setDone(true)
    setTimeout(() => navigate('/login'), 3000)
  }

  return (
    <div style={p.page}>
      <div style={p.card}>
        <div style={p.iconWrap}>
          <KeyRound size={28} color="#6366f1" strokeWidth={1.8} />
        </div>

        {done ? (
          <div style={p.successWrap}>
            <CheckCircle size={40} color="#10b981" strokeWidth={1.5} />
            <h2 style={p.title}>Password updated!</h2>
            <p style={p.sub}>You'll be redirected to login in a moment…</p>
          </div>
        ) : (
          <>
            <h2 style={p.title}>Set your password</h2>
            <p style={p.sub}>Choose a new password for your account.</p>

            {error && <div style={p.error}>{error}</div>}

            <form onSubmit={handleSubmit} style={p.form}>
              <div style={p.field}>
                <label style={p.label}>New Password</label>
                <div style={p.pwWrap}>
                  <input
                    style={p.input}
                    type={showPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    style={p.eyeBtn}
                    onClick={() => setShowPw(v => !v)}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={p.field}>
                <label style={p.label}>Confirm Password</label>
                <input
                  style={p.input}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>

              {password && (
                <div style={p.strength}>
                  <StrengthBar password={password} />
                </div>
              )}

              <button type="submit" style={p.btn} disabled={saving}>
                {saving ? 'Saving…' : 'Set Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function StrengthBar({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981']

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 99,
            backgroundColor: i <= score ? colors[score] : '#e5e7eb',
            transition: 'background-color 0.2s',
          }} />
        ))}
      </div>
      {score > 0 && (
        <span style={{ fontSize: '0.72rem', color: colors[score], fontWeight: 600 }}>
          {labels[score]}
        </span>
      )}
    </div>
  )
}

const p = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
    padding: '2rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 15,
    boxShadow: '0 8px 40px rgba(99,102,241,0.12)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 12,
    background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: '0.25rem',
  },
  title: { fontSize: '1.35rem', fontWeight: 700, color: '#111827', margin: 0, textAlign: 'center' },
  sub: { fontSize: '0.875rem', color: '#9ca3af', margin: 0, textAlign: 'center' },
  error: {
    width: '100%', boxSizing: 'border-box',
    backgroundColor: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '0.75rem 1rem',
    color: '#dc2626', fontSize: '0.875rem',
  },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#374151' },
  pwWrap: { position: 'relative' },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 1rem',
    border: '1.5px solid #e5e7eb', borderRadius: 8,
    fontSize: '0.95rem', color: '#111827', backgroundColor: '#f9fafb',
  },
  eyeBtn: {
    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2,
  },
  strength: { marginTop: '-0.25rem' },
  btn: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
    marginTop: '0.25rem',
  },
  successWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1rem 0' },
}
