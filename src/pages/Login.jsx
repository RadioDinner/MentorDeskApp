import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Shield, ArrowRight, CheckCircle, Search, Building2 } from 'lucide-react'
import { applyTheme } from '../theme'

export default function Login() {
  const [searchParams] = useSearchParams()
  const { slug } = useParams()
  const navigate = useNavigate()
  const isNewAccount = searchParams.get('welcome') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [companyName, setCompanyName] = useState('MentorDesk')
  const [tagline, setTagline] = useState('Empowering mentors.\nTransforming lives.')
  const [companyLogo, setCompanyLogo] = useState('')
  const [orgNotFound, setOrgNotFound] = useState(false)
  const [noOrg, setNoOrg] = useState(false)
  const [signupAllowed, setSignupAllowed] = useState(false)

  // Org search state (for /login without slug)
  const [orgQuery, setOrgQuery] = useState('')
  const [orgResults, setOrgResults] = useState([])
  const [orgSearching, setOrgSearching] = useState(false)
  const [showOrgResults, setShowOrgResults] = useState(false)
  const searchTimerRef = useRef(null)
  const searchWrapRef = useRef(null)

  // Wrong-org suggestion state
  const [wrongOrgSuggestion, setWrongOrgSuggestion] = useState(null)
  // No-account state
  const [noAccountOrg, setNoAccountOrg] = useState(null)

  useEffect(() => {
    // Reset state when slug changes (e.g. navigating from /:slug/login to /login)
    setOrgNotFound(false)
    setNoOrg(false)
    setError(null)
    setWrongOrgSuggestion(null)
    setNoAccountOrg(null)

    async function loadBranding() {
      if (!slug) {
        setNoOrg(true)
        document.title = 'MentorDesk | Find your organization'
        return
      }

      const normalizedSlug = slug.toLowerCase()
      const { data: orgData } = await supabase.rpc('get_org_by_slug', { org_slug: normalizedSlug })
      if (!orgData || orgData.length === 0) {
        setOrgNotFound(true)
        return
      }

      const orgId = orgData[0].id
      // Check signup policy
      const { data: policyData } = await supabase.rpc('get_org_signup_policy', { org_slug: normalizedSlug })
      if (policyData && policyData.length > 0 && policyData[0].policy !== 'closed') {
        setSignupAllowed(true)
      }
      const { data } = await supabase.rpc('get_org_branding', { org_id: orgId })
      if (!data || data.length === 0) return
      const get = k => data.find(s => s.key === k)?.value || ''
      if (get('company_name')) setCompanyName(get('company_name'))
      if (get('company_name')) document.title = `${get('company_name')} | Login`
      if (get('company_tagline')) setTagline(get('company_tagline'))
      if (get('company_logo')) setCompanyLogo(get('company_logo'))
      applyTheme({
        primary: get('primary_color') || undefined,
        secondary: get('secondary_color') || undefined,
        highlight: get('highlight_color') || undefined,
      })
    }
    loadBranding()
  }, [slug])

  // Close org search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowOrgResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced org search
  function handleOrgSearch(value) {
    setOrgQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value || value.length < 2) {
      setOrgResults([])
      setShowOrgResults(false)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      setOrgSearching(true)
      const { data } = await supabase.rpc('search_organizations', { query: value })
      setOrgResults(data || [])
      setShowOrgResults(true)
      setOrgSearching(false)
    }, 300)
  }

  function selectOrg(org) {
    setShowOrgResults(false)
    setOrgQuery('')
    navigate(`/${org.slug}/login`)
  }

  // Forgot-password flow
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setWrongOrgSuggestion(null)
    setNoAccountOrg(null)

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    // Login succeeded — check if user belongs to this org
    if (slug && loginData?.user) {
      const { data: memberships } = await supabase.rpc('get_user_org_memberships')

      if (memberships && memberships.length > 0) {
        const belongsHere = memberships.some(m => m.org_slug === slug?.toLowerCase())
        if (!belongsHere) {
          // User authenticated but doesn't belong to this org
          await supabase.auth.signOut()
          setWrongOrgSuggestion(memberships)
          setLoading(false)
          return
        }
      } else {
        // User has no org memberships at all
        await supabase.auth.signOut()
        setNoAccountOrg(slug)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    // Auth state change listener in App.jsx handles navigation
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetLoading(true)
    setResetError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setResetLoading(false)
    if (error) {
      setResetError(error.message)
    } else {
      setResetSent(true)
    }
  }

  // ── Org not found page ──────────────────────────────────────────────────

  if (orgNotFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Shield size={48} color="#94a3b8" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>Organization not found</h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6 }}>
            The organization <strong>"{slug}"</strong> doesn't exist or is no longer active. Please check the URL and try again.
          </p>
          <button
            style={{ ...s.btn, marginTop: '1.5rem', display: 'inline-flex' }}
            onClick={() => navigate('/login')}
          >
            Find your organization <ArrowRight size={16} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>
    )
  }

  // ── Generic /login — org finder ─────────────────────────────────────────

  if (noOrg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 50%, #1e293b 100%)' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: '2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: 4, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Shield size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.03em', marginBottom: '0.75rem' }}>MentorDesk</h1>
          <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Find your organization to sign in.
          </p>

          {/* Org search */}
          <div ref={searchWrapRef} style={{ position: 'relative', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '0.85rem 1rem 0.85rem 2.75rem',
                  border: '1.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, fontSize: '0.95rem',
                  color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.06)',
                  outline: 'none',
                }}
                type="text"
                placeholder="Search for your organization…"
                value={orgQuery}
                onChange={e => handleOrgSearch(e.target.value)}
                onFocus={() => orgResults.length > 0 && setShowOrgResults(true)}
              />
            </div>

            {showOrgResults && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, overflow: 'hidden', zIndex: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
              }}>
                {orgSearching ? (
                  <div style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>Searching…</div>
                ) : orgResults.length === 0 ? (
                  <div style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>No organizations found.</div>
                ) : (
                  orgResults.map(org => (
                    <button
                      key={org.slug}
                      onClick={() => selectOrg(org)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        width: '100%', padding: '0.75rem 1rem',
                        background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        color: '#f1f5f9', fontSize: '0.9rem', fontWeight: 500,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Building2 size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{org.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{window.location.host}/{org.slug}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
              You can also go directly to your login page:<br />
              <code style={{ color: '#818cf8', fontSize: '0.9rem', fontWeight: 600 }}>
                {window.location.origin}/<em>your-org</em>/login
              </code>
            </p>
          </div>

          <p style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
            Don't know your organization? Contact your mentor or administrator.
          </p>
        </div>
      </div>
    )
  }

  // ── Org-specific login page ─────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Left panel */}
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.logoMark}>
            {companyLogo
              ? <img src={companyLogo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }} />
              : <Shield size={28} color="#fff" />
            }
          </div>
          <h1 style={s.brand}>{companyName}</h1>
          <p style={{ ...s.tagline, whiteSpace: 'pre-line' }}>{tagline}</p>
          <div style={s.quoteBlock}>
            <p style={s.quote}>
              "Iron sharpens iron, and one man sharpens another."
            </p>
            <p style={s.quoteRef}>— Proverbs 27:17</p>
          </div>
        </div>
        <div style={s.leftBlob1} />
        <div style={s.leftBlob2} />
      </div>

      {/* Right panel */}
      <div style={s.right}>
        <div style={s.formCard}>

          {/* Welcome banner for newly confirmed accounts */}
          {isNewAccount && !resetMode && (
            <div style={s.welcomeBanner}>
              <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0 }} />
              <div>
                <div style={s.welcomeBannerTitle}>Account confirmed!</div>
                <div style={s.welcomeBannerText}>
                  Click <strong>Forgot Password?</strong> below to set your password and log in for the first time.
                </div>
              </div>
            </div>
          )}

          {/* Wrong org suggestion */}
          {wrongOrgSuggestion && (
            <div style={s.warningBox}>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Wrong organization</div>
              <p style={{ margin: 0, lineHeight: 1.5, marginBottom: '0.65rem' }}>
                Your account isn't associated with <strong>{companyName}</strong>. Did you mean to sign in to:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {wrongOrgSuggestion.map(m => (
                  <button
                    key={m.org_slug}
                    onClick={() => navigate(`/${m.org_slug}/login`)}
                    style={s.suggestionBtn}
                  >
                    <Building2 size={14} />
                    <span style={{ fontWeight: 600 }}>{m.org_name}</span>
                    <ArrowRight size={13} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No account in any org */}
          {noAccountOrg && (
            <div style={s.warningBox}>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>No account found</div>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Your credentials are valid but you don't have an account set up with any organization. Please contact your mentor or administrator to have your account configured.
              </p>
            </div>
          )}

          {!resetMode ? (
            <>
              <div style={s.formHeader}>
                <h2 style={s.formTitle}>Welcome back</h2>
                <p style={s.formSubtitle}>Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleLogin} style={s.form}>
                <div style={s.field}>
                  <label style={s.label}>Email address</label>
                  <input
                    style={s.input}
                    type="email"
                    placeholder="you@example.com"
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
                  {loading ? 'Signing in…' : (
                    <>Sign In <ArrowRight size={16} style={{ marginLeft: 4 }} /></>
                  )}
                </button>
              </form>

              <button style={s.forgotBtn} onClick={() => { setResetMode(true); setResetEmail(email); setResetError(null); setResetSent(false) }}>
                Forgot Password?
              </button>

              {signupAllowed && (
                <button style={{ ...s.forgotBtn, color: '#3b82f6' }} onClick={() => navigate(`/${slug}/signup`)}>
                  Don't have an account? Sign up →
                </button>
              )}

              <button style={{ ...s.forgotBtn, color: '#94a3b8', fontWeight: 500 }} onClick={() => navigate('/login')}>
                Not your organization? Find yours →
              </button>
            </>
          ) : (
            <>
              <div style={s.formHeader}>
                <h2 style={s.formTitle}>{resetSent ? 'Check your inbox' : 'Reset your password'}</h2>
                <p style={s.formSubtitle}>
                  {resetSent
                    ? `We've sent a password reset link to ${resetEmail}.`
                    : 'Enter your email and we\'ll send you a link to set your password.'}
                </p>
              </div>

              {!resetSent ? (
                <form onSubmit={handleResetPassword} style={s.form}>
                  <div style={s.field}>
                    <label style={s.label}>Email address</label>
                    <input
                      style={s.input}
                      type="email"
                      placeholder="you@example.com"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  {resetError && (
                    <div style={s.errorBox}>{resetError}</div>
                  )}

                  <button style={s.btn} type="submit" disabled={resetLoading}>
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              ) : (
                <div style={s.resetSentBox}>
                  <CheckCircle size={36} color="#16a34a" />
                  <p style={s.resetSentText}>
                    Click the link in the email to set your password, then come back here to sign in.
                  </p>
                </div>
              )}

              <button style={s.forgotBtn} onClick={() => setResetMode(false)}>
                ← Back to sign in
              </button>
            </>
          )}

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
    background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 50%, #1e293b 100%)',
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
    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.5rem',
    boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
  },
  brand: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-0.03em',
    marginBottom: '0.75rem',
  },
  tagline: {
    fontSize: '1.05rem',
    color: '#94a3b8',
    lineHeight: 1.6,
    marginBottom: '2.5rem',
  },
  quoteBlock: {
    borderLeft: '3px solid rgba(59,130,246,0.5)',
    paddingLeft: '1.25rem',
  },
  quote: {
    color: '#cbd5e1',
    fontStyle: 'italic',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    marginBottom: '0.4rem',
  },
  quoteRef: {
    color: '#64748b',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  leftBlob1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'rgba(59,130,246,0.08)',
    top: -80,
    right: -80,
    zIndex: 1,
  },
  leftBlob2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    background: 'rgba(99,102,241,0.1)',
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
  welcomeBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem 1.1rem',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 4,
    marginBottom: '1.25rem',
  },
  welcomeBannerTitle: {
    fontWeight: 700,
    color: '#15803d',
    fontSize: '0.875rem',
    marginBottom: '0.2rem',
  },
  welcomeBannerText: {
    color: '#166534',
    fontSize: '0.82rem',
    lineHeight: 1.5,
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 6,
    padding: '1rem 1.1rem',
    color: '#92400e',
    fontSize: '0.85rem',
    marginBottom: '1.25rem',
  },
  suggestionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: '#fff',
    border: '1.5px solid #fde68a',
    borderRadius: 6,
    color: '#92400e',
    fontSize: '0.85rem',
    cursor: 'pointer',
    textAlign: 'left',
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
    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
    transition: 'opacity 0.15s',
  },
  forgotBtn: {
    marginTop: '1rem',
    background: 'none',
    border: 'none',
    color: '#6366f1',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0.25rem 0',
    textAlign: 'left',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    padding: '0.7rem 1rem',
    color: '#dc2626',
    fontSize: '0.875rem',
  },
  resetSentBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1.5rem',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 4,
    textAlign: 'center',
  },
  resetSentText: {
    color: '#15803d',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    margin: 0,
  },
}
