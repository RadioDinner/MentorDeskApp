import { useEffect, useState, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  Package, Plus, Pencil, Trash2, X, Check, Clock, DollarSign,
  ToggleLeft, ToggleRight, BookOpen, RefreshCw, CalendarDays, Users,
  ShieldCheck, ShieldAlert, FileText, ClipboardList, Activity, Info,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import PlanLimitBanner from '../components/PlanLimitBanner'

class OfferingsErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', maxWidth: 600 }}>
          <h2 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Something went wrong loading Offerings</h2>
          <pre style={{ background: '#fef2f2', padding: '1rem', borderRadius: 8, fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: '#991b1b' }}>
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const DURATION_UNITS_COURSE = ['Days', 'Weeks', 'Months', 'Lessons']

const emptyArrangement = {
  offering_type: 'arrangement',
  name: '', description: '',
  meetings_per_period: '', program_duration_periods: '',
  cost: '', setup_fee: '',
  billing_type: 'recurring',
  cancellation_policy: 'window',
  cancellation_window_hours: 24,
  allow_activities: false,
  active: true,
  billing_end_mode: 'indefinite', // 'indefinite' | 'fixed'
  billing_end_months: '',
  invoice_delay_days: '',
}

const emptyCourse = {
  offering_type: 'course',
  name: '', duration_value: '', duration_unit: 'Months',
  cost: '', setup_fee: '', billing_type: 'recurring', description: '', active: true,
  invoice_delay_days: '',
}

export default function ManageOfferingsWithBoundary() {
  return <OfferingsErrorBoundary><ManageOfferings /></OfferingsErrorBoundary>
}

function ManageOfferings() {
  const navigate = useNavigate()
  const { checkLimit, refreshEntityCounts, plan } = useRole()
  const offeringLimit = checkLimit('offerings')
  const [offerings, setOfferings] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyCourse)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [organizationId])

  async function load() {
    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase.from('offerings').select('*').order('created_at', { ascending: false })
      if (fetchError) { setError(fetchError.message); setLoading(false); return }
      setOfferings(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load offerings')
    }
    setLoading(false)
  }

  function openAdd(type = 'course') {
    setForm(type === 'arrangement' ? { ...emptyArrangement } : { ...emptyCourse })
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(offering) {
    if (offering.offering_type === 'arrangement') {
      setForm({
        offering_type: 'arrangement',
        name: offering.name || '',
        description: offering.description || '',
        meetings_per_period: offering.meetings_per_period ?? '',
        program_duration_periods: offering.program_duration_periods ?? '',
        cost: offering.cost ?? '',
        setup_fee: offering.setup_fee ?? '',
        billing_type: 'recurring',
        cancellation_policy: offering.cancellation_policy || 'window',
        cancellation_window_hours: offering.cancellation_window_hours ?? 24,
        allow_activities: offering.allow_activities ?? false,
        active: offering.active,
        billing_end_mode: offering.billing_end_months ? 'fixed' : 'indefinite',
        billing_end_months: offering.billing_end_months ?? '',
        invoice_delay_days: offering.invoice_delay_days ?? '',
      })
    } else {
      setForm({
        offering_type: 'course',
        name: offering.name || '',
        duration_value: offering.duration_value ?? '',
        duration_unit: offering.duration_unit || 'Months',
        cost: offering.cost ?? '',
        setup_fee: offering.setup_fee ?? '',
        billing_type: offering.billing_type || 'recurring',
        description: offering.description || '',
        invoice_delay_days: offering.invoice_delay_days ?? '',
        active: offering.active,
      })
    }
    setEditId(offering.id)
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')

    let payload
    if (form.offering_type === 'arrangement') {
      if (!form.meetings_per_period || parseInt(form.meetings_per_period) < 1) {
        setError('Meetings per billing cycle is required.')
        setSaving(false)
        return
      }
      if (!form.cost || parseFloat(form.cost) < 0) {
        setError('Monthly cost is required.')
        setSaving(false)
        return
      }
      payload = {
        offering_type: 'arrangement',
        name: form.name.trim(),
        description: form.description.trim() || null,
        meetings_per_period: parseInt(form.meetings_per_period),
        program_duration_periods: form.program_duration_periods !== '' ? parseInt(form.program_duration_periods) : null,
        duration_value: parseInt(form.meetings_per_period),
        duration_unit: 'Meetings',
        cost: parseFloat(form.cost),
        setup_fee: form.setup_fee !== '' ? parseFloat(form.setup_fee) : null,
        billing_type: 'recurring',
        cancellation_policy: form.cancellation_policy,
        cancellation_window_hours: form.cancellation_policy === 'window' ? (parseInt(form.cancellation_window_hours) || 24) : null,
        allow_activities: form.allow_activities,
        active: form.active,
        billing_end_months: form.billing_end_mode === 'fixed' && form.billing_end_months !== '' ? parseInt(form.billing_end_months) : null,
        invoice_delay_days: form.invoice_delay_days !== '' ? parseInt(form.invoice_delay_days) : null,
      }
    } else {
      payload = {
        offering_type: 'course',
        name: form.name.trim(),
        duration_value: form.duration_value !== '' ? parseInt(form.duration_value, 10) : null,
        duration_unit: form.duration_value !== '' ? form.duration_unit : null,
        cost: form.cost !== '' ? parseFloat(form.cost) : null,
        setup_fee: form.setup_fee !== '' ? parseFloat(form.setup_fee) : null,
        billing_type: form.billing_type || 'recurring',
        description: form.description.trim() || null,
        active: form.active,
        cancellation_policy: null,
        invoice_delay_days: form.invoice_delay_days !== '' ? parseInt(form.invoice_delay_days) : null,
      }
    }

    let err
    if (editId) {
      ;({ error: err } = await supabase.from('offerings').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('offerings').insert(payload))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    if (!editId) refreshEntityCounts()
    closeForm()
    load()
  }

  async function handleDelete() {
    if (!deleteId) return
    await supabase.from('offerings').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
    refreshEntityCounts()
  }

  async function toggleActive(offering) {
    await supabase.from('offerings').update({ active: !offering.active }).eq('id', offering.id)
    load()
  }

  function formatDuration(o) {
    if (o.offering_type === 'arrangement') {
      const mpp = o.meetings_per_period || o.duration_value
      if (!mpp) return '—'
      const dur = o.program_duration_periods ? ` · ${o.program_duration_periods} mo` : ''
      return `${mpp}×/mo${dur}`
    }
    if (!o.duration_value) return '—'
    return `${o.duration_value} ${o.duration_unit}`
  }

  function formatCost(o) {
    if (o.cost == null) return '—'
    return `$${parseFloat(o.cost).toFixed(2)}`
  }

  function cancelPolicyLabel(policy) {
    if (policy === 'reallocate') return { label: 'Always Re-allocate', color: '#0d9488', bg: '#f0fdfa', border: '#a7f3d0' }
    if (policy === 'consume') return { label: 'Never Re-allocate', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
    return { label: 'Time-Window', color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  }

  const arrangements = offerings.filter(o => o.offering_type === 'arrangement')
  const courses = offerings.filter(o => o.offering_type !== 'arrangement')
  const visible = tab === 'arrangement' ? arrangements : tab === 'course' ? courses : offerings

  const isArrangementForm = form.offering_type === 'arrangement'
  const totalMeetings = isArrangementForm && form.meetings_per_period && form.program_duration_periods
    ? parseInt(form.meetings_per_period) * parseInt(form.program_duration_periods)
    : null

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Offerings</h1>
          <p style={s.sub}>Manage arrangements (meeting-based) and courses (lesson-based)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            style={{ ...s.addBtn, background: 'linear-gradient(135deg, #0d9488, #10b981)', ...(offeringLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            onClick={offeringLimit.atLimit ? undefined : () => navigate('/admin/offerings/arrangement/new')}
            disabled={offeringLimit.atLimit}
          >
            <CalendarDays size={14} strokeWidth={2.5} /> New Arrangement
          </button>
          <button
            style={{ ...s.addBtn, ...(offeringLimit.atLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            onClick={offeringLimit.atLimit ? undefined : () => navigate('/admin/offerings/course/new')}
            disabled={offeringLimit.atLimit}
          >
            <Plus size={15} strokeWidth={2.5} /> New Course
          </button>
        </div>
      </div>

      {offeringLimit.atLimit && (
        <PlanLimitBanner entityLabel="offerings" current={offeringLimit.current} max={offeringLimit.max} plan={plan} />
      )}

      {error && !showForm && <div style={s.errorBanner}>{error}</div>}

      {/* Tabs */}
      <div style={s.tabs}>
        {[
          { key: 'all',         label: `All (${offerings.length})` },
          { key: 'arrangement', label: `Arrangements (${arrangements.length})`, icon: CalendarDays },
          { key: 'course',      label: `Courses (${courses.length})`, icon: BookOpen },
        ].map(t => (
          <button
            key={t.key}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => setTab(t.key)}
          >
            {t.icon && <t.icon size={13} strokeWidth={2} />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'arrangement' && (
        <div style={s.infoBox}>
          <CalendarDays size={15} color="#0d9488" style={{ flexShrink: 0 }} />
          <p style={s.infoText}>
            <strong>Arrangements</strong> are meeting-based programs (e.g. "4x Mentoring"). Each billing cycle a mentee is credited the number of meetings defined in the arrangement. Cancellation policies control whether a missed session credit is returned or consumed. Credits are granted automatically when an invoice is marked paid.
          </p>
        </div>
      )}

      {tab === 'course' && (
        <div style={s.infoBox}>
          <Package size={15} color="#7c3aed" style={{ flexShrink: 0 }} />
          <p style={s.infoText}>
            <strong>Courses</strong> are structured learning programs with lessons, modules, and content that mentees progress through at their own pace or on a schedule. Courses can include quizzes, assignments, and completion tracking. Pricing can be one-time or recurring.
          </p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyCard}>
          {tab === 'arrangement' ? <CalendarDays size={32} color="#d1d5db" strokeWidth={1.5} /> : <Package size={32} color="#d1d5db" strokeWidth={1.5} />}
          <p style={s.emptyText}>
            {tab === 'arrangement' ? 'No arrangements yet.' : tab === 'course' ? 'No courses yet.' : 'No offerings yet.'}
          </p>
        </div>
      ) : (
        <div style={s.list}>
          {visible.map(o => {
            const isArr = o.offering_type === 'arrangement'
            const cp = isArr ? cancelPolicyLabel(o.cancellation_policy) : null
            return (
              <div key={o.id} style={s.listRow}>
                <div style={{ ...s.iconWrap, background: isArr ? '#f0fdfa' : '#f5f3ff' }}>
                  {isArr
                    ? <CalendarDays size={16} color="#0d9488" strokeWidth={1.8} />
                    : <BookOpen size={16} color="#8b5cf6" strokeWidth={1.8} />
                  }
                </div>
                <div style={s.rowMeta}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={s.offeringName}>{o.name}</span>
                    <span style={{ ...s.typePill, ...(isArr ? s.typePillArrangement : s.typePillCourse) }}>
                      {isArr ? 'Arrangement' : 'Course'}
                    </span>
                    {isArr && cp && (
                      <span style={{ ...s.typePill, background: cp.bg, color: cp.color, border: `1px solid ${cp.border}` }}>
                        {cp.label}
                      </span>
                    )}
                    {isArr && o.allow_activities && (
                      <span style={{ ...s.typePill, background: '#faf5ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                        <Activity size={9} style={{ display: 'inline', marginRight: 2 }} />Activities
                      </span>
                    )}
                  </div>
                  {o.description && <div style={s.offeringDesc}>{o.description}</div>}
                </div>
                <div style={s.pillRow}>
                  <div style={s.pill}>
                    {isArr ? <Users size={11} strokeWidth={2} color="#0d9488" /> : <Clock size={11} strokeWidth={2} color="#6366f1" />}
                    <span>{formatDuration(o)}</span>
                  </div>
                  {isArr && o.billing_period_months && (
                    <div style={s.pill}>
                      <Clock size={11} strokeWidth={2} color="#6b7280" />
                      <span>{o.billing_period_months}mo</span>
                    </div>
                  )}
                  <div style={s.pill}>
                    <DollarSign size={11} strokeWidth={2} color="#10b981" />
                    <span>{formatCost(o)}{isArr ? '/mo' : ''}</span>
                  </div>
                  {!isArr && (
                    o.billing_type === 'one_time'
                      ? <div style={{ ...s.pill, color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }}>One-time</div>
                      : <div style={{ ...s.pill, color: '#0d9488', background: '#f0fdfa', borderColor: '#a7f3d0' }}><RefreshCw size={10} /> Recurring</div>
                  )}
                  {o.setup_fee > 0 && (
                    <div style={{ ...s.pill, color: '#b45309', background: '#fffbeb', borderColor: '#fde68a' }}>
                      +${parseFloat(o.setup_fee).toFixed(2)} setup
                    </div>
                  )}
                  {isArr && o.cancellation_policy && (
                    <div style={{
                      ...s.pill,
                      ...(o.cancellation_policy === 'reallocate'
                        ? { color: '#10b981', background: '#f0fdf4', borderColor: '#bbf7d0' }
                        : o.cancellation_policy === 'consume'
                          ? { color: '#ef4444', background: '#fff5f5', borderColor: '#fecaca' }
                          : { color: '#6366f1', background: '#eef2ff', borderColor: '#c7d2fe' }),
                    }}>
                      <ShieldCheck size={10} strokeWidth={2} />
                      <span>
                        {o.cancellation_policy === 'reallocate' && 'Always re-alloc'}
                        {o.cancellation_policy === 'consume' && 'Always consumed'}
                        {o.cancellation_policy === 'window' && `${o.cancellation_window_hours || 24}h window`}
                      </span>
                    </div>
                  )}
                  {isArr && o.credits_rollover && (
                    <div style={{ ...s.pill, color: '#0d9488', background: '#f0fdfa', borderColor: '#a7f3d0' }}>
                      <RefreshCw size={10} strokeWidth={2} /> Rollover
                    </div>
                  )}
                  {isArr && o.activities_enabled?.whiteboard && (
                    <div style={{ ...s.pill, color: '#6366f1', background: '#eef2ff', borderColor: '#c7d2fe' }}>
                      <FileText size={10} strokeWidth={2} /> WB
                    </div>
                  )}
                  {isArr && o.activities_enabled?.checkin_form && (
                    <div style={{ ...s.pill, color: '#0d9488', background: '#f0fdfa', borderColor: '#a7f3d0' }}>
                      <ClipboardList size={10} strokeWidth={2} /> Check-in
                    </div>
                  )}
                </div>
                <div style={s.rowActions}>
                  <button
                    style={{ ...s.activeToggle, color: o.active ? '#10b981' : '#9ca3af' }}
                    onClick={() => toggleActive(o)}
                    title={o.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  >
                    {o.active ? <ToggleRight size={20} strokeWidth={1.8} /> : <ToggleLeft size={20} strokeWidth={1.8} />}
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {o.active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                  {!isArr && (
                    <button style={s.buildBtn} onClick={() => navigate(`/admin/offerings/${o.id}/build`)} title="Build Course">
                      <BookOpen size={12} strokeWidth={2} /> Build Course
                    </button>
                  )}
                  <button style={s.iconBtn}
                    onClick={() => isArr
                      ? navigate(`/admin/offerings/arrangement/${o.id}/edit`)
                      : navigate(`/admin/offerings/course/${o.id}/edit`)}
                    title="Edit">
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button style={{ ...s.iconBtn, ...s.iconBtnDanger }} onClick={() => setDeleteId(o.id)} title="Delete">
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && closeForm()}>
          <div style={{ ...s.modal, maxWidth: isArrangementForm ? 600 : 540 }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>
                {editId ? 'Edit' : 'New'} {isArrangementForm ? 'Arrangement' : 'Course'}
              </h2>
              <button style={s.closeBtn} onClick={closeForm}><X size={18} /></button>
            </div>

            <div style={s.modalBody}>
              {error && <div style={s.errorBanner}>{error}</div>}

              {isArrangementForm ? (
                /* ── Arrangement form ── */
                <>
                  {/* Section: Program Info */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Program Info</div>
                    <div style={s.formSectionBody}>
                      <div>
                        <label style={s.label}>Name <span style={s.req}>*</span></label>
                        <input style={s.input} placeholder="e.g. 4× Mentoring"
                          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={s.label}>Description</label>
                        <textarea style={{ ...s.input, ...s.textarea }}
                          placeholder="Optional description of what's included…"
                          value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {/* Section: Schedule & Billing */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Schedule &amp; Billing</div>
                    <div style={s.formSectionBody}>
                      <div style={s.row}>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Meetings per billing cycle <span style={s.req}>*</span></label>
                          <input style={s.input} type="number" min="1" placeholder="e.g. 4"
                            value={form.meetings_per_period}
                            onChange={e => setForm(f => ({ ...f, meetings_per_period: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Program length (months)</label>
                          <input style={s.input} type="number" min="1" placeholder="e.g. 6 — blank = ongoing"
                            value={form.program_duration_periods}
                            onChange={e => setForm(f => ({ ...f, program_duration_periods: e.target.value }))} />
                        </div>
                      </div>

                      {/* Total entitlement callout */}
                      {totalMeetings !== null && (
                        <div style={s.entitlementBox}>
                          <Info size={14} color="#0d9488" style={{ flexShrink: 0 }} />
                          <span>
                            Total entitlement: <strong>{totalMeetings} meetings</strong> over <strong>{form.program_duration_periods} months</strong>
                            <span style={{ color: '#6b7280' }}> ({form.meetings_per_period}/month)</span>
                          </span>
                        </div>
                      )}

                      <div style={s.row}>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Monthly cost ($) <span style={s.req}>*</span></label>
                          <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00"
                            value={form.cost}
                            onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm(f => ({ ...f, cost: v.toFixed(2) })) }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>One-time setup fee ($)</label>
                          <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00 (optional)"
                            value={form.setup_fee}
                            onChange={e => setForm(f => ({ ...f, setup_fee: e.target.value }))}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm(f => ({ ...f, setup_fee: v.toFixed(2) })) }} />
                        </div>
                      </div>
                      <p style={s.fieldNote}>Billing is monthly. Credits are automatically granted when an invoice is marked paid.</p>
                    </div>
                  </div>

                  {/* Section: Billing Duration */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Billing Duration</div>
                    <div style={s.formSectionBody}>
                      <p style={s.fieldNote}>Choose whether this arrangement has a fixed billing end date or runs indefinitely until manually closed.</p>
                      {[
                        {
                          value: 'indefinite',
                          icon: RefreshCw,
                          iconColor: '#10b981',
                          title: 'Run Indefinitely',
                          desc: 'Billing continues until manually closed by an administrator.',
                        },
                        {
                          value: 'fixed',
                          icon: CalendarDays,
                          iconColor: '#6366f1',
                          title: 'Fixed End Date',
                          desc: 'Billing automatically ends after a set number of months from enrollment.',
                        },
                      ].map(opt => {
                        const active = form.billing_end_mode === opt.value
                        return (
                          <div
                            key={opt.value}
                            style={{ ...s.radioCard, ...(active ? s.radioCardActive : {}) }}
                            onClick={() => setForm(f => ({ ...f, billing_end_mode: opt.value }))}
                          >
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? '#6366f1' : '#d1d5db'}`, background: active ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <opt.icon size={16} color={opt.iconColor} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', marginBottom: '0.15rem' }}>{opt.title}</div>
                              <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>{opt.desc}</div>
                            </div>
                          </div>
                        )
                      })}

                      {form.billing_end_mode === 'fixed' && (
                        <div style={{ paddingLeft: '0.5rem' }}>
                          <label style={s.label}>Billing duration (months)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input style={{ ...s.input, maxWidth: 120 }} type="number" min="1" max="120"
                              placeholder="e.g. 6"
                              value={form.billing_end_months}
                              onChange={e => setForm(f => ({ ...f, billing_end_months: e.target.value }))} />
                            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>months from enrollment date</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section: Cancellation Policy */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Cancellation Policy</div>
                    <div style={s.formSectionBody}>
                      <p style={s.fieldNote}>Determines whether a missed or cancelled appointment counts against the mentee's credit allocation.</p>
                      {[
                        {
                          value: 'reallocate',
                          icon: RefreshCw,
                          iconColor: '#0d9488',
                          title: 'Always Re-allocate',
                          desc: 'Credit is returned to the mentee whenever a meeting is cancelled, regardless of timing.',
                        },
                        {
                          value: 'window',
                          icon: Clock,
                          iconColor: '#d97706',
                          title: 'Time-Window Re-allocate',
                          desc: 'Credit is returned only if cancelled before the window. Cancellations within the window consume the credit.',
                        },
                        {
                          value: 'consume',
                          icon: ShieldAlert,
                          iconColor: '#dc2626',
                          title: 'Never Re-allocate',
                          desc: 'Cancelled meetings always consume the credit. Encourages commitment.',
                        },
                      ].map(opt => {
                        const active = form.cancellation_policy === opt.value
                        return (
                          <div
                            key={opt.value}
                            style={{ ...s.radioCard, ...(active ? s.radioCardActive : {}) }}
                            onClick={() => setForm(f => ({ ...f, cancellation_policy: opt.value }))}
                          >
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? '#6366f1' : '#d1d5db'}`, background: active ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <opt.icon size={16} color={opt.iconColor} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', marginBottom: '0.15rem' }}>{opt.title}</div>
                              <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>{opt.desc}</div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Window hours sub-field */}
                      {form.cancellation_policy === 'window' && (
                        <div style={{ paddingLeft: '0.5rem' }}>
                          <label style={s.label}>Cancellation window (hours)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input style={{ ...s.input, maxWidth: 120 }} type="number" min="1" max="168"
                              value={form.cancellation_window_hours}
                              onChange={e => setForm(f => ({ ...f, cancellation_window_hours: e.target.value }))} />
                            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>hours before the meeting</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section: Features */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Features</div>
                    <div style={s.formSectionBody}>
                      <div style={s.featureRow} onClick={() => setForm(f => ({ ...f, allow_activities: !f.allow_activities }))}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>Allow Activities</div>
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                            Enables mentors to issue whiteboard exercises and check-in forms to this mentee.
                          </div>
                        </div>
                        <button type="button" style={{ ...s.activeToggle, color: form.allow_activities ? '#8b5cf6' : '#9ca3af' }}>
                          {form.allow_activities ? <ToggleRight size={26} strokeWidth={1.8} /> : <ToggleLeft size={26} strokeWidth={1.8} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section: Invoice Delay Override */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Invoice Delay Override</div>
                    <div style={s.formSectionBody}>
                      <p style={s.fieldNote}>
                        Override the company-wide default invoice delay for this offering. Leave blank to use the company default.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input style={{ ...s.input, maxWidth: 120 }} type="number" min="0" max="365"
                          placeholder="Default"
                          value={form.invoice_delay_days}
                          onChange={e => setForm(f => ({ ...f, invoice_delay_days: e.target.value }))} />
                        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>days after assignment</span>
                      </div>
                      <p style={{ ...s.fieldNote, marginTop: '0.25rem' }}>
                        Set to 0 to issue the invoice immediately when assigned. For example, 15 means the mentee won't receive their invoice until 15 days after assignment.
                      </p>
                    </div>
                  </div>

                  {/* Section: Status */}
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Status</div>
                    <div style={s.formSectionBody}>
                      <div style={s.featureRow} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>Active</div>
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                            Inactive arrangements won't appear when assigning to new mentees.
                          </div>
                        </div>
                        <button type="button" style={{ ...s.activeToggle, color: form.active ? '#10b981' : '#9ca3af' }}>
                          {form.active ? <ToggleRight size={26} strokeWidth={1.8} /> : <ToggleLeft size={26} strokeWidth={1.8} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Course form ── */
                <>
                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Course Info</div>
                    <div style={s.formSectionBody}>
                      <div>
                        <label style={s.label}>Name <span style={s.req}>*</span></label>
                        <input style={s.input} placeholder="e.g. JumpStart Your Freedom"
                          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={s.label}>Description</label>
                        <textarea style={{ ...s.input, ...s.textarea }}
                          placeholder="Optional description of what's included…"
                          value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Duration &amp; Billing</div>
                    <div style={s.formSectionBody}>
                      <div style={s.row}>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Duration</label>
                          <input style={s.input} type="number" min="1" placeholder="e.g. 3"
                            value={form.duration_value}
                            onChange={e => setForm(f => ({ ...f, duration_value: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Unit</label>
                          <select style={s.input} value={form.duration_unit}
                            onChange={e => setForm(f => ({ ...f, duration_unit: e.target.value }))}>
                            {DURATION_UNITS_COURSE.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={s.row}>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Cost ($)</label>
                          <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00"
                            value={form.cost}
                            onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm(f => ({ ...f, cost: v.toFixed(2) })) }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>Billing Type</label>
                          <select style={s.input} value={form.billing_type}
                            onChange={e => setForm(f => ({ ...f, billing_type: e.target.value }))}>
                            <option value="recurring">Recurring Monthly</option>
                            <option value="one_time">One-time Payment</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={s.label}>One-time Setup Fee ($)</label>
                        <input style={s.input} type="number" min="0" step="0.01" placeholder="0.00 (optional)"
                          value={form.setup_fee}
                          onChange={e => setForm(f => ({ ...f, setup_fee: e.target.value }))}
                          onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm(f => ({ ...f, setup_fee: v.toFixed(2) })) }} />
                      </div>
                    </div>
                  </div>

                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Invoice Delay Override</div>
                    <div style={s.formSectionBody}>
                      <p style={s.fieldNote}>
                        Override the company-wide default invoice delay for this offering. Leave blank to use the company default.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input style={{ ...s.input, maxWidth: 120 }} type="number" min="0" max="365"
                          placeholder="Default"
                          value={form.invoice_delay_days}
                          onChange={e => setForm(f => ({ ...f, invoice_delay_days: e.target.value }))} />
                        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>days after assignment</span>
                      </div>
                      <p style={{ ...s.fieldNote, marginTop: '0.25rem' }}>
                        Set to 0 to issue the invoice immediately when assigned. For example, 15 means the mentee won't receive their invoice until 15 days after assignment.
                      </p>
                    </div>
                  </div>

                  <div style={s.formSection}>
                    <div style={s.formSectionTitle}>Status</div>
                    <div style={s.formSectionBody}>
                      <div style={s.featureRow} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>Active</div>
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                            Inactive courses won't appear when assigning to new mentees.
                          </div>
                        </div>
                        <button type="button" style={{ ...s.activeToggle, color: form.active ? '#10b981' : '#9ca3af' }}>
                          {form.active ? <ToggleRight size={26} strokeWidth={1.8} /> : <ToggleLeft size={26} strokeWidth={1.8} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={closeForm}>Cancel</button>
              <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
                <Check size={14} strokeWidth={2.5} />
                {saving ? 'Saving…' : editId ? 'Save Changes' : `Create ${isArrangementForm ? 'Arrangement' : 'Course'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div style={{ ...s.modal, maxWidth: 440 }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Delete Offering</h2>
              <button style={s.closeBtn} onClick={() => setDeleteId(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{ color: '#374151', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                Are you sure? This will permanently remove the offering and may affect assigned mentees.
              </p>
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button style={{ ...s.saveBtn, background: '#ef4444' }} onClick={handleDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(99,102,241,0.3)', cursor: 'pointer' },
  tabs: { display: 'flex', gap: '0.3rem', marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem' },
  tab: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 79, background: '#fff', color: '#6b7280', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  tabActive: { background: '#eef2ff', borderColor: '#c7d2fe', color: '#4f46e5' },
  infoBox: { display: 'flex', alignItems: 'flex-start', gap: '0.65rem', backgroundColor: '#f0fdfa', border: '1px solid #a7f3d0', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1rem' },
  infoText: { fontSize: '0.82rem', color: '#374151', lineHeight: 1.55, margin: 0 },
  buildBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.8rem', border: '1.5px solid #ddd6fe', borderRadius: 8, background: '#f5f3ff', color: '#7c3aed', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '3rem', color: '#9ca3af' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 7, padding: '3rem', textAlign: 'center', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  emptyText: { color: '#6b7280', fontSize: '0.9rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  listRow: { backgroundColor: '#fff', borderRadius: 7, padding: '0.85rem 1rem', boxShadow: 'var(--shadow)', border: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' },
  iconWrap: { width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowMeta: { flex: 1, minWidth: 160 },
  offeringName: { fontWeight: 700, color: '#111827', fontSize: '0.9rem' },
  offeringDesc: { color: '#9ca3af', fontSize: '0.77rem', lineHeight: 1.4, marginTop: '0.15rem' },
  typePill: { display: 'inline-flex', alignItems: 'center', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 79, flexShrink: 0 },
  typePillArrangement: { background: '#f0fdfa', color: '#0d9488', border: '1px solid #a7f3d0' },
  typePillCourse: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' },
  activeToggle: { background: 'none', border: 'none', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0, cursor: 'pointer', borderRadius: 7, border: '1px solid #e5e7eb' },
  pillRow: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flexShrink: 0 },
  pill: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.22rem 0.6rem', borderRadius: 79, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', fontSize: '0.73rem', color: '#374151', fontWeight: 500 },
  rowActions: { display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 },
  iconBtn: { width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer' },
  iconBtnDanger: { color: '#ef4444', borderColor: '#fecaca', background: '#fff5f5' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' },
  modal: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 540, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 },
  modalTitle: { fontSize: '1rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', color: '#9ca3af', display: 'flex', padding: 4, cursor: 'pointer' },
  modalBody: { padding: '0', display: 'flex', flexDirection: 'column' },
  modalFooter: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid #f3f4f6', position: 'sticky', bottom: 0, backgroundColor: '#fff' },
  formSection: { borderBottom: '1px solid #f3f4f6' },
  formSectionTitle: { padding: '0.55rem 1.5rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', textTransform: 'uppercase', letterSpacing: '0.07em' },
  formSectionBody: { padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem', display: 'block' },
  req: { color: '#ef4444' },
  input: { width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', background: '#fff', boxSizing: 'border-box' },
  textarea: { resize: 'vertical', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5 },
  row: { display: 'flex', gap: '0.75rem' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  fieldNote: { fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.5, margin: 0 },
  entitlementBox: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', backgroundColor: '#f0fdfa', border: '1px solid #a7f3d0', borderRadius: 7, fontSize: '0.82rem', color: '#0d9488' },
  radioCard: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', backgroundColor: '#fff', transition: 'border-color 0.15s, background 0.15s' },
  radioCardActive: { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  featureRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' },
  errorBanner: { padding: '0.7rem 1rem', backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.82rem', margin: '1rem 1.5rem 0' },
  cancelBtn: { padding: '0.5rem 1.1rem', border: '1.5px solid #e5e7eb', borderRadius: 7, background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.25rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
}
