import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Shield, ArrowRight, CheckCircle, Building2, ArrowLeft, Loader2 } from 'lucide-react'

export default function GetStarted() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedPlan = searchParams.get('plan') || 'free'

  const [step, setStep] = useState(1) // 1 = org info, 2 = admin account
  const [plans, setPlans] = useState([])
  const [form, setForm] = useState({
    org_name: '',
    org_slug: '',
    plan: preselectedPlan,
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
  })
  const [slugStatus, setSlugStatus] = useState(null) // null | 'checking' | 'available' | 'taken'
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const slugTimerRef = useRef(null)

  // Load pricing plans
  useEffect(() => {
    async function loadPlans() {
      const { data } = await supabase.rpc('get_public_pricing')
      if (data && data.length > 0) setPlans(data)
    }
    loadPlans()
  }, [])

  // Debounced slug availability check
  function checkSlugAvailability(slug) {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current)
    if (!slug || slug.length < 2) {
      setSlugStatus(null)
      return
    }
    setSlugStatus('checking')
    slugTimerRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc('get_org_by_slug', { org_slug: slug })
      setSlugStatus(data && data.length > 0 ? 'taken' : 'available')
    }, 400)
  }

  function handleNameChange(value) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm(f => ({ ...f, org_name: value, org_slug: slug }))
    checkSlugAvailability(slug)
  }

  function handleSlugChange(value) {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setForm(f => ({ ...f, org_slug: clean }))
    checkSlugAvailability(clean)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setCreating(true)
    setError(null)

    const res = await supabase.functions.invoke('self-serve-signup', {
      body: {
        org_name: form.org_name,
        org_slug: form.org_slug,
        plan: form.plan,
        admin_email: form.admin_email,
        admin_first_name: form.admin_first_name,
        admin_last_name: form.admin_last_name,
      },
    })

    setCreating(false)

    if (res.error) {
      setError(res.error.message || 'Something went wrong')
      return
    }

    const data = res.data
    if (data?.error) {
      setError(data.error)
      return
    }

    setSuccess(data)
  }

  // Inject spinner animation
  useEffect(() => {
    if (!document.getElementById('spin-keyframes')) {
      const style = document.createElement('style')
      style.id = 'spin-keyframes'
      style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
      document.head.appendChild(style)
    }
  }, [])

  // ── Success state ──────────────────────────────────────────────────

  if (success) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.successIcon}>
            <CheckCircle size={48} color="#6366f1" />
          </div>
          <h1 style={s.successTitle}>Request submitted</h1>
          <p style={s.successText}>
            Your request to create <strong>{form.org_name}</strong> is being reviewed. We'll send a confirmation email to <strong>{form.admin_email}</strong> once your organization is ready.
          </p>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
            This usually takes less than 24 hours.
          </p>
          <a href="https://mentordesk.app" style={{ ...s.btn, textDecoration: 'none', marginTop: '1.5rem' }}>
            Back to MentorDesk
          </a>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <a href="https://mentordesk.app" style={s.backLink}>
            <ArrowLeft size={14} /> Back to MentorDesk
          </a>
          <div style={s.logoRow}>
            <div style={s.logoMark}>
              <Shield size={20} color="#fff" />
            </div>
            <span style={s.logoText}>Mentor<span style={{ color: '#6366f1' }}>Desk</span></span>
          </div>
          <h1 style={s.title}>Create your organization</h1>
          <p style={s.subtitle}>
            {step === 1 ? 'Choose a plan and name your organization.' : 'Set up your admin account.'}
          </p>
          <div style={s.steps}>
            <div style={{ ...s.stepDot, ...(step >= 1 ? s.stepActive : {}) }}>1</div>
            <div style={s.stepLine} />
            <div style={{ ...s.stepDot, ...(step >= 2 ? s.stepActive : {}) }}>2</div>
          </div>
        </div>

        <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); setStep(2) }}>
          {step === 1 && (
            <>
              {/* Plan selection */}
              {plans.length > 0 && (
                <div style={s.field}>
                  <label style={s.label}>Plan</label>
                  <div style={s.planGrid}>
                    {plans.map(p => {
                      const isSelected = form.plan === p.plan_key
                      const priceText = p.price ? `$${Math.round(p.price)}/mo` : p.plan_key === 'enterprise' ? 'Custom' : 'Free'
                      return (
                        <button
                          key={p.plan_key}
                          type="button"
                          style={{ ...s.planCard, ...(isSelected ? s.planSelected : {}) }}
                          onClick={() => setForm(f => ({ ...f, plan: p.plan_key }))}
                        >
                          <div style={s.planName}>{p.label}</div>
                          <div style={s.planPrice}>{priceText}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={s.field}>
                <label style={s.label}>Organization name</label>
                <input
                  style={s.input}
                  type="text"
                  placeholder="Acme Coaching"
                  value={form.org_name}
                  onChange={e => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={s.field}>
                <label style={s.label}>Organization URL</label>
                <div style={{
                  ...s.slugRow,
                  borderColor: slugStatus === 'taken' ? '#fca5a5' : slugStatus === 'available' ? '#86efac' : '#e2e8f0',
                }}>
                  <span style={s.slugPrefix}>app.mentordesk.app/</span>
                  <input
                    style={{ ...s.input, ...s.slugInput }}
                    type="text"
                    placeholder="acme-coaching"
                    value={form.org_slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    required
                  />
                  {slugStatus === 'checking' && (
                    <span style={s.slugStatusIcon}><Loader2 size={14} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} /></span>
                  )}
                  {slugStatus === 'available' && (
                    <span style={s.slugStatusIcon}><CheckCircle size={14} color="#16a34a" /></span>
                  )}
                </div>
                {slugStatus === 'taken' && (
                  <span style={{ ...s.hint, color: '#dc2626' }}>This URL is already taken. Try a different one.</span>
                )}
                {slugStatus === 'available' && (
                  <span style={{ ...s.hint, color: '#16a34a' }}>Available</span>
                )}
                {!slugStatus && (
                  <span style={s.hint}>This is how your team will access their login page</span>
                )}
              </div>

              <button style={s.btn} type="submit" disabled={!form.org_name || !form.org_slug || slugStatus !== 'available'}>
                Continue <ArrowRight size={16} style={{ marginLeft: 4 }} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={s.fieldRow}>
                <div style={s.field}>
                  <label style={s.label}>First name</label>
                  <input
                    style={s.input}
                    type="text"
                    value={form.admin_first_name}
                    onChange={e => setForm(f => ({ ...f, admin_first_name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Last name</label>
                  <input
                    style={s.input}
                    type="text"
                    value={form.admin_last_name}
                    onChange={e => setForm(f => ({ ...f, admin_last_name: e.target.value }))}
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Email address</label>
                <input
                  style={s.input}
                  type="email"
                  placeholder="you@example.com"
                  value={form.admin_email}
                  onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))}
                  required
                />
              </div>

              {error && <div style={s.errorBox}>{error}</div>}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" style={s.btnBack} onClick={() => setStep(1)}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button style={{ ...s.btn, flex: 1 }} type="submit" disabled={creating}>
                  {creating ? 'Creating your organization...' : 'Create Organization'}
                </button>
              </div>

              <p style={s.terms}>
                By creating an account you agree to our terms of service.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(180deg, #fafbff 0%, #f1f5f9 100%)',
    padding: '2rem',
  },
  card: {
    width: '100%', maxWidth: 520,
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    padding: '2.5rem',
  },
  header: {
    marginBottom: '2rem',
  },
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500,
    textDecoration: 'none', marginBottom: '1.25rem',
  },
  logoRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    marginBottom: '1.25rem',
  },
  logoMark: {
    width: 36, height: 36, borderRadius: 8,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: {
    fontSize: '1.15rem', fontWeight: 800, color: '#0f172a',
    letterSpacing: '-0.03em',
  },
  title: {
    fontSize: '1.5rem', fontWeight: 800, color: '#0f172a',
    letterSpacing: '-0.02em', marginBottom: '0.35rem',
  },
  subtitle: {
    fontSize: '0.95rem', color: '#64748b', lineHeight: 1.5,
  },
  steps: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    marginTop: '1.25rem',
  },
  stepDot: {
    width: 28, height: 28, borderRadius: '50%',
    background: '#f1f5f9', color: '#94a3b8',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.78rem', fontWeight: 700,
    transition: 'all 0.2s',
  },
  stepActive: {
    background: '#6366f1', color: '#fff',
  },
  stepLine: {
    flex: 1, height: 2, background: '#e2e8f0', borderRadius: 1,
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: '0.35rem',
    marginBottom: '1.1rem',
  },
  fieldRow: {
    display: 'flex', gap: '0.75rem',
  },
  label: {
    fontSize: '0.85rem', fontWeight: 600, color: '#374151',
  },
  input: {
    padding: '0.7rem 0.9rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.92rem', color: '#0f172a',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
  },
  hint: {
    fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem',
  },
  slugRow: {
    display: 'flex', alignItems: 'center',
    border: '1.5px solid #e2e8f0', borderRadius: 8,
    overflow: 'hidden',
  },
  slugPrefix: {
    padding: '0.7rem 0 0.7rem 0.9rem',
    fontSize: '0.88rem', color: '#94a3b8', fontWeight: 500,
    background: '#f8fafc',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  slugInput: {
    border: 'none', borderRadius: 0,
    paddingLeft: '0.25rem',
    flex: 1,
  },
  slugStatusIcon: {
    display: 'flex', alignItems: 'center',
    paddingRight: '0.75rem',
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '0.5rem',
  },
  planCard: {
    padding: '0.75rem 0.5rem',
    background: '#f8fafc',
    border: '2px solid #e2e8f0',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'border-color 0.15s, background 0.15s',
  },
  planSelected: {
    borderColor: '#6366f1',
    background: '#eef2ff',
  },
  planName: {
    fontSize: '0.85rem', fontWeight: 700, color: '#0f172a',
    marginBottom: '0.15rem',
  },
  planPrice: {
    fontSize: '0.75rem', color: '#64748b', fontWeight: 600,
  },
  btn: {
    width: '100%',
    padding: '0.8rem 1.5rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', borderRadius: 10,
    fontSize: '0.95rem', fontWeight: 600,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
    transition: 'opacity 0.15s',
  },
  btnBack: {
    padding: '0.8rem 1rem',
    background: '#f1f5f9', color: '#64748b',
    border: 'none', borderRadius: 10,
    fontSize: '0.88rem', fontWeight: 600,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.3rem',
  },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '0.7rem 1rem',
    color: '#dc2626', fontSize: '0.85rem',
    marginBottom: '1rem',
  },
  terms: {
    fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center',
    marginTop: '1rem',
  },
  // Success state
  successIcon: { textAlign: 'center', marginBottom: '1rem' },
  successTitle: {
    fontSize: '1.5rem', fontWeight: 800, color: '#0f172a',
    textAlign: 'center', marginBottom: '0.5rem',
  },
  successText: {
    fontSize: '0.95rem', color: '#64748b', textAlign: 'center',
    lineHeight: 1.6, marginBottom: '1.5rem',
  },
  urlBox: {
    background: '#f8fafc', borderRadius: 10,
    border: '1px solid #e2e8f0',
    padding: '1rem 1.25rem', marginBottom: '1.5rem',
    textAlign: 'center',
  },
  urlLabel: {
    display: 'block', fontSize: '0.72rem', fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '0.35rem',
  },
  urlValue: {
    fontSize: '1rem', fontWeight: 700, color: '#6366f1',
  },
}
