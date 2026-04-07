import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Settings, DollarSign, Save, RotateCcw, Users, UserCheck, Users2, Heart, Package, ChevronDown, ChevronUp, Upload, Image, Palette, Plug, Zap, Video, Calendar } from 'lucide-react'

const LIMIT_FIELDS = [
  { key: 'mentors', label: 'Mentors', icon: UserCheck },
  { key: 'mentees', label: 'Mentees', icon: Users },
  { key: 'staff', label: 'Staff', icon: Users2 },
  { key: 'assistant_mentors', label: 'Assistant Mentors', icon: Heart },
  { key: 'offerings', label: 'Offerings', icon: Package },
]

const FEATURE_FIELDS = [
  { key: 'billing', label: 'Billing' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'courses', label: 'Courses' },
  { key: 'arrangements', label: 'Arrangements' },
  { key: 'integrations', label: 'Integrations' },
]

const INTEGRATION_FIELDS = [
  { key: 'integration_zapier', label: 'Zapier', description: 'Automate workflows with third-party apps' },
  { key: 'integration_zoom', label: 'Zoom Meetings', description: 'Schedule and launch Zoom meetings' },
  { key: 'integration_teams', label: 'Teams Meetings', description: 'Schedule and launch Microsoft Teams meetings' },
  { key: 'integration_google_calendar', label: 'Google Calendar', description: 'Sync sessions and events to Google Calendar' },
]

const PLAN_ORDER = ['free', 'starter', 'pro', 'enterprise']

const PLAN_COLORS = {
  free: { bg: '#f1f5f9', border: '#e2e8f0', accent: '#64748b' },
  starter: { bg: '#eff6ff', border: '#bfdbfe', accent: '#3b82f6' },
  pro: { bg: '#f5f3ff', border: '#ddd6fe', accent: '#7c3aed' },
  enterprise: { bg: '#fffbeb', border: '#fde68a', accent: '#d97706' },
}

