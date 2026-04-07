import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ArrowLeft, CalendarDays, Check, Clock, DollarSign,
  ToggleLeft, ToggleRight, RefreshCw, AlertCircle,
  ClipboardList, FileText, Info, Users, TrendingUp, ShieldCheck,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'

const empty = {
  name: '',
  description: '',
  meetings_per_period: '',
  program_duration_periods: '',
  credits_rollover: false,
  cost: '',
  setup_fee: '',
  cancellation_policy: 'window',
  cancellation_window_hours: '24',
  allow_activities: false,
  active: true,
}

const POLICY_OPTIONS = [
  {
    value: 'reallocate',
    label: 'Always Re-allocate',
    desc: 'Credits are always returned on cancellation — mentees can cancel at any time without losing a session credit.',
    color: '#10b981',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    activeBorder: '#10b981',
  },
  {
    value: 'consume',
    label: 'Always Consumed',
    desc: 'Cancellations always consume the credit regardless of how much notice is given.',
    color: '#ef4444',
    bg: '#fff5f5',
    border: '#fecaca',
    activeBorder: '#ef4444',
  },
  {
    value: 'window',
    label: 'Time-Based (Recommended)',
    desc: 'Set a notice window. Cancellations before the window return the credit; cancellations inside the window consume it.',
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    activeBorder: '#6366f1',
  },
]

