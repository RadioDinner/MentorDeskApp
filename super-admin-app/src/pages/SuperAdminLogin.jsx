import { useState } from 'react'
import { Crown, ArrowRight, Shield } from 'lucide-react'
import { superAdminLogin } from '../superAdminClient'

export default function SuperAdminLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await superAdminLogin(email, password)

    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return
    }

    setLoading(false)
    onLoginSuccess(result.email)
  }

  return (
    <div style={s.page}>
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.logoMark}>
            <Crown size={28} color="#fff" />
          </div>
          <h1 style={s.brand}>MentorDesk</h1>
          <p style={s.tagline}>Platform Administration</p>
          <div style={s.infoBlock}>
            <Shield size={16} color="#fca5a5" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={s.infoText}>
              This is the super admin portal. Access is restricted to authorized platform administrators only.
            </p>
          </div>
        </div>
        <div style={s.leftBlob1} />
        <div style={s.leftBlob2} />
      </div>

      <div style={s.right}>
        <div style={s.formCard}>
          <div style={s.formHeader}>
            <h2 style={s.formTitle}>Platform Login</h2>
            <p style={s.formSubtitle}>Sign in with your super admin credentials</p>
          </div>

          <form onSubmit={handleLogin} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <input
                style={s.input}
                type="email"
                placeholder="admin@mentordesk.app"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <input
                style={s.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={s.errorBox}>
                <span>{error}</span>
              </div>
            )}

            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Authenticating…' : (
                <>Sign In <ArrowRight size={16} style={{ marginLeft: 4 }} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
  },
  left: {
    width: '42%',
    background: 'linear-gradient(145deg, #1a0a0a 0%, #3b1515 50%, #1a0a0a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  leftInner: {
    position: 'relative',
    zIndex: 2,
    padding: '3rem',
    maxWidth: 380,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 4,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.5rem',
    boxShadow: '0 8px 24px rgba(220,38,38,0.4)',
  },
  brand: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#f9fafb',
    letterSpacing: '-0.03em',
    marginBottom: '0.5rem',
  },
  tagline: {
    fontSize: '1.05rem',
    color: '#fca5a5',
    lineHeight: 1.6,
    marginBottom: '2.5rem',
    fontWeight: 500,
  },
  infoBlock: {
    display: 'flex',
    gap: '0.75rem',
    borderLeft: '3px solid rgba(220,38,38,0.5)',
    paddingLeft: '1.25rem',
  },
  infoText: {
    color: '#d1d5db',
    fontSize: '0.88rem',
    lineHeight: 1.6,
  },
  leftBlob1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'rgba(220,38,38,0.08)',
    top: -80,
    right: -80,
    zIndex: 1,
  },
  leftBlob2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    background: 'rgba(239,68,68,0.1)',
    bottom: 60,
    left: -60,
    zIndex: 1,
  },
  right: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },
  formCard: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  formHeader: {
    marginBottom: '1.75rem',
  },
  formTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '0.4rem',
    letterSpacing: '-0.02em',
  },
  formSubtitle: {
    color: '#64748b',
    fontSize: '0.95rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    padding: '0.75rem 1rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: 6,
    fontSize: '0.95rem',
    color: '#0f172a',
    backgroundColor: '#fff',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  btn: {
    marginTop: '0.5rem',
    padding: '0.8rem 1.5rem',
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
    transition: 'opacity 0.15s',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    padding: '0.7rem 1rem',
    color: '#dc2626',
    fontSize: '0.875rem',
  },
}