export default function SuperAdminSettings() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [expandedPlan, setExpandedPlan] = useState('free')
  const [orgStats, setOrgStats] = useState({})

  // Branding state
  const [branding, setBranding] = useState({
    platform_logo: '',
    platform_logo_horizontal: '',
    default_primary_color: '#6366f1',
    default_secondary_color: '#8b5cf6',
    default_highlight_color: '#f59e0b',
    superadmin_primary_color: '#dc2626',
    superadmin_secondary_color: '#ef4444',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [hLogoFile, setHLogoFile] = useState(null)
  const [hLogoPreview, setHLogoPreview] = useState(null)
  const logoRef = useRef()
  const hLogoRef = useRef()
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [brandingSuccess, setBrandingSuccess] = useState(null)

  useEffect(() => { loadPricing(); loadOrgStats(); loadBranding() }, [])

  async function loadBranding() {
    const { data } = await supabase.from('platform_settings').select('key, value')
    if (data) {
      const get = key => data.find(r => r.key === key)?.value || ''
      setBranding(b => ({
        ...b,
        platform_logo: get('platform_logo'),
        platform_logo_horizontal: get('platform_logo_horizontal'),
        default_primary_color: get('default_primary_color') || '#6366f1',
        default_secondary_color: get('default_secondary_color') || '#8b5cf6',
        default_highlight_color: get('default_highlight_color') || '#f59e0b',
        superadmin_primary_color: get('superadmin_primary_color') || '#dc2626',
        superadmin_secondary_color: get('superadmin_secondary_color') || '#ef4444',
      }))
      if (get('platform_logo')) setLogoPreview(get('platform_logo'))
      if (get('platform_logo_horizontal')) setHLogoPreview(get('platform_logo_horizontal'))
    }
  }

  async function handleSaveBranding() {
    setBrandingSaving(true)
    setBrandingSuccess(null)
    setError(null)

    let logoUrl = branding.platform_logo
    let hLogoUrl = branding.platform_logo_horizontal

    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `platform/logo.${ext}`
      await supabase.storage.from('avatars').upload(path, logoFile, { upsert: true, contentType: logoFile.type })
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      logoUrl = `${publicUrl}?t=${Date.now()}`
    }
    if (hLogoFile) {
      const ext = hLogoFile.name.split('.').pop()
      const path = `platform/logo-horizontal.${ext}`
      await supabase.storage.from('avatars').upload(path, hLogoFile, { upsert: true, contentType: hLogoFile.type })
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      hLogoUrl = `${publicUrl}?t=${Date.now()}`
    }

    const upserts = [
      { key: 'platform_logo', value: logoUrl },
      { key: 'platform_logo_horizontal', value: hLogoUrl },
      { key: 'default_primary_color', value: branding.default_primary_color },
      { key: 'default_secondary_color', value: branding.default_secondary_color },
      { key: 'default_highlight_color', value: branding.default_highlight_color },
      { key: 'superadmin_primary_color', value: branding.superadmin_primary_color },
      { key: 'superadmin_secondary_color', value: branding.superadmin_secondary_color },
    ].map(u => ({ ...u, updated_at: new Date().toISOString() }))

    const { error: err } = await supabase.from('platform_settings').upsert(upserts, { onConflict: 'key' })
    if (err) setError(err.message)
    else {
      setBranding(b => ({ ...b, platform_logo: logoUrl, platform_logo_horizontal: hLogoUrl }))
      setLogoFile(null)
      setHLogoFile(null)
      setBrandingSuccess('Branding saved successfully.')
      setTimeout(() => setBrandingSuccess(null), 4000)
    }
    setBrandingSaving(false)
  }

  async function loadPricing() {
    const { data, error: err } = await supabase
      .from('platform_pricing')
      .select('*')
      .order('plan_key')

    if (err || !data || data.length === 0) {
      // Fallback to hardcoded defaults if table doesn't exist yet
      const defaults = {
        free: { plan_key: 'free', label: 'Free', price: null, limits: { mentors: 2, mentees: 5, staff: 2, assistant_mentors: 2, offerings: 1 }, features: { billing: false, invoicing: false, payroll: false, reports: false, courses: false, arrangements: true } },
        starter: { plan_key: 'starter', label: 'Starter', price: 49, limits: { mentors: 10, mentees: 25, staff: 5, assistant_mentors: 10, offerings: 5 }, features: { billing: true, invoicing: true, payroll: false, reports: true, courses: true, arrangements: true } },
        pro: { plan_key: 'pro', label: 'Pro', price: 149, limits: { mentors: 50, mentees: 100, staff: 20, assistant_mentors: 50, offerings: -1 }, features: { billing: true, invoicing: true, payroll: true, reports: true, courses: true, arrangements: true } },
        enterprise: { plan_key: 'enterprise', label: 'Enterprise', price: null, limits: { mentors: -1, mentees: -1, staff: -1, assistant_mentors: -1, offerings: -1 }, features: { billing: true, invoicing: true, payroll: true, reports: true, courses: true, arrangements: true } },
      }
      setPlans(defaults)
    } else {
      const map = {}
      data.forEach(row => {
        map[row.plan_key] = {
          ...row,
          limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : row.limits,
          features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
        }
      })
      setPlans(map)
    }
    setLoading(false)
  }

  async function loadOrgStats() {
    const { data } = await supabase.from('organizations').select('plan')
    if (data) {
      const counts = {}
      data.forEach(o => { counts[o.plan] = (counts[o.plan] || 0) + 1 })
      setOrgStats(counts)
    }
  }

  function updatePlan(planKey, field, value) {
    setPlans(prev => ({
      ...prev,
      [planKey]: { ...prev[planKey], [field]: value },
    }))
  }

  function updateLimit(planKey, limitKey, value) {
    const numVal = value === '' ? 0 : value === '-1' ? -1 : parseInt(value, 10)
    setPlans(prev => ({
      ...prev,
      [planKey]: {
        ...prev[planKey],
        limits: { ...prev[planKey].limits, [limitKey]: isNaN(numVal) ? 0 : numVal },
      },
    }))
  }

  function toggleFeature(planKey, featureKey) {
    setPlans(prev => ({
      ...prev,
      [planKey]: {
        ...prev[planKey],
        features: { ...prev[planKey].features, [featureKey]: !prev[planKey].features[featureKey] },
      },
    }))
  }

  async function handleSaveAll() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const updates = PLAN_ORDER.map(key => {
      const p = plans[key]
      return supabase.from('platform_pricing').upsert({
        plan_key: key,
        label: p.label,
        price: p.price === '' || p.price === null ? null : Number(p.price),
        limits: p.limits,
        features: p.features,
        updated_at: new Date().toISOString(),
      })
    })

    const results = await Promise.all(updates)
    const failed = results.find(r => r.error)

    if (failed) {
      setError(failed.error.message)
    } else {
      setSuccess('Platform pricing updated successfully.')
      setTimeout(() => setSuccess(null), 4000)
    }
    setSaving(false)
  }

  async function handleReset() {
    setLoading(true)
    await loadPricing()
    setSuccess(null)
    setError(null)
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>

  return (
    <div>
      <div style={s.header}>
        <div style={s.headerIcon}>
          <Settings size={24} color="#fff" />
        </div>
        <div>
          <h1 style={s.title}>Plan Settings</h1>
          <p style={s.sub}>Configure pricing, plan limits, and features across the platform</p>
        </div>
      </div>

      {/* Branding */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          <Palette size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Platform Branding
        </h2>

        {brandingSuccess && <div style={s.successBox}>{brandingSuccess}</div>}

        {/* Logos */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <label style={s.label}>Platform Logo</label>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ height: 56, maxWidth: 160, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', padding: '0.25rem 0.5rem', backgroundColor: '#f8fafc' }} />
              : <div style={{ width: 120, height: 56, borderRadius: 6, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}><Image size={20} color="#d1d5db" /></div>
            }
            <button type="button" style={s.resetBtn} onClick={() => logoRef.current?.click()}>
              <Upload size={12} /> Upload
            </button>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) } }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <label style={s.label}>Horizontal / Header Logo</label>
            {hLogoPreview
              ? <img src={hLogoPreview} alt="H-Logo" style={{ height: 56, maxWidth: 220, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', padding: '0.25rem 0.5rem', backgroundColor: '#f8fafc' }} />
              : <div style={{ width: 180, height: 56, borderRadius: 6, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}><Image size={20} color="#d1d5db" /></div>
            }
            <button type="button" style={s.resetBtn} onClick={() => hLogoRef.current?.click()}>
              <Upload size={12} /> Upload
            </button>
            <input ref={hLogoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setHLogoFile(f); setHLogoPreview(URL.createObjectURL(f)) } }} />
          </div>
        </div>

        {/* Default Theme Colors */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={s.sectionLabel}>Default Theme Colors</h4>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>Colors used as the default for new organizations</p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'default_primary_color', label: 'Primary' },
              { key: 'default_secondary_color', label: 'Secondary' },
              { key: 'default_highlight_color', label: 'Highlight' },
            ].map(c => (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ position: 'relative', width: 44, height: 44 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 6, background: branding[c.key], border: '2px solid #e5e7eb', overflow: 'hidden' }}>
                    <input type="color" value={branding[c.key]} onChange={e => setBranding(b => ({ ...b, [c.key]: e.target.value }))} style={{ width: '200%', height: '200%', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-25%, -25%)' }} />
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{branding[c.key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Super Admin Theme Colors */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={s.sectionLabel}>Super Admin Theme Colors</h4>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>Colors used for the super admin dashboard sidebar and accents</p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'superadmin_primary_color', label: 'Primary' },
              { key: 'superadmin_secondary_color', label: 'Secondary' },
            ].map(c => (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ position: 'relative', width: 44, height: 44 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 6, background: branding[c.key], border: '2px solid #e5e7eb', overflow: 'hidden' }}>
                    <input type="color" value={branding[c.key]} onChange={e => setBranding(b => ({ ...b, [c.key]: e.target.value }))} style={{ width: '200%', height: '200%', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-25%, -25%)' }} />
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{branding[c.key]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={s.saveAllBtn} onClick={handleSaveBranding} disabled={brandingSaving}>
            <Save size={14} /> {brandingSaving ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={s.quickStats}>
        {PLAN_ORDER.map(key => {
          const p = plans[key]
          const colors = PLAN_COLORS[key]
          return (
            <div
              key={key}
              style={{ ...s.quickStatCard, background: colors.bg, borderColor: colors.border, cursor: 'pointer' }}
              onClick={() => navigate(`/organizations?plan=${key}`)}
              title={`View ${p.label} organizations`}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.accent }}>{orgStats[key] || 0}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.accent, opacity: 0.8 }}>
                {p.label} orgs
              </div>
            </div>
          )
        })}
      </div>

      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
            <DollarSign size={18} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Plan Pricing & Limits
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Edit pricing, entity limits, and feature availability for each plan tier
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button style={s.resetBtn} onClick={handleReset} disabled={saving}>
            <RotateCcw size={14} /> Reset
          </button>
          <button style={s.saveAllBtn} onClick={handleSaveAll} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}
      {success && <div style={s.successBox}>{success}</div>}

      {/* Plan Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {PLAN_ORDER.map(key => {
          const p = plans[key]
          if (!p) return null
          const colors = PLAN_COLORS[key]
          const isExpanded = expandedPlan === key

          return (
            <div key={key} style={{ ...s.planCard, borderColor: isExpanded ? colors.accent : '#e2e8f0' }}>
              {/* Plan Header - Clickable */}
              <div
                style={s.planHeader}
                onClick={() => setExpandedPlan(isExpanded ? null : key)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ ...s.planDot, background: colors.accent }} />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{p.label}</span>
                    <span style={{ ...s.planBadge, background: colors.bg, color: colors.accent, marginLeft: '0.6rem' }}>
                      {key}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {p.price ? `$${p.price}/mo` : key === 'enterprise' ? 'Custom' : 'Free'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {orgStats[key] || 0} org{(orgStats[key] || 0) !== 1 ? 's' : ''}
                  </span>
                  {isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={s.planBody}>
                  {/* Price & Label */}
                  <div style={s.formRow}>
                    <div style={s.field}>
                      <label style={s.label}>Display Label</label>
                      <input
                        style={s.input}
                        value={p.label}
                        onChange={e => updatePlan(key, 'label', e.target.value)}
                      />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Monthly Price ($)</label>
                      <input
                        style={s.input}
                        type="number"
                        min="0"
                        step="1"
                        value={p.price ?? ''}
                        onChange={e => updatePlan(key, 'price', e.target.value === '' ? null : e.target.value)}
                        placeholder="Leave empty for free/custom"
                      />
                    </div>
                  </div>

                  {/* Entity Limits */}
                  <div style={{ marginTop: '1.25rem' }}>
                    <h4 style={s.sectionLabel}>Entity Limits</h4>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                      Set to -1 for unlimited
                    </p>
                    <div style={s.limitsGrid}>
                      {LIMIT_FIELDS.map(({ key: lk, label: ll, icon: Icon }) => (
                        <div key={lk} style={s.limitItem}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                            <Icon size={13} color="#64748b" />
                            <label style={s.limitLabel}>{ll}</label>
                          </div>
                          <input
                            style={s.limitInput}
                            type="number"
                            min="-1"
                            value={p.limits[lk] ?? 0}
                            onChange={e => updateLimit(key, lk, e.target.value)}
                          />
                          {p.limits[lk] === -1 && (
                            <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600, marginTop: 2 }}>Unlimited</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div style={{ marginTop: '1.25rem' }}>
                    <h4 style={s.sectionLabel}>Feature Access</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.5rem' }}>
                      {FEATURE_FIELDS.map(({ key: fk, label: fl }) => {
                        const enabled = p.features[fk] !== false
                        return (
                          <button
                            key={fk}
                            type="button"
                            onClick={() => toggleFeature(key, fk)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              padding: '0.45rem 0.85rem', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600,
                              border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                              background: enabled ? '#dcfce7' : '#f8fafc',
                              borderColor: enabled ? '#86efac' : '#e2e8f0',
                              color: enabled ? '#16a34a' : '#94a3b8',
                            }}
                          >
                            <div style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: enabled ? '#16a34a' : '#cbd5e1',
                            }} />
                            {fl}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Plan Comparison Overview</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}></th>
                {PLAN_ORDER.map(key => (
                  <th key={key} style={{ ...s.th, textAlign: 'center', color: PLAN_COLORS[key].accent }}>
                    {plans[key]?.label || key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={s.tr}>
                <td style={s.tdLabel}>Price</td>
                {PLAN_ORDER.map(key => (
                  <td key={key} style={s.tdCenter}>
                    {plans[key]?.price ? `$${plans[key].price}/mo` : key === 'enterprise' ? 'Custom' : 'Free'}
                  </td>
                ))}
              </tr>
              {LIMIT_FIELDS.map(({ key: lk, label: ll }) => (
                <tr key={lk} style={s.tr}>
                  <td style={s.tdLabel}>{ll}</td>
                  {PLAN_ORDER.map(key => (
                    <td key={key} style={s.tdCenter}>
                      {plans[key]?.limits[lk] === -1 ? '∞' : plans[key]?.limits[lk] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
              {FEATURE_FIELDS.map(({ key: fk, label: fl }) => (
                <tr key={fk} style={s.tr}>
                  <td style={s.tdLabel}>{fl}</td>
                  {PLAN_ORDER.map(key => (
                    <td key={key} style={{ ...s.tdCenter, color: plans[key]?.features[fk] ? '#16a34a' : '#dc2626' }}>
                      {plans[key]?.features[fk] ? '✓' : '✗'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integrations Module */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          <Plug size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Integrations Module
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>
          Configure which integrations are available per plan. Organizations on plans with "Integrations" enabled can access the individual integrations toggled below.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Integration</th>
                {PLAN_ORDER.map(key => (
                  <th key={key} style={{ ...s.th, textAlign: 'center', color: PLAN_COLORS[key].accent }}>
                    {plans[key]?.label || key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INTEGRATION_FIELDS.map(({ key: ik, label: il, description }) => (
                <tr key={ik} style={s.tr}>
                  <td style={s.tdLabel}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {ik === 'integration_zapier' && <Zap size={14} color="#ff4a00" />}
                      {ik === 'integration_zoom' && <Video size={14} color="#2d8cff" />}
                      {ik === 'integration_teams' && <Video size={14} color="#6264a7" />}
                      {ik === 'integration_google_calendar' && <Calendar size={14} color="#4285f4" />}
                      <div>
                        <div>{il}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8' }}>{description}</div>
                      </div>
                    </div>
                  </td>
                  {PLAN_ORDER.map(key => {
                    const enabled = plans[key]?.features[ik] === true
                    const integrationsEnabled = plans[key]?.features.integrations !== false
                    return (
                      <td key={key} style={{ ...s.tdCenter, padding: '0.6rem 0.85rem' }}>
                        <button
                          type="button"
                          onClick={() => toggleFeature(key, ik)}
                          disabled={!integrationsEnabled}
                          style={{
                            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: integrationsEnabled ? 'pointer' : 'not-allowed',
                            background: !integrationsEnabled ? '#e2e8f0' : enabled ? '#16a34a' : '#cbd5e1',
                            position: 'relative', transition: 'background 0.2s', opacity: integrationsEnabled ? 1 : 0.4,
                          }}
                        >
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 3,
                            left: enabled && integrationsEnabled ? 19 : 3,
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button style={s.saveAllBtn} onClick={handleSaveAll} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' },
  headerIcon: {
    width: 52, height: 52, borderRadius: 8,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
  },
  title: { fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.15rem' },
  sub: { color: '#64748b', fontSize: '0.9rem' },
  quickStats: { display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' },
  quickStatCard: {
    flex: '1 1 100px', padding: '0.85rem 1rem', borderRadius: 8,
    border: '1.5px solid', textAlign: 'center',
  },
  planCard: {
    background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0',
    overflow: 'hidden', transition: 'border-color 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  planHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1rem 1.25rem', cursor: 'pointer', userSelect: 'none',
  },
  planDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  planBadge: {
    padding: '0.15rem 0.5rem', borderRadius: 5, fontSize: '0.7rem',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  planBody: {
    padding: '0 1.25rem 1.25rem',
    borderTop: '1px solid #f1f5f9',
    paddingTop: '1.25rem',
  },
  formRow: { display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  field: { flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  input: {
    padding: '0.55rem 0.8rem', border: '1.5px solid #e2e8f0', borderRadius: 7,
    fontSize: '0.88rem', color: '#0f172a', outline: 'none',
  },
  sectionLabel: { fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '0.25rem' },
  limitsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' },
  limitItem: { display: 'flex', flexDirection: 'column' },
  limitLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#64748b' },
  limitInput: {
    padding: '0.45rem 0.65rem', border: '1.5px solid #e2e8f0', borderRadius: 6,
    fontSize: '0.85rem', color: '#0f172a', outline: 'none', width: '100%',
  },
  saveAllBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
  },
  resetBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1rem', background: '#f1f5f9',
    color: '#64748b', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer',
  },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.7rem 1rem', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' },
  successBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.7rem 1rem', color: '#16a34a', fontSize: '0.85rem', marginBottom: '1rem' },
  card: {
    background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
    padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardTitle: { fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: {
    padding: '0.7rem 0.85rem', borderBottom: '2px solid #e2e8f0',
    fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', textAlign: 'left',
  },
  tr: { borderBottom: '1px solid #f1f5f9' },
  tdLabel: { padding: '0.6rem 0.85rem', fontWeight: 600, color: '#374151', fontSize: '0.82rem' },
  tdCenter: { padding: '0.6rem 0.85rem', textAlign: 'center', fontWeight: 600, color: '#0f172a' },
}
