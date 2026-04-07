import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Shield, ArrowRight, CheckCircle, ArrowLeft, UserPlus } from 'lucide-react'
import { applyTheme } from '../theme'

export default function Signup() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [orgId, setOrgId] = useState(null)
  const [orgName, setOrgName] = useState('')
  const [policy, setPolicy] = useState(null) // null = loading, 'closed' | 'approval' | 'open'
  const [companyLogo, setCompanyLogo] = useState('')
  const [pageLoading, setPageLoading] = useState(true)

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', message: '',
  })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    async function load() {
      if (!slug) { setPageLoading(false); return }

      // Get signup policy
      const { data: policyData } = await supabase.rpc('get_org_signup_policy', { org_slug: slug })
      if (!policyData || policyData.length === 0) {
        setPolicy('not_found')
        setPageLoading(false)
        return
      }

      const org = policyData[0]
      setOrgId(org.org_id)
      setOrgName(org.org_name)
      setPolicy(org.policy)

      // Load branding
      const { data: branding } = await supabase.rpc('get_org_branding', { org_id: org.org_id })
      if (branding) {
        const get = k => branding.find(s => s.key === k)?.value || ''
        if (get('company_logo')) setCompanyLogo(get('company_logo'))
        applyTheme({
          primary: get('primary_color') || undefined,
          secondary: get('secondary_color') || undefined,
          highlight: get('highlight_color') || undefined,
        })
      }
      setPageLoading(false)
    }
    load()
  }, [slug])

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  // ── Approval flow: submit a request ─────────────────────────────────────
  async function handleRequestAccess(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('signup_requests').insert({
      organization_id: orgId,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email.toLowerCase().trim(),
      phone: form.phone || null,
      message: form.message || null,
    })

    setSaving(false)
    if (err) {
      if (err.message.includes('duplicate') || err.message.includes('unique')) {
        setError('A request with this email address is already pending.')
      } else {
        setError(err.message)
      }
    } else {
      setSuccess('request')
    }
  }

  // ── Open flow: create account immediately ───────────────────────────────
  async function handleOpenSignup(e) {
    e.preventDefault()
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    setError(null)

    // Create auth user
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: form.email.toLowerCase().trim(),
      password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          organization_id: orgId,
        },
      },
    })

    if (signupErr) {
      setSaving(false)
      setError(signupErr.message)
      return
    }

    // Create mentee record
    const { data: menteeData } = await supabase.from('mentees').insert({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email.toLowerCase().trim(),
      phone: form.phone || null,
      organization_id: orgId,
      status: 'Lead',
    }).select('id').single()

    // Create user_roles entry if we have a user ID
    if (signupData?.user?.id && menteeData?.id) {
      await supabase.from('user_roles').upsert({
        user_id: signupData.user.id,
        role: 'mentee',
        entity_id: menteeData.id,
        organization_id: orgId,
      }, { onConflict: 'user_id,role,organization_id' })

      await supabase.from('profiles').upsert({
        id: signupData.user.id,
        mentee_id: menteeData.id,
        organization_id: orgId,
      }, { onConflict: 'id' })
    }

    setSaving(false)
    setSuccess('created')
  }

  if (pageLoading) {
    return (
      <div style={st.page}>
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      </div>
    )
  }

  if (!slug || policy === 'not_found') {
    return (
      <div style={st.page}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Shield size={48} color="#94a3b8" style={{ marginBottom: '1rem' }} />
          <h1 style={st.heading}>Organization not found</h1>
          <p style={st.subtext}>Please check the URL and try again.</p>
          <button style={st.linkBtn} onClick={() => navigate('/login')}>← Back to login</button>
        </div>
      </div>
    )
  }

  if (policy === 'closed') {
    return (
      <div style={st.page}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={st.logoWrap}>
            {companyLogo
              ? <img src={companyLogo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }} />
              : <Shield size={28} color="#fff" />
            }
          </div>
          <h1 style={st.heading}>{orgName}</h1>
          <p style={st.subtext}>
            This organization does not accept external signups. Please contact an administrator to have your account created.
          </p>
          <button style={st.linkBtn} onClick={() => navigate(`/${slug}/login`)}>← Back to login</button>
        </div>
      </div>
    )
  }

  // ── Success states ──────────────────────────────────────────────────────

  if (success === 'request') {
    return (
      <div style={st.page}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <CheckCircle size={48} color="#16a34a" style={{ marginBottom: '1rem' }} />
          <h1 style={st.heading}>Request submitted</h1>
          <p style={st.subtext}>
            Your request to join <strong>{orgName}</strong> has been submitted. An administrator will review your request and you'll be notified by email once approved.
          </p>
          <button style={st.linkBtn} onClick={() => navigate(`/${slug}/login`)}>← Back to login</button>
        </div>
      </div>
    )
  }

  if (success === 'created') {
    return (
      <div style={st.page}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <CheckCircle size={48} color="#16a34a" style={{ marginBottom: '1rem' }} />
          <h1 style={st.heading}>Account created!</h1>
          <p style={st.subtext}>
            Your account with <strong>{orgName}</strong> has been created. You may need to confirm your email before logging in.
          </p>
          <button style={{ ...st.primaryBtn, marginTop: '1rem' }} onClick={() => navigate(`/${slug}/login`)}>
            Go to Login <ArrowRight size={16} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>
    )
  }

  // ── Signup form ─────────────────────────────────────────────────────────

  const isApproval = policy === 'approval'

  return (
    <div style={st.formPage}>
      <div style={st.formContainer}>
        <div style={st.logoRow}>
          {companyLogo
            ? <img src={companyLogo} alt="" style={{ height: 32, objectFit: 'contain' }} />
            : <Shield size={24} color="#6366f1" />
          }
          <span style={st.orgLabel}>{orgName}</span>
        </div>

        <div style={st.formHeader}>
          <UserPlus size={20} color="#6366f1" />
          <h1 style={st.formTitle}>{isApproval ? 'Request Access' : 'Create Account'}</h1>
        </div>
        <p style={st.formSub}>
          {isApproval
            ? 'Fill out the form below to request an account. An administrator will review your request.'
            : 'Fill out the form below to create your account.'}
        </p>

        {error && <div style={st.errorBox}>{error}</div>}

        <form onSubmit={isApproval ? handleRequestAccess : handleOpenSignup} style={st.form}>
          <div style={st.row}>
            <div style={st.field}>
              <label style={st.label}>First Name *</label>
              <input style={st.input} name="first_name" value={form.first_name} onChange={handleChange} required />
            </div>
            <div style={st.field}>
              <label style={st.label}>Last Name *</label>
              <input style={st.input} name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
          </div>

          <div style={st.field}>
            <label style={st.label}>Email *</label>
            <input style={st.input} type="email" name="email" value={form.email} onChange={handleChange} required />
          </div>

          <div style={st.field}>
            <label style={st.label}>Phone</label>
            <input style={st.input} type="tel" name="phone" value={form.phone} onChange={handleChange} />
          </div>

          {isApproval && (
            <div style={st.field}>
              <label style={st.label}>Message (optional)</label>
              <textarea
                style={{ ...st.input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
                name="message"
                value={form.message}
                onChange={handleChange}
                placeholder="Let the admin know why you'd like to join…"
              />
            </div>
          )}

          {!isApproval && (
            <div style={st.field}>
              <label style={st.label}>Password *</label>
              <input style={st.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
            </div>
          )}

          <button style={st.primaryBtn} type="submit" disabled={saving}>
            {saving ? 'Submitting…' : isApproval ? 'Submit Request' : 'Create Account'}
          </button>
        </form>

        <button style={st.backBtn} onClick={() => navigate(`/${slug}/login`)}>
          <ArrowLeft size={14} /> Back to login
        </button>
      </div>
    </div>
  )
}

const st = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' },
  heading: { fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' },
  subtext: { color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6 },
  logoWrap: { width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' },
  linkBtn: { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', marginTop: '1.5rem' },
  formPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: '2rem' },
  formContainer: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 12, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' },
  logoRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #f3f4f6' },
  orgLabel: { fontSize: '0.9rem', fontWeight: 700, color: '#111827' },
  formHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' },
  formTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' },
  formSub: { color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.78rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.9rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  primaryBtn: { padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', marginTop: '0.25rem' },
  backBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '1.25rem', padding: 0 },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.7rem 1rem', color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.5rem' },
}