export default function ArrangementForm() {
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
      if (err || !data) { setError('Arrangement not found.'); setLoading(false); return }
      setForm({
        name: data.name || '',
        description: data.description || '',
        meetings_per_period: data.meetings_per_period ?? '',
        program_duration_periods: data.program_duration_periods ?? '',
        credits_rollover: data.credits_rollover ?? false,
        cost: data.cost ?? '',
        setup_fee: data.setup_fee ?? '',
        cancellation_policy: data.cancellation_policy || 'window',
        cancellation_window_hours: String(data.cancellation_window_hours ?? 24),
        allow_activities: data.allow_activities ?? false,
        active: data.active ?? true,
      })
      setLoading(false)
    })
  }, [id])

  function totalMeetings() {
    const m = parseInt(form.meetings_per_period, 10)
    const mo = parseInt(form.program_duration_periods, 10)
    if (!isNaN(m) && m > 0 && !isNaN(mo) && mo > 0) return m * mo
    return null
  }

  function policyDescription() {
    const hrs = form.cancellation_window_hours || 24
    switch (form.cancellation_policy) {
      case 'reallocate':
        return 'Any cancelled meeting will always return its credit to the mentee\'s balance, regardless of when they cancel.'
      case 'consume':
        return 'Any cancelled meeting will always consume the credit. There is no credit recovery regardless of how much notice is given.'
      case 'window':
        return `If a meeting is cancelled ${hrs}+ hours before it starts → credit is returned. If cancelled within ${hrs} hours → credit is consumed.`
      default:
        return ''
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Arrangement name is required.'); return }
    setSaving(true)
    setError('')

    const windowHours = form.cancellation_policy === 'window'
      ? (parseInt(form.cancellation_window_hours, 10) || 24)
      : 24

    const payload = {
      offering_type: 'arrangement',
      name: form.name.trim(),
      description: form.description.trim() || null,
      meetings_per_period: form.meetings_per_period !== '' ? parseInt(form.meetings_per_period, 10) : null,
      program_duration_periods: form.program_duration_periods !== '' ? parseInt(form.program_duration_periods, 10) : null,
      credits_rollover: form.credits_rollover,
      cost: form.cost !== '' ? parseFloat(form.cost) : null,
      setup_fee: form.setup_fee !== '' ? parseFloat(form.setup_fee) : null,
      billing_type: 'recurring',
      cancellation_policy: form.cancellation_policy,
      cancellation_window_hours: windowHours,
      allow_activities: form.allow_activities,
      active: form.active,
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

  const total = totalMeetings()
  const currentPolicy = POLICY_OPTIONS.find(p => p.value === form.cancellation_policy)

  return (
    <div>
      {/* Back + Title */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/admin/offerings')}>
          <ArrowLeft size={14} strokeWidth={2.5} /> Offerings
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.5rem' }}>
          <div style={s.titleIcon}>
            <CalendarDays size={18} color="#0d9488" strokeWidth={2} />
          </div>
          <div>
            <h1 style={s.title}>{isEdit ? 'Edit Arrangement' : 'New Arrangement'}</h1>
            <p style={s.sub}>Meeting-based program with credit allocation and cancellation policy</p>
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
                <label style={s.label}>Arrangement Name <span style={s.req}>*</span></label>
                <input style={s.input} placeholder="e.g. 4x Mentoring"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Description</label>
                <textarea style={{ ...s.input, ...s.textarea }}
                  placeholder="Describe what's included in this arrangement…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Meeting Allocation */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Users size={14} color="#0d9488" /> Meeting Allocation
            </div>
            <div style={s.cardBody}>
              <div style={s.row}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Meetings per billing cycle</label>
                  <input style={s.input} type="number" min="1" placeholder="e.g. 4"
                    value={form.meetings_per_period}
                    onChange={e => setForm(f => ({ ...f, meetings_per_period: e.target.value }))} />
                  <p style={s.hint}>Credits granted each time an invoice is marked paid.</p>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Total billing period (months)</label>
                  <input style={s.input} type="number" min="1" placeholder="e.g. 6 (optional)"
                    value={form.program_duration_periods}
                    onChange={e => setForm(f => ({ ...f, program_duration_periods: e.target.value }))} />
                  <p style={s.hint}>Optional. Defines the total engagement length.</p>
                </div>
              </div>

              {total !== null && (
                <div style={s.allocationPreview}>
                  <TrendingUp size={14} color="#0d9488" />
                  <span>
                    <strong>{form.meetings_per_period} meetings</strong> × <strong>{form.program_duration_periods} months</strong>
                    {' = '}
                    <strong>{total} total meetings</strong> entitled over the full program
                  </span>
                </div>
              )}

              <div style={s.toggleRow}>
                <div style={{ flex: 1 }}>
                  <span style={s.label}>Credits roll over</span>
                  <p style={{ ...s.hint, marginTop: 2 }}>
                    Unused credits from one billing cycle carry forward into the next.
                  </p>
                </div>
                <button
                  style={{ ...s.toggleBtn, color: form.credits_rollover ? '#0d9488' : '#9ca3af' }}
                  onClick={() => setForm(f => ({ ...f, credits_rollover: !f.credits_rollover }))}>
                  {form.credits_rollover
                    ? <><ToggleRight size={26} strokeWidth={1.8} /><span style={s.toggleLabel}>Enabled</span></>
                    : <><ToggleLeft size={26} strokeWidth={1.8} /><span style={s.toggleLabel}>Disabled</span></>}
                </button>
              </div>
            </div>
          </div>

          {/* Cancellation Policy */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Clock size={14} color="#f59e0b" /> Cancellation Policy
            </div>
            <div style={s.cardBody}>
              <p style={s.sectionDesc}>
                Define what happens to a meeting credit when a session is cancelled.
                This policy applies to all mentees enrolled in this arrangement.
              </p>

              <div style={s.policyGrid}>
                {POLICY_OPTIONS.map(pol => {
                  const active = form.cancellation_policy === pol.value
                  return (
                    <button
                      key={pol.value}
                      style={{
                        ...s.policyCard,
                        ...(active ? {
                          borderColor: pol.activeBorder,
                          background: pol.bg,
                        } : {}),
                      }}
                      onClick={() => setForm(f => ({ ...f, cancellation_policy: pol.value }))}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{
                          fontWeight: 700, fontSize: '0.84rem',
                          color: active ? pol.color : '#374151',
                        }}>
                          {pol.label}
                        </span>
                        {active && (
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: pol.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Check size={10} color="#fff" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.55, margin: 0, textAlign: 'left' }}>
                        {pol.desc}
                      </p>
                    </button>
                  )
                })}
              </div>

              {form.cancellation_policy === 'window' && (
                <div style={s.thresholdBox}>
                  <label style={s.label}>Cancellation window (hours)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                    <input
                      style={{ ...s.input, width: 110 }}
                      type="number" min="1" max="168"
                      value={form.cancellation_window_hours}
                      onChange={e => setForm(f => ({ ...f, cancellation_window_hours: e.target.value }))} />
                    <span style={{ fontSize: '0.82rem', color: '#4f46e5' }}>hours before meeting starts</span>
                  </div>
                  <div style={s.thresholdRules}>
                    <div style={s.thresholdRule}>
                      <div style={{ ...s.ruleIcon, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                        <Check size={10} color="#10b981" strokeWidth={3} />
                      </div>
                      <span>
                        Cancel <strong>≥{form.cancellation_window_hours || 24}h</strong> before → credit <strong style={{ color: '#10b981' }}>returned</strong>
                      </span>
                    </div>
                    <div style={s.thresholdRule}>
                      <div style={{ ...s.ruleIcon, background: '#fff5f5', borderColor: '#fecaca' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#ef4444' }}>✕</span>
                      </div>
                      <span>
                        Cancel <strong>&lt;{form.cancellation_window_hours || 24}h</strong> before → credit <strong style={{ color: '#ef4444' }}>consumed</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div style={s.policySummary}>
                <ShieldCheck size={13} color={currentPolicy?.color || '#6b7280'} style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.79rem', color: '#374151', lineHeight: 1.6 }}>
                  <strong>Current policy: </strong>{policyDescription()}
                </p>
              </div>
            </div>
          </div>

          {/* Activities */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <ClipboardList size={14} color="#8b5cf6" /> Activities
            </div>
            <div style={s.cardBody}>
              <p style={s.sectionDesc}>
                Enable activity types that can be issued to mentees enrolled in this arrangement.
              </p>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.85rem 1rem', borderRadius: 6, cursor: 'pointer',
                  border: `1.5px solid ${form.allow_activities ? '#c7d2fe' : '#e5e7eb'}`,
                  background: form.allow_activities ? '#eef2ff' : '#fff',
                }}
                onClick={() => setForm(f => ({ ...f, allow_activities: !f.allow_activities }))}>
                <div style={{
                  width: 34, height: 34, borderRadius: 4, flexShrink: 0,
                  background: form.allow_activities ? '#eef2ff' : '#f9fafb',
                  border: `1px solid ${form.allow_activities ? '#c7d2fe' : '#e5e7eb'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ClipboardList size={16} color={form.allow_activities ? '#6366f1' : '#9ca3af'} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: form.allow_activities ? '#6366f1' : '#374151' }}>
                    Enable Activities
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4, marginTop: 2 }}>
                    Allow whiteboards and check-in forms to be issued to mentees in this arrangement.
                  </div>
                </div>
                <div style={{ color: form.allow_activities ? '#6366f1' : '#9ca3af', flexShrink: 0 }}>
                  {form.allow_activities
                    ? <ToggleRight size={24} strokeWidth={1.8} />
                    : <ToggleLeft size={24} strokeWidth={1.8} />}
                </div>
              </div>
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
                <label style={s.label}>Monthly cost ($)</label>
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
                <p style={s.hint}>Charged once at sign-up.</p>
              </div>
              <div style={s.recurringBadge}>
                <RefreshCw size={11} color="#0d9488" />
                <span>Billed monthly · recurring</span>
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
                  <p style={s.hint}>Inactive arrangements cannot be assigned to new mentees.</p>
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

          {/* Preview (shown when enough info is filled) */}
          {form.name && form.meetings_per_period && (
            <div style={{ ...s.card, border: '1.5px solid #a7f3d0', background: '#f0fdfa' }}>
              <div style={{ ...s.cardHeader, background: '#f0fdfa' }}>
                <CalendarDays size={14} color="#0d9488" /> Preview
              </div>
              <div style={s.cardBody}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0d9488', marginBottom: '0.5rem' }}>
                  {form.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                    {form.meetings_per_period} meeting{form.meetings_per_period !== '1' ? 's' : ''} / month
                  </div>
                  {form.program_duration_periods && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                      Over {form.program_duration_periods} month{form.program_duration_periods !== '1' ? 's' : ''}
                    </div>
                  )}
                  {total && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                      {total} total meetings
                    </div>
                  )}
                  {form.cost && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                      ${parseFloat(form.cost || 0).toFixed(2)} / month
                    </div>
                  )}
                  {form.setup_fee && parseFloat(form.setup_fee) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                      +${parseFloat(form.setup_fee).toFixed(2)} setup fee
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                    Credits {form.credits_rollover ? 'roll over' : 'expire each cycle'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#0d9488', flexShrink: 0 }} />
                    {form.cancellation_policy === 'reallocate' && 'Cancelled meetings re-allocated'}
                    {form.cancellation_policy === 'consume' && 'Cancelled meetings consumed'}
                    {form.cancellation_policy === 'window' && `${form.cancellation_window_hours}h cancellation window`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
            <Check size={14} strokeWidth={2.5} />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Arrangement'}
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
    width: 40, height: 40, borderRadius: 6, background: '#f0fdfa',
    border: '1.5px solid #a7f3d0', display: 'flex',
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
  card: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.85rem 1.25rem', borderBottom: '1px solid #f3f4f6',
    fontSize: '0.85rem', fontWeight: 700, color: '#374151',
  },
  cardBody: { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem', display: 'block' },
  req: { color: '#ef4444' },
  input: {
    width: '100%', padding: '0.6rem 0.85rem',
    border: '1.5px solid #e5e7eb', borderRadius: 4,
    fontSize: '0.875rem', color: '#111827', background: '#fff', boxSizing: 'border-box',
  },
  textarea: { resize: 'vertical', minHeight: 80 },
  hint: { fontSize: '0.74rem', color: '#9ca3af', margin: '0.2rem 0 0', lineHeight: 1.5 },
  sectionDesc: { fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.6, margin: 0 },
  row: { display: 'flex', gap: '1rem' },
  allocationPreview: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.75rem 1rem', background: '#f0fdfa',
    borderRadius: 6, border: '1px solid #a7f3d0',
    fontSize: '0.82rem', color: '#0d9488',
  },
  toggleRow: { display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: '0.25rem' },
  toggleBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 },
  toggleLabel: { fontSize: '0.8rem', fontWeight: 600 },
  policyGrid: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  policyCard: {
    padding: '0.85rem 1rem', borderRadius: 6,
    border: '1.5px solid #e5e7eb', background: '#f9fafb',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'border-color 0.15s, background 0.15s',
  },
  thresholdBox: {
    padding: '1rem 1.1rem', background: '#eef2ff',
    borderRadius: 6, border: '1px solid #c7d2fe',
  },
  thresholdRules: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  thresholdRule: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    fontSize: '0.8rem', color: '#374151',
  },
  ruleIcon: {
    width: 18, height: 18, borderRadius: '50%', border: '1.5px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  policySummary: {
    display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
    padding: '0.75rem 1rem', background: '#f9fafb',
    borderRadius: 4, border: '1px solid #f3f4f6',
  },
  recurringBadge: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 0.75rem', background: '#f0fdfa',
    border: '1px solid #a7f3d0', borderRadius: 6,
    fontSize: '0.75rem', color: '#0d9488', fontWeight: 600,
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    padding: '0.65rem 1.25rem',
    background: 'linear-gradient(135deg, #0d9488, #10b981)',
    color: '#fff', border: 'none', borderRadius: 6,
    fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(16,185,129,0.3)', width: '100%',
  },
  cancelBtn: {
    padding: '0.6rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: 6,
    background: '#fff', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', width: '100%', textAlign: 'center',
  },
}
