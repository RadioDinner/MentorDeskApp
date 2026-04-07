import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { CreditCard, CheckCircle, XCircle, Zap, Calendar, Shield, ArrowRight } from 'lucide-react'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import { useRole } from '../context/RoleContext'
import { PLAN_LIMITS } from '../constants/planLimits'
import UsageBar from '../components/UsageBar'

const CARD_BRANDS = {
  Visa: '#1a1f71',
  Mastercard: '#eb001b',
  Amex: '#007bc1',
  Discover: '#f76f20',
}

function detectBrand(num) {
  const n = (num || '').replace(/\s/g, '')
  if (/^4/.test(n)) return 'Visa'
  if (/^5[1-5]/.test(n)) return 'Mastercard'
  if (/^3[47]/.test(n)) return 'Amex'
  if (/^6(?:011|5)/.test(n)) return 'Discover'
  return ''
}

const EMPTY_FORM = {
  card_holder: '',
  card_number: '',
  card_expiry: '',
  card_cvv: '',
  billing_street: '',
  billing_city: '',
  billing_state: '',
  billing_zip: '',
  billing_country: 'United States',
}

const PLAN_KEYS = ['free', 'starter', 'pro', 'enterprise']
const PLAN_COLORS = { free: '#64748b', starter: '#3b82f6', pro: '#7c3aed', enterprise: '#d97706' }
const FEATURE_LABELS = [
  { key: 'courses', label: 'Courses' },
  { key: 'arrangements', label: 'Arrangements' },
  { key: 'billing', label: 'Billing' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
]

export default function Billing() {
  const { organizationId, plan, checkLimit } = useRole()
  const planDef = PLAN_LIMITS[plan] || PLAN_LIMITS.free
  const [savedCard, setSavedCard] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingCard, setEditingCard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadBilling()
  }, [])

  async function loadBilling() {
    const { data } = await supabase
      .from('org_billing')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!data) return
    if (data.card_last4) {
      setSavedCard({
        last4: data.card_last4,
        brand: data.card_brand,
        expiry: data.card_expiry,
        holder: data.card_holder,
        billing_street: data.billing_street,
        billing_city: data.billing_city,
        billing_state: data.billing_state,
        billing_zip: data.billing_zip,
        billing_country: data.billing_country,
      })
      setForm(f => ({
        ...f,
        card_holder: data.card_holder || '',
        card_expiry: data.card_expiry || '',
        billing_street: data.billing_street || '',
        billing_city: data.billing_city || '',
        billing_state: data.billing_state || '',
        billing_zip: data.billing_zip || '',
        billing_country: data.billing_country || 'United States',
      }))
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => {
      let v = value
      if (name === 'card_number') {
        v = value.replace(/\D/g, '').slice(0, 16)
        v = v.replace(/(.{4})/g, '$1 ').trim()
      }
      if (name === 'card_expiry') {
        v = value.replace(/\D/g, '').slice(0, 4)
        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
      }
      if (name === 'card_cvv') {
        v = value.replace(/\D/g, '').slice(0, 4)
      }
      return { ...f, [name]: v }
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const digits = form.card_number.replace(/\s/g, '')
    const last4 = digits.slice(-4)
    const brand = detectBrand(digits)

    const row = {
      organization_id: organizationId,
      card_last4: last4,
      card_brand: brand,
      card_expiry: form.card_expiry,
      card_holder: form.card_holder,
      billing_street: form.billing_street,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_zip: form.billing_zip,
      billing_country: form.billing_country,
      updated_at: new Date().toISOString(),
    }

    const { error: err } = await supabase
      .from('org_billing')
      .upsert(row, { onConflict: 'organization_id' })
    if (err) {
      setError(err.message)
    } else {
      setSavedCard({ last4, brand, expiry: form.card_expiry, holder: form.card_holder,
        billing_street: form.billing_street, billing_city: form.billing_city,
        billing_state: form.billing_state, billing_zip: form.billing_zip,
        billing_country: form.billing_country })
      setSuccess('Payment information saved.')
      setEditingCard(false)
      setForm(f => ({ ...f, card_number: '', card_cvv: '' }))
    }
    setSaving(false)
  }

  const brand = detectBrand(form.card_number)

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>Billing</h1>
        <p style={s.sub}>Manage your MentorDesk subscription and payment details</p>
      </div>

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* Plan + Usage row */}
      <div style={s.planRow}>
        <div style={s.planCard}>
          <div style={s.planHeader}>
            <div style={s.planIconWrap}>
              <Zap size={20} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <div style={s.planName}>MentorDesk {planDef.label}</div>
              <div style={s.planPrice}>
                {planDef.price ? `$${planDef.price}` : (plan === 'free' ? 'Free' : 'Custom')}
                {planDef.price && <span style={s.planInterval}> / month</span>}
              </div>
            </div>
            <span style={s.activeBadge}>Active</span>
          </div>
          <div style={s.planDivider} />
          <div style={s.planFeatures}>
            {Object.entries(planDef.features).filter(([, v]) => v).map(([key]) => (
              <div key={key} style={s.planFeature}>
                <CheckCircle size={14} color="#10b981" />
                <span style={{ textTransform: 'capitalize' }}>{key}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={s.usageCard}>
          <div style={s.usageTitle}>Usage</div>
          <div style={s.usageBars}>
            {[
              { key: 'mentors', label: 'Mentors', color: '#6366f1' },
              { key: 'mentees', label: 'Mentees', color: '#10b981' },
              { key: 'staff', label: 'Staff', color: '#f59e0b' },
              { key: 'offerings', label: 'Offerings', color: '#8b5cf6' },
            ].map(({ key, label, color }) => {
              const lim = checkLimit(key)
              return <UsageBar key={key} label={label} current={lim.current} max={lim.max} color={color} />
            })}
          </div>
          {plan !== 'enterprise' && (
            <div style={s.upgradeNote}>
              Need more capacity? Contact us to upgrade.
            </div>
          )}
        </div>
      </div>

      <div style={s.grid}>
        {/* Payment column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Payment Method */}
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Payment Method</h2>
            <div style={s.sectionBody}>
              {savedCard && !editingCard ? (
                <div>
                  <div style={s.savedCardRow}>
                    <div style={s.cardChip}>
                      <CreditCard size={18} color={CARD_BRANDS[savedCard.brand] || '#6366f1'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={s.cardNum}>
                        {savedCard.brand || 'Card'} •••• •••• •••• {savedCard.last4}
                      </div>
                      <div style={s.cardMeta}>
                        {savedCard.holder && <span>{savedCard.holder}</span>}
                        <span>Expires {savedCard.expiry}</span>
                      </div>
                    </div>
                    <button style={s.changeBtn} onClick={() => setEditingCard(true)}>Change</button>
                  </div>
                  {savedCard.billing_city && (
                    <div style={s.billingAddr}>
                      <div style={s.addrLabel}>Billing Address</div>
                      <div style={s.addrText}>
                        {[savedCard.billing_street, savedCard.billing_city,
                          savedCard.billing_state, savedCard.billing_zip,
                          savedCard.billing_country].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSave} style={s.form}>
                  <div style={s.notice}>
                    <Shield size={13} color="#6366f1" />
                    <span>Payment processing will be activated in a future release. Your card details are saved securely for when billing goes live.</span>
                  </div>

                  <div style={s.sectionLabel}>Card Information</div>
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Cardholder Name</label>
                    <input style={s.input} name="card_holder" value={form.card_holder} onChange={handleChange} placeholder="Full name on card" required />
                  </div>
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Card Number</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...s.input, paddingRight: brand ? '3.5rem' : s.input.padding }}
                        name="card_number"
                        value={form.card_number}
                        onChange={handleChange}
                        placeholder="1234 5678 9012 3456"
                        inputMode="numeric"
                        required
                      />
                      {brand && (
                        <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', fontWeight: 700, color: CARD_BRANDS[brand] || '#6b7280' }}>
                          {brand}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={s.row}>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Expiry (MM/YY)</label>
                      <input style={s.input} name="card_expiry" value={form.card_expiry} onChange={handleChange} placeholder="MM/YY" inputMode="numeric" required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>CVV</label>
                      <input style={s.input} name="card_cvv" value={form.card_cvv} onChange={handleChange} placeholder="•••" inputMode="numeric" />
                    </div>
                  </div>

                  <div style={{ ...s.sectionLabel, marginTop: '0.5rem' }}>Billing Address</div>
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Street</label>
                    <input style={s.input} name="billing_street" value={form.billing_street} onChange={handleChange} placeholder="123 Main St" />
                  </div>
                  <div style={s.row}>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>City</label>
                      <input style={s.input} name="billing_city" value={form.billing_city} onChange={handleChange} />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>State</label>
                      <select style={s.input} name="billing_state" value={form.billing_state} onChange={handleChange}>
                        <option value="">—</option>
                        {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>ZIP</label>
                      <input style={s.input} name="billing_zip" value={form.billing_zip} onChange={handleChange} />
                    </div>
                  </div>
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Country</label>
                    <select style={s.input} name="billing_country" value={form.billing_country} onChange={handleChange}>
                      {COUNTRIES.map((c, i) => c.disabled
                        ? <option key={i} disabled>{c.label}</option>
                        : <option key={c.value} value={c.value}>{c.label}</option>
                      )}
                    </select>
                  </div>

                  <div style={s.formActions}>
                    {savedCard && (
                      <button type="button" style={s.cancelBtn} onClick={() => setEditingCard(false)}>Cancel</button>
                    )}
                    <button type="submit" style={s.saveBtn} disabled={saving}>
                      {saving ? 'Saving…' : 'Save Payment Info'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Plan Comparison */}
      <div style={s.compareSection}>
        <h2 style={s.compareTitle}>Compare Plans</h2>
        <p style={s.compareSub}>Find the right plan for your organization</p>

        <div style={s.plansGrid}>
          {PLAN_KEYS.map(key => {
            const pd = PLAN_LIMITS[key]
            const isCurrent = plan === key
            const color = PLAN_COLORS[key]
            return (
              <div key={key} style={{ ...s.comparePlanCard, ...(isCurrent ? { borderColor: color, borderWidth: 2 } : {}) }}>
                {isCurrent && <div style={{ ...s.currentRibbon, backgroundColor: color }}>Current Plan</div>}
                <div style={{ ...s.comparePlanIcon, backgroundColor: `${color}15`, color }}>
                  <Zap size={20} />
                </div>
                <div style={s.comparePlanName}>{pd.label}</div>
                <div style={s.comparePlanPrice}>
                  {pd.price ? `$${pd.price}` : key === 'free' ? 'Free' : 'Custom'}
                  {pd.price && <span style={s.comparePlanInterval}>/mo</span>}
                </div>

                <div style={s.compareDivider} />

                <div style={s.compareLimitsTitle}>Entity Limits</div>
                {[
                  { label: 'Mentors', val: pd.limits.mentors },
                  { label: 'Mentees', val: pd.limits.mentees },
                  { label: 'Staff', val: pd.limits.staff },
                  { label: 'Asst. Mentors', val: pd.limits.assistant_mentors },
                  { label: 'Offerings', val: pd.limits.offerings },
                ].map(({ label, val }) => (
                  <div key={label} style={s.compareLimitRow}>
                    <span style={s.compareLimitLabel}>{label}</span>
                    <span style={s.compareLimitVal}>{val === Infinity ? 'Unlimited' : val}</span>
                  </div>
                ))}

                <div style={s.compareDivider} />

                <div style={s.compareLimitsTitle}>Features</div>
                {FEATURE_LABELS.map(({ key: fk, label }) => {
                  const enabled = pd.features[fk]
                  return (
                    <div key={fk} style={s.compareFeatureRow}>
                      {enabled
                        ? <CheckCircle size={14} color="#10b981" />
                        : <XCircle size={14} color="#d1d5db" />
                      }
                      <span style={{ ...s.compareFeatureLabel, color: enabled ? '#374151' : '#d1d5db' }}>{label}</span>
                    </div>
                  )
                })}

                {!isCurrent && key !== 'free' && (
                  <button style={{ ...s.compareUpgradeBtn, backgroundColor: color }}>
                    {key === 'enterprise' ? 'Contact Sales' : 'Upgrade'}
                    <ArrowRight size={14} />
                  </button>
                )}
                {isCurrent && (
                  <div style={s.compareCurrentLabel}>Your current plan</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  header: { marginBottom: '2rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  planRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'start' },
  usageCard: { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #f3f4f6', boxShadow: 'var(--shadow-sm)', padding: '1.4rem' },
  usageTitle: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem' },
  usageBars: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  upgradeNote: { marginTop: '1.25rem', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#6366f1', fontWeight: 600, backgroundColor: '#eef2ff', borderRadius: 8, textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem', alignItems: 'start' },
  planCard: { backgroundColor: '#111827', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' },
  planHeader: { display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1.4rem 1.4rem 1.1rem', flexWrap: 'wrap' },
  planIconWrap: { width: 40, height: 40, borderRadius: 6, background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.4)' },
  planName: { fontSize: '0.9rem', fontWeight: 700, color: '#f9fafb', marginBottom: '0.1rem' },
  planPrice: { fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' },
  planInterval: { fontSize: '0.8rem', fontWeight: 400, color: '#6b7280' },
  activeBadge: { marginLeft: 'auto', padding: '0.2rem 0.65rem', borderRadius: 49, background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '0.72rem', fontWeight: 700, border: '1px solid rgba(16,185,129,0.25)', whiteSpace: 'nowrap' },
  planDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 1.4rem' },
  planFeatures: { padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' },
  planFeature: { display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.83rem', color: '#d1d5db' },
  planFooter: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.85rem 1.4rem', borderTop: '1px solid rgba(255,255,255,0.06)' },
  planFooterText: { fontSize: '0.78rem', color: '#6b7280' },
  section: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  sectionTitle: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '1.1rem 1.25rem' },
  savedCardRow: { display: 'flex', alignItems: 'center', gap: '0.85rem' },
  cardChip: { width: 38, height: 38, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardNum: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  cardMeta: { display: 'flex', gap: '0.75rem', color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' },
  changeBtn: { padding: '0.35rem 0.85rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 6, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 },
  billingAddr: { marginTop: '0.85rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: 4, border: '1px solid #f3f4f6' },
  addrLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' },
  addrText: { fontSize: '0.82rem', color: '#6b7280' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  notice: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.65rem 0.85rem', backgroundColor: '#eef2ff', borderRadius: 6, fontSize: '0.78rem', color: '#4338ca', lineHeight: 1.5 },
  sectionLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.65rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.25rem' },
  cancelBtn: { padding: '0.6rem 1.1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: '0.875rem' },
  // Plan comparison
  compareSection: { marginTop: '2.5rem' },
  compareTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  compareSub: { color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.25rem' },
  plansGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', alignItems: 'start' },
  comparePlanCard: { position: 'relative', backgroundColor: '#fff', borderRadius: 10, border: '1.5px solid #e5e7eb', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', overflow: 'hidden' },
  currentRibbon: { position: 'absolute', top: 12, right: -30, transform: 'rotate(45deg)', padding: '0.15rem 2rem', fontSize: '0.62rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' },
  comparePlanIcon: { width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem' },
  comparePlanName: { fontSize: '1rem', fontWeight: 700, color: '#111827' },
  comparePlanPrice: { fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.25rem' },
  comparePlanInterval: { fontSize: '0.82rem', fontWeight: 400, color: '#9ca3af' },
  compareDivider: { height: 1, backgroundColor: '#f3f4f6', margin: '0.5rem 0' },
  compareLimitsTitle: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' },
  compareLimitRow: { display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' },
  compareLimitLabel: { fontSize: '0.82rem', color: '#6b7280' },
  compareLimitVal: { fontSize: '0.82rem', fontWeight: 600, color: '#111827' },
  compareFeatureRow: { display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.2rem 0' },
  compareFeatureLabel: { fontSize: '0.82rem' },
  compareUpgradeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.75rem' },
  compareCurrentLabel: { textAlign: 'center', padding: '0.6rem', fontSize: '0.82rem', fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 8, marginTop: '0.75rem' },
}
