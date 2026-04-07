import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ArrowLeft, BookOpen, Check, DollarSign, Clock,
  ToggleLeft, ToggleRight, RefreshCw, AlertCircle, Info,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'

const DURATION_UNITS = ['Days', 'Weeks', 'Months', 'Lessons']

const empty = {
  name: '',
  description: '',
  duration_value: '',
  duration_unit: 'Months',
  cost: '',
  setup_fee: '',
  billing_type: 'recurring',
  active: true,
}

export default function CourseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organizationId, checkLimit, refreshEntityCounts, plan } = useRole()
  const offeringLimit = checkLimit('offerings')
  const isEdit = !!id

  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    supabase.from('offerings').select('*').eq('id', id).single().then(({ data, error: err }) => {
      if (err || !data) { setError('Course not found.'); setLoading(false); return }
      setForm({
        name: data.name || '',
        description: data.description || '',
        duration_value: data.duration_value ?? '',
        duration_unit: data.duration_unit || 'Months',
        cost: data.cost ?? '',
        setup_fee: data.setup_fee ?? '',
        billing_type: data.billing_type || 'recurring',
        active: data.active ?? true,
      })
      setLoading(false)
    })
  }, [id])

  async function handleSave() {
    if (!form.name.trim()) { setError('Course name is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      offering_type: 'course',
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_value: form.duration_value !== '' ? parseInt(form.duration_value, 10) : null,
      duration_unit: form.duration_value !== '' ? form.duration_unit : null,
      cost: form.cost !== '' ? parseFloat(form.cost) : null,
      setup_fee: form.setup_fee !== '' ? parseFloat(form.setup_fee) : null,
      billing_type: form.billing_type || 'recurring',
      active: form.active,
      cancellation_policy: null,
    }

    let err
    if (isEdit) {
      ;({ error: err } = await supabase.from('offerings').update(payload).eq('id', id))
    } else {
      ;({ error: err } = await supabase.from('offerings').insert({ ...payload, organization_id: organizationId }))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    if (!isEdit) refreshEntityCounts()
    navigate('/admin/offerings')
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>

  if (!isEdit && offeringLimit.atLimit) {
    return (
      <div>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/admin/offerings')}>
            <ArrowLeft size={14} strokeWidth={2.5} /> Offerings
          </button>
        </div>
        <PlanLimitBanner entityLabel="offerings" current={offeringLimit.current} max={offeringLimit.max} plan={plan} />
      </div>
    )
  }

  return (
    <div>
      {/* Back + Title */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/admin/offerings')}>
          <ArrowLeft size={14} strokeWidth={2.5} /> Offerings
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.5rem' }}>
          <div style={s.titleIcon}>
            <BookOpen size={18} color="#6366f1" strokeWidth={2} />
          </div>
          <div>
            <h1 style={s.title}>{isEdit ? 'Edit Course' : 'New Course'}</h1>
            <p style={s.sub}>Lesson-based program with structured content delivery</p>
          </div>
        </div>
      </div>

      {error && (
        <div style={s.errorBanner}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      <div style={s.layout}>
        {/* ── Left column ── */}
        <div style={s.main}>

          {/* Basic Info */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Info size={14} color="#6366f1" /> Basic Information
            </div>
            <div style={s.cardBody}>
              <div>
                <label style={s.label}>Course Name <span style={s.req}>*</span></label>
                <input style={s.input} placeholder="e.g. JumpStart Your Freedom"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Description</label>
                <textarea style={{ ...s.input, ...s.textarea }}
                  placeholder="Describe what's included in this course…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Clock size={14} color="#0d9488" /> Duration
            </div>
            <div style={s.cardBody}>
              <div style={s.row}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Duration length</label>
                  <input style={s.input} type="number" min="1" placeholder="e.g. 3"
                    value={form.duration_value}
                    onChange={e => setForm(f => ({ ...f, duration_value: e.target.value }))} />
                  <p style={s.hint}>How long the course runs.</p>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Unit</label>
                  <select style={s.input} value={form.duration_unit}
                    onChange={e => setForm(f => ({ ...f, duration_unit: e.target.value }))}>
                    {DURATION_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <p style={s.hint}>Days, weeks, months, or lessons.</p>
                </div>
              </div>

              {form.duration_value && (
                <div style={s.durationPreview}>
                  <Clock size={14} color="#0d9488" />
                  <span>
                    This course runs for <strong>{form.duration_value} {form.duration_unit?.toLowerCase()}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={s.sidebar}>

          {/* Pricing */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <DollarSign size={14} color="#10b981" /> Pricing
            </div>
            <div style={s.cardBody}>
              <div>
                <label style={s.label}>Cost ($)</label>
                <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  onBlur={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) setForm(f => ({ ...f, cost: v.toFixed(2) }))
                  }} />
              </div>
              <div>
                <label style={s.label}>One-time setup fee ($)</label>
                <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00 (optional)"
                  value={form.setup_fee}
                  onChange={e => setForm(f => ({ ...f, setup_fee: e.target.value }))}
                  onBlur={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) setForm(f => ({ ...f, setup_fee: v.toFixed(2) }))
                  }} />
                <p style={s.hint}>Charged once at enrollment.</p>
              </div>
              <div>
                <label style={s.label}>Billing type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { value: 'recurring', label: 'Recurring Monthly', icon: RefreshCw, color: '#0d9488' },
                    { value: 'one_time', label: 'One-time', icon: DollarSign, color: '#8b5cf6' },
                  ].map(opt => {
                    const active = form.billing_type === opt.value
                    return (
                      <button
                        key={opt.value}
                        style={{
                          ...s.billingBtn,
                          borderColor: active ? opt.color + '60' : '#e5e7eb',
                          background: active ? opt.color + '10' : '#fff',
                          color: active ? opt.color : '#6b7280',
                        }}
                        onClick={() => setForm(f => ({ ...f, billing_type: opt.value }))}
                      >
                        <opt.icon size={13} />
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div style={s.card}>
            <div style={s.cardHeader}>Status</div>
            <div style={s.cardBody}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div>
                  <span style={s.label}>Active</span>
                  <p style={s.hint}>Inactive courses cannot be assigned to new mentees.</p>
                </div>
                <button
                  style={{ ...s.toggleBtn, color: form.active ? '#10b981' : '#9ca3af' }}
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                  {form.active
                    ? <ToggleRight size={28} strokeWidth={1.8} />
                    : <ToggleLeft size={28} strokeWidth={1.8} />}
                </button>
              </div>
              <div style={{
                padding: '0.45rem 0.75rem', borderRadius: 6, marginTop: '0.25rem',
                background: form.active ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${form.active ? '#bbf7d0' : '#e5e7eb'}`,
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: form.active ? '#16a34a' : '#9ca3af' }}>
                  {form.active ? 'Active — visible and assignable' : 'Inactive — hidden from assignment'}
                </span>
              </div>
            </div>
          </div>

          {/* Preview */}
          {form.name && (
            <div style={{ ...s.card, border: '1.5px solid #c7d2fe', background: '#eef2ff' }}>
              <div style={{ ...s.cardHeader, background: '#eef2ff' }}>
                <BookOpen size={14} color="#6366f1" /> Preview
              </div>
              <div style={s.cardBody}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#6366f1', marginBottom: '0.35rem' }}>
                  {form.name}
                </div>
                <div style={{ fontSize: '0.79rem', color: '#374151', lineHeight: 1.9 }}>
                  {form.duration_value && <div>📅 {form.duration_value} {form.duration_unit?.toLowerCase()}</div>}
                  {form.cost && <div>💵 ${parseFloat(form.cost || 0).toFixed(2)}{form.billing_type === 'recurring' ? ' / month' : ' one-time'}</div>}
                  {form.setup_fee && parseFloat(form.setup_fee) > 0 && (
                    <div>⚡ +${parseFloat(form.setup_fee).toFixed(2)} setup</div>
                  )}
                  <div>{form.billing_type === 'recurring' ? '🔄 Recurring monthly' : '💰 One-time payment'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
            <Check size={14} strokeWidth={2.5} />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Course'}
          </button>
          <button style={s.cancelBtn} onClick={() => navigate('/admin/offerings')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  header: { marginBottom: '1.5rem' },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    background: 'none', border: 'none', color: '#6b7280',
    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: 0,
  },
  titleIcon: {
    width: 40, height: 40, borderRadius: 6, background: '#eef2ff',
    border: '1.5px solid #c7d2fe', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', margin: 0 },
  sub: { color: '#9ca3af', fontSize: '0.82rem', margin: '0.15rem 0 0' },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.75rem 1rem', background: '#fff5f5',
    border: '1px solid #fecaca', borderRadius: 6,
    color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem',
  },
  layout: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' },
  main: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  sidebar: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  card: { backgroundColor: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.85rem 1.25rem', borderBottom: '1px solid #f3f4f6',
    fontSize: '0.85rem', fontWeight: 700, color: '#374151',
  },
  cardBody: { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem', display: 'block' },
  req: { color: '#ef4444' },
  input: { width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', color: '#111827', background: '#fff', boxSizing: 'border-box' },
  textarea: { resize: 'vertical', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5 },
  row: { display: 'flex', gap: '0.75rem' },
  hint: { fontSize: '0.73rem', color: '#9ca3af', margin: '0.25rem 0 0', lineHeight: 1.4 },
  durationPreview: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.7rem 1rem', backgroundColor: '#f0fdfa',
    border: '1px solid #a7f3d0', borderRadius: 4, fontSize: '0.82rem', color: '#0d9488',
  },
  billingBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
    padding: '0.55rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 4,
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', background: '#fff',
  },
  toggleBtn: {
    display: 'flex', alignItems: 'center', gap: '0.25rem',
    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    padding: '0.7rem 1.25rem', background: 'var(--primary-gradient)', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.875rem', fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
  },
  cancelBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0.6rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: 6,
    background: '#fff', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer',
  },
}
