import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { PLAN_LIMITS } from '../constants/planLimits'
import {
  Receipt, Plus, X, Search, Clock, AlertCircle, CheckCircle, DollarSign,
  Send, Zap, Building2, XCircle, Filter
} from 'lucide-react'

const STATUS_STYLES = {
  draft:     { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  pending:   { bg: '#fff7ed', color: '#ea580c', label: 'Pending' },
  sent:      { bg: '#eff6ff', color: '#3b82f6', label: 'Sent' },
  paid:      { bg: '#f0fdf4', color: '#16a34a', label: 'Paid' },
  overdue:   { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
  void:      { bg: '#f1f5f9', color: '#64748b', label: 'Void' },
}

const STATUS_ICONS = {
  draft: Filter, pending: Clock, sent: Send, paid: CheckCircle,
  overdue: AlertCircle, cancelled: XCircle, void: XCircle,
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'Pending' },
  { key: 'sent', label: 'Sent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
]

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

export default function PlatformInvoicing() {
  const [invoices, setInvoices] = useState([])
  const [orgs, setOrgs] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const [batchPreview, setBatchPreview] = useState([])
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [newForm, setNewForm] = useState({
    organization_id: '', plan_key: '', amount: '', due_date: '', description: '', notes: '',
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [invRes, orgsRes] = await Promise.all([
      supabase
        .from('platform_invoices')
        .select('*, organization:organizations(id, name, slug, plan, discount_percent)')
        .order('created_at', { ascending: false }),
      supabase
        .from('organizations')
        .select('id, name, slug, plan, status, discount_percent, active')
        .order('name'),
    ])

    if (invRes.data) {
      const today = new Date().toISOString().split('T')[0]
      setInvoices(invRes.data.map(i =>
        (i.status === 'pending' || i.status === 'sent') && i.due_date && i.due_date < today
          ? { ...i, status: 'overdue' } : i
      ))
    }
    if (orgsRes.data) setOrgs(orgsRes.data.filter(o => (o.status || (o.active ? 'active' : 'archived')) === 'active'))
    setLoading(false)
  }

  // ── Single invoice creation ───────────────────────────────────────────────

  function handleNewChange(e) {
    const { name, value } = e.target
    setNewForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'organization_id' && value) {
        const org = orgs.find(o => o.id === value)
        if (org) {
          const planDef = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free
          next.plan_key = org.plan
          const price = planDef.price || 0
          const discount = org.discount_percent || 0
          next.amount = String((price * (1 - discount / 100)).toFixed(2))
          next.description = `MentorDesk ${planDef.label} Plan — Monthly Subscription`
        }
      }
      return next
    })
  }

  async function handleCreateInvoice(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const org = orgs.find(o => o.id === newForm.organization_id)
    const planDef = PLAN_LIMITS[newForm.plan_key] || PLAN_LIMITS.free
    const basePrice = planDef.price || 0
    const discount = org?.discount_percent || 0
    const discountAmt = basePrice * (discount / 100)

    const today = new Date()
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    const { error: err } = await supabase.from('platform_invoices').insert({
      organization_id: newForm.organization_id,
      plan_key: newForm.plan_key || org?.plan || 'free',
      amount: parseFloat(newForm.amount),
      subtotal: basePrice,
      discount_percent: discount,
      discount_amount: discountAmt,
      due_date: newForm.due_date || null,
      description: newForm.description || null,
      notes: newForm.notes || null,
      billing_period_start: periodStart.toISOString().split('T')[0],
      billing_period_end: periodEnd.toISOString().split('T')[0],
      issued_at: new Date().toISOString(),
      status: 'pending',
    })

    if (err) {
      setError(err.message)
    } else {
      setSuccess('Invoice created.')
      setShowNew(false)
      setNewForm({ organization_id: '', plan_key: '', amount: '', due_date: '', description: '', notes: '' })
      fetchAll()
    }
    setSaving(false)
  }

  // ── Batch generation ──────────────────────────────────────────────────────

  async function prepareBatchGeneration() {
    setError(null)
    setBatchGenerating(true)

    const today = new Date()
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const periodKey = periodStart.toISOString().split('T')[0]

    // Find orgs that already have an invoice for this billing period
    const existingForPeriod = invoices.filter(i =>
      i.billing_period_start === periodKey && i.status !== 'cancelled' && i.status !== 'void'
    )
    const existingOrgIds = new Set(existingForPeriod.map(i => i.organization_id))

    const preview = []
    for (const org of orgs) {
      if (existingOrgIds.has(org.id)) continue
      const planDef = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free
      if (!planDef.price || planDef.price <= 0) continue // skip free and enterprise/custom

      const discount = org.discount_percent || 0
      const amount = planDef.price * (1 - discount / 100)

      const dueDate = new Date(periodStart)
      dueDate.setDate(dueDate.getDate() + 30)

      preview.push({
        organization_id: org.id,
        org_name: org.name,
        plan: org.plan,
        plan_label: planDef.label,
        subtotal: planDef.price,
        discount,
        amount,
        due_date: dueDate.toISOString().split('T')[0],
        billing_period_start: periodKey,
        billing_period_end: periodEnd.toISOString().split('T')[0],
        description: `MentorDesk ${planDef.label} Plan — Monthly Subscription`,
      })
    }

    if (preview.length === 0) {
      setError('No new invoices to generate. All billable organizations already have invoices for this period.')
      setBatchGenerating(false)
      return
    }

    setBatchPreview(preview)
    setShowBatchConfirm(true)
    setBatchGenerating(false)
  }

  async function executeBatchGeneration() {
    setBatchGenerating(true)
    setError(null)

    const rows = batchPreview.map(p => ({
      organization_id: p.organization_id,
      plan_key: p.plan,
      amount: p.amount,
      subtotal: p.subtotal,
      discount_percent: p.discount,
      discount_amount: p.subtotal - p.amount,
      due_date: p.due_date,
      billing_period_start: p.billing_period_start,
      billing_period_end: p.billing_period_end,
      description: p.description,
      issued_at: new Date().toISOString(),
      status: 'pending',
    }))

    const { error: err } = await supabase.from('platform_invoices').insert(rows)
    if (err) {
      setError(`Batch generation failed: ${err.message}`)
    } else {
      setSuccess(`${rows.length} invoice${rows.length === 1 ? '' : 's'} generated successfully.`)
      fetchAll()
    }
    setShowBatchConfirm(false)
    setBatchPreview([])
    setBatchGenerating(false)
  }

  // ── Mark paid / cancel ────────────────────────────────────────────────────

  async function markPaid(id) {
    await supabase.from('platform_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  async function markCancelled(id) {
    await supabase.from('platform_invoices').update({ status: 'cancelled' }).eq('id', id)
    fetchAll()
  }

  async function markSent(id) {
    await supabase.from('platform_invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = invoices.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (i.organization?.name || '').toLowerCase()
      const num = (i.invoice_number || '').toLowerCase()
      const slug = (i.organization?.slug || '').toLowerCase()
      if (!name.includes(q) && !num.includes(q) && !slug.includes(q)) return false
    }
    return true
  })

  const stats = {
    pending: invoices.filter(i => i.status === 'pending' || i.status === 'sent').reduce((s, i) => s + Number(i.amount), 0),
    overdue: invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
    pendingCount: invoices.filter(i => i.status === 'pending' || i.status === 'sent').length,
    overdueCount: invoices.filter(i => i.status === 'overdue').length,
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Platform Invoicing</h1>
          <p style={s.sub}>Generate and manage subscription invoices for your customer organizations</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={s.batchBtn} onClick={prepareBatchGeneration} disabled={batchGenerating}>
            <Zap size={14} strokeWidth={2.5} />
            {batchGenerating ? 'Scanning...' : 'Generate Monthly Invoices'}
          </button>
          <button style={s.addBtn} onClick={() => { setShowNew(true); setError(null) }}>
            <Plus size={15} strokeWidth={2.5} /> New Invoice
          </button>
        </div>
      </div>

      {success && <div style={s.successBox}>{success}<button style={s.dismissBtn} onClick={() => setSuccess(null)}><X size={13} /></button></div>}
      {error && <div style={s.errorBox}>{error}<button style={s.dismissBtn} onClick={() => setError(null)}><X size={13} /></button></div>}

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard label="Pending" value={fmt(stats.pending)} count={stats.pendingCount} icon={Clock} color="#ea580c" bg="#fff7ed" />
        <StatCard label="Overdue" value={fmt(stats.overdue)} count={stats.overdueCount} icon={AlertCircle} color="#dc2626" bg="#fef2f2" />
        <StatCard label="Collected (all time)" value={fmt(stats.paid)} icon={DollarSign} color="#16a34a" bg="#f0fdf4" />
      </div>

      {/* Batch generation confirmation */}
      {showBatchConfirm && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>Generate {batchPreview.length} Invoice{batchPreview.length === 1 ? '' : 's'}</h2>
            <button style={s.closeBtn} onClick={() => { setShowBatchConfirm(false); setBatchPreview([]) }}><X size={16} /></button>
          </div>
          <div style={{ padding: '1rem 1.25rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Monthly subscription invoices for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}. Organizations on paid plans without an existing invoice for this period:
            </p>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Organization', 'Plan', 'Subtotal', 'Discount', 'Amount', 'Due Date'].map(h => <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {batchPreview.map((p, i) => (
                    <tr key={i} style={s.tr}>
                      <td style={s.td}><span style={{ fontWeight: 600, color: '#0f172a' }}>{p.org_name}</span></td>
                      <td style={s.td}><span style={s.planBadge(p.plan)}>{p.plan_label}</span></td>
                      <td style={s.td}>{fmt(p.subtotal)}</td>
                      <td style={s.td}>{p.discount > 0 ? `${p.discount}%` : '—'}</td>
                      <td style={s.td}><span style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(p.amount)}</span></td>
                      <td style={s.td}><span style={{ color: '#64748b', fontSize: '0.85rem' }}>{p.due_date}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                Total: {fmt(batchPreview.reduce((s, p) => s + p.amount, 0))}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={s.cancelBtn} onClick={() => { setShowBatchConfirm(false); setBatchPreview([]) }}>Cancel</button>
                <button style={s.saveBtn} onClick={executeBatchGeneration} disabled={batchGenerating}>
                  {batchGenerating ? 'Generating...' : `Generate ${batchPreview.length} Invoice${batchPreview.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New invoice form */}
      {showNew && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>New Platform Invoice</h2>
            <button style={s.closeBtn} onClick={() => setShowNew(false)}><X size={16} /></button>
          </div>
          <form onSubmit={handleCreateInvoice} style={s.form}>
            <div style={s.formRow}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Organization *</label>
                <select style={s.input} name="organization_id" value={newForm.organization_id} onChange={handleNewChange} required>
                  <option value="">— Select organization —</option>
                  {orgs.map(o => {
                    const pd = PLAN_LIMITS[o.plan] || PLAN_LIMITS.free
                    return <option key={o.id} value={o.id}>{o.name} ({pd.label}{pd.price ? ` — $${pd.price}/mo` : ''})</option>
                  })}
                </select>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Plan</label>
                <select style={s.input} name="plan_key" value={newForm.plan_key} onChange={handleNewChange}>
                  <option value="free">Free</option>
                  <option value="starter">Starter ($49/mo)</option>
                  <option value="pro">Pro ($149/mo)</option>
                  <option value="enterprise">Enterprise (Custom)</option>
                </select>
              </div>
            </div>
            <div style={s.formRow}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Amount (USD) *</label>
                <input style={s.input} type="number" name="amount" value={newForm.amount} onChange={handleNewChange} min="0" step="0.01" required />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Due Date</label>
                <input style={s.input} type="date" name="due_date" value={newForm.due_date} onChange={handleNewChange} />
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Description</label>
              <input style={s.input} name="description" value={newForm.description} onChange={handleNewChange} placeholder="e.g. MentorDesk Pro Plan — Monthly Subscription" />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Notes</label>
              <textarea style={{ ...s.input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} name="notes" value={newForm.notes} onChange={handleNewChange} placeholder="Internal notes..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" style={s.cancelBtn} onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters + search */}
      <div style={s.filterRow}>
        <div style={s.tabs}>
          {FILTERS.map(f => (
            <button key={f.key} style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }} onClick={() => setFilter(f.key)}>
              {f.label}
              <span style={{ ...s.tabCount, ...(filter === f.key ? s.tabCountActive : {}) }}>
                {f.key === 'all' ? invoices.length : invoices.filter(i => i.status === f.key).length}
              </span>
            </button>
          ))}
        </div>
        <div style={s.searchWrap}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input style={s.searchInput} type="text" placeholder="Search by org name, slug, or invoice #..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div style={s.empty}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          <Receipt size={36} color="#cbd5e1" strokeWidth={1.5} />
          <p>{search ? 'No invoices match your search.' : filter === 'all' ? 'No platform invoices yet. Generate monthly invoices to get started.' : `No ${filter} invoices.`}</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Invoice #', 'Organization', 'Plan', 'Period', 'Amount', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const ss = STATUS_STYLES[inv.status] || STATUS_STYLES.pending
                const Icon = STATUS_ICONS[inv.status] || Clock
                const isPending = ['pending', 'sent', 'overdue', 'draft'].includes(inv.status)
                return (
                  <tr key={inv.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.invoiceNum}>{inv.invoice_number || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <Link to={`/organizations/${inv.organization_id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{inv.organization?.name || '—'}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>{inv.organization?.slug}</div>
                      </Link>
                    </td>
                    <td style={s.td}>
                      <span style={s.planBadge(inv.plan_key)}>{(PLAN_LIMITS[inv.plan_key] || {}).label || inv.plan_key}</span>
                    </td>
                    <td style={s.td}>
                      {inv.billing_period_start && inv.billing_period_end ? (
                        <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                          {new Date(inv.billing_period_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}{' '}
                          {new Date(inv.billing_period_start + 'T00:00:00').getFullYear()}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={s.td}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{fmt(inv.amount)}</span>
                        {inv.discount_percent > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#16a34a' }}>{inv.discount_percent}% off {fmt(inv.subtotal)}</div>
                        )}
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{inv.due_date || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, backgroundColor: ss.bg, color: ss.color }}>
                        <Icon size={11} /> {ss.label}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {isPending && (
                          <>
                            {inv.status !== 'sent' && (
                              <button style={s.actionBtn} onClick={() => markSent(inv.id)} title="Mark as sent">
                                <Send size={12} />
                              </button>
                            )}
                            <button style={{ ...s.actionBtn, borderColor: '#bbf7d0', color: '#16a34a' }} onClick={() => markPaid(inv.id)} title="Mark as paid">
                              <CheckCircle size={12} />
                            </button>
                            <button style={{ ...s.actionBtn, borderColor: '#fecaca', color: '#dc2626' }} onClick={() => markCancelled(inv.id)} title="Cancel">
                              <XCircle size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, count, icon: Icon, color, bg }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIcon, backgroundColor: bg }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={s.statValue}>{value}</div>
        <div style={s.statLabel}>{label}{count != null ? ` (${count})` : ''}</div>
      </div>
    </div>
  )
}

const PLAN_COLORS = { free: '#64748b', starter: '#3b82f6', pro: '#7c3aed', enterprise: '#d97706' }

const s = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#64748b', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(220,38,38,0.3)', cursor: 'pointer' },
  batchBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#fff', color: '#dc2626', border: '1.5px solid #dc2626', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  successBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  dismissBtn: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', border: '1px solid #e2e8f0' },
  statIcon: { width: 36, height: 36, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue: { fontWeight: 700, fontSize: '1.15rem', color: '#0f172a', letterSpacing: '-0.02em' },
  statLabel: { fontSize: '0.75rem', color: '#64748b', fontWeight: 500 },
  card: { backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '1.25rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' },
  cardTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: '0.875rem', color: '#0f172a', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  cancelBtn: { padding: '0.55rem 1rem', background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, cursor: 'pointer' },
  saveBtn: { padding: '0.55rem 1.2rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: '0.25rem' },
  tab: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer' },
  tabActive: { borderColor: '#dc2626', color: '#dc2626', background: '#fef2f2' },
  tabCount: { padding: '0.1rem 0.45rem', borderRadius: 49, background: '#f1f5f9', fontSize: '0.7rem', fontWeight: 700, color: '#64748b' },
  tabCountActive: { background: '#fecaca', color: '#991b1b' },
  searchWrap: { position: 'relative', flexShrink: 0 },
  searchInput: { padding: '0.45rem 0.85rem 0.45rem 2rem', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem', color: '#0f172a', width: 280, backgroundColor: '#fff', boxSizing: 'border-box' },
  tableWrap: { backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '0.85rem 1rem', verticalAlign: 'middle' },
  invoiceNum: { fontWeight: 600, color: '#dc2626', fontSize: '0.82rem', fontFamily: 'monospace' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: 49, fontSize: '0.75rem', fontWeight: 600 },
  planBadge: (plan) => ({
    display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 6,
    fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
    backgroundColor: (PLAN_COLORS[plan] || '#64748b') + '14',
    color: PLAN_COLORS[plan] || '#64748b',
  }),
  actionBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', flexShrink: 0 },
  empty: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
}
