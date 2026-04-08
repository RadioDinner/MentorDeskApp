import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Plus, X, Receipt, CheckCircle, Clock, AlertCircle, DollarSign, Search, Zap } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import InvoiceActions from '../components/InvoiceActions'

const STATUS_STYLES = {
  pending:   { bg: '#fff7ed', color: '#ea580c' },
  overdue:   { bg: '#fef2f2', color: '#dc2626' },
  paid:      { bg: '#f0fdf4', color: '#16a34a' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
}

const STATUS_ICONS = {
  pending:   Clock,
  overdue:   AlertCircle,
  paid:      CheckCircle,
  cancelled: X,
}

const EMPTY_INVOICE = {
  mentee_id: '',
  offering_id: '',
  amount: '',
  due_date: new Date().toISOString().split('T')[0],
  description: '',
  notes: '',
}

export default function Invoicing() {
  const navigate = useNavigate()
  const { organizationId } = useRole()
  const [invoices, setInvoices] = useState([])
  const [mentees, setMentees] = useState([])
  const [offerings, setOfferings] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_INVOICE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [defaultNotes, setDefaultNotes] = useState('')
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const [batchPreview, setBatchPreview] = useState([])

  function fmt(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0)
  }

  useEffect(() => {
    fetchAll()
  }, [organizationId])

  async function fetchAll() {
    setLoading(true)
    const [inv, men, off, settingsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, mentee:mentees(id, first_name, last_name, email), offering:offerings(name)')
        .order('due_date', { ascending: false }),
      supabase.from('mentees').select('id, first_name, last_name, email').neq('is_test_account', true).order('last_name'),
      supabase.from('offerings').select('id, name, cost, billing_type, active, invoice_delay_days').order('name'),
      supabase.from('settings').select('key, value').eq('organization_id', organizationId)
        .in('key', ['currency', 'invoice_default_notes', 'payment_terms', 'invoice_delay_days']),
    ])
    if (inv.data) {
      const today = new Date().toISOString().split('T')[0]
      setInvoices(inv.data.map(i =>
        i.status === 'pending' && i.due_date < today ? { ...i, status: 'overdue' } : i
      ))
    }
    if (men.data) setMentees(men.data)
    if (off.data) setOfferings(off.data)
    if (settingsRes.data) {
      const get = k => settingsRes.data.find(s => s.key === k)?.value || ''
      if (get('currency')) setCurrency(get('currency'))
      if (get('invoice_default_notes')) setDefaultNotes(get('invoice_default_notes'))
    }
    setLoading(false)
  }

  function handleNewChange(e) {
    const { name, value } = e.target
    setNewForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'offering_id' && value) {
        const off = offerings.find(o => o.id === value)
        if (off) next.amount = String(off.cost)
      }
      return next
    })
  }

  async function handleCreateInvoice(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('invoices').insert({
        mentee_id: newForm.mentee_id,
        offering_id: newForm.offering_id || null,
        amount: parseFloat(newForm.amount),
        due_date: newForm.due_date,
        description: newForm.description || null,
        notes: newForm.notes || null,
        organization_id: organizationId,
        issued_at: new Date().toISOString(),
      })
      if (err) {
        setError(err.message)
      } else {
        setSuccess('Invoice created.')
        setNewForm(EMPTY_INVOICE)
        setShowNew(false)
        fetchAll()
      }
    } catch (err) {
      setError(err.message || 'Failed to create invoice.')
    } finally {
      setSaving(false)
    }
  }

  // ── Batch generation ──────────────────────────────────────────────────────
  // Find all active mentees with active offerings that don't already have a
  // pending/overdue invoice for that offering, and preview them.

  async function prepareBatchGeneration() {
    setError(null)
    setBatchGenerating(true)

    // Load mentee-offering assignments
    const { data: assignments } = await supabase
      .from('mentee_offerings')
      .select('mentee_id, offering_id')

    if (!assignments || assignments.length === 0) {
      setError('No mentee-offering assignments found.')
      setBatchGenerating(false)
      return
    }

    // Active offerings lookup
    const activeOfferings = offerings.filter(o => o.active !== false)
    const offeringMap = Object.fromEntries(activeOfferings.map(o => [o.id, o]))

    // Find existing open invoices (pending or overdue) per mentee+offering
    const openInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'overdue')
    const openKeys = new Set(openInvoices.map(i => `${i.mentee_id}:${i.offering_id}`))

    // Settings for due date calc
    const settingsRes = await supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .in('key', ['payment_terms', 'invoice_delay_days'])
    const getSetting = k => settingsRes.data?.find(s => s.key === k)?.value || ''
    const companyDelayDays = parseInt(getSetting('invoice_delay_days')) || 0
    const paymentTerms = getSetting('payment_terms') || 'due_on_receipt'
    const termsDays = { due_on_receipt: 0, net_15: 15, net_30: 30, net_45: 45, net_60: 60 }

    const menteeMap = Object.fromEntries(mentees.map(m => [m.id, m]))

    const preview = []
    for (const a of assignments) {
      const off = offeringMap[a.offering_id]
      if (!off || !off.cost || parseFloat(off.cost) <= 0) continue
      if (openKeys.has(`${a.mentee_id}:${a.offering_id}`)) continue

      const mentee = menteeMap[a.mentee_id]
      if (!mentee) continue

      const delayDays = off.invoice_delay_days != null ? off.invoice_delay_days : companyDelayDays
      const today = new Date()
      const issueDate = new Date(today)
      issueDate.setDate(issueDate.getDate() + delayDays)
      const dueDate = new Date(issueDate)
      dueDate.setDate(dueDate.getDate() + (termsDays[paymentTerms] || 0))

      const billingLabel = off.billing_type === 'one_time' ? '' : ' (Monthly)'

      preview.push({
        mentee_id: a.mentee_id,
        mentee_name: `${mentee.first_name} ${mentee.last_name}`,
        offering_id: a.offering_id,
        offering_name: off.name,
        amount: parseFloat(off.cost),
        due_date: dueDate.toISOString().split('T')[0],
        description: `${off.name}${billingLabel}`,
      })
    }

    if (preview.length === 0) {
      setError('No new invoices to generate. All active mentees with offerings already have open invoices.')
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
      mentee_id: p.mentee_id,
      offering_id: p.offering_id,
      amount: p.amount,
      due_date: p.due_date,
      description: p.description,
      notes: defaultNotes || null,
      organization_id: organizationId,
      issued_at: new Date().toISOString(),
    }))

    const { error: err } = await supabase.from('invoices').insert(rows)
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

  // ── Filtering & search ────────────────────────────────────────────────────

  const filtered = invoices.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${i.mentee?.first_name || ''} ${i.mentee?.last_name || ''}`.toLowerCase()
      const num = (i.invoice_number || '').toLowerCase()
      const email = (i.mentee?.email || '').toLowerCase()
      if (!name.includes(q) && !num.includes(q) && !email.includes(q)) return false
    }
    return true
  })

  const stats = {
    pending: invoices.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.amount), 0),
    overdue: invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
  }

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'paid', label: 'Paid' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Invoicing</h1>
          <p style={s.sub}>Manage and process invoices for mentee subscriptions</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            style={s.batchBtn}
            onClick={prepareBatchGeneration}
            disabled={batchGenerating}
          >
            <Zap size={14} strokeWidth={2.5} />
            {batchGenerating ? 'Scanning…' : 'Generate Invoices'}
          </button>
          <button style={s.addBtn} onClick={() => { setShowNew(true); setError(null); setNewForm({ ...EMPTY_INVOICE, notes: defaultNotes }) }}>
            <Plus size={15} strokeWidth={2.5} /> New Invoice
          </button>
        </div>
      </div>

      {success && <div style={s.successBox}>{success}<button style={s.dismissBtn} onClick={() => setSuccess(null)}><X size={13} /></button></div>}
      {error && <div style={s.errorBox}>{error}<button style={s.dismissBtn} onClick={() => setError(null)}><X size={13} /></button></div>}

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard label="Pending" value={fmt(stats.pending)} icon={Clock} color="#ea580c" bg="#fff7ed" />
        <StatCard label="Overdue" value={fmt(stats.overdue)} icon={AlertCircle} color="#dc2626" bg="#fef2f2" />
        <StatCard label="Paid (all time)" value={fmt(stats.paid)} icon={DollarSign} color="#16a34a" bg="#f0fdf4" />
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
              The following invoices will be created for mentees with active offerings that don't already have an open invoice:
            </p>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: 6 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Mentee', 'Offering', 'Amount', 'Due Date'].map(h => <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {batchPreview.map((p, i) => (
                    <tr key={i} style={s.tr}>
                      <td style={s.td}><span style={s.menteeName}>{p.mentee_name}</span></td>
                      <td style={s.td}><span style={s.offeringText}>{p.offering_name}</span></td>
                      <td style={s.td}><span style={s.amount}>{fmt(p.amount)}</span></td>
                      <td style={s.td}><span style={s.dateText}>{p.due_date}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={s.formActions}>
              <button type="button" style={s.cancelBtn} onClick={() => { setShowBatchConfirm(false); setBatchPreview([]) }}>Cancel</button>
              <button style={s.saveBtn} onClick={executeBatchGeneration} disabled={batchGenerating}>
                {batchGenerating ? 'Generating…' : `Generate ${batchPreview.length} Invoice${batchPreview.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New invoice form */}
      {showNew && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>New Invoice</h2>
            <button style={s.closeBtn} onClick={() => setShowNew(false)}><X size={16} /></button>
          </div>
          <form onSubmit={handleCreateInvoice} style={s.form}>
            <div style={s.formRow}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Mentee *</label>
                <select style={s.input} name="mentee_id" value={newForm.mentee_id} onChange={handleNewChange} required>
                  <option value="">— Select mentee —</option>
                  {mentees.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Offering</label>
                <select style={s.input} name="offering_id" value={newForm.offering_id} onChange={handleNewChange}>
                  <option value="">— None / Custom —</option>
                  {offerings.filter(o => o.active !== false).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <div style={s.formRow}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Amount ({currency}) *</label>
                <input style={s.input} type="number" name="amount" value={newForm.amount} onChange={handleNewChange} min="0" step="0.01" required />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Due Date *</label>
                <input style={s.input} type="date" name="due_date" value={newForm.due_date} onChange={handleNewChange} required />
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Description</label>
              <input style={s.input} name="description" value={newForm.description} onChange={handleNewChange} placeholder="Optional description…" />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Notes / Payment Instructions</label>
              <textarea
                style={{ ...s.input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
                name="notes"
                value={newForm.notes}
                onChange={handleNewChange}
                placeholder="Payment instructions shown on the invoice…"
              />
            </div>
            <div style={s.formActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>{saving ? 'Creating…' : 'Create Invoice'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={s.filterRow}>
        <div style={s.tabs}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span style={{ ...s.tabCount, ...(filter === f.key ? s.tabCountActive : {}) }}>
                {f.key === 'all' ? invoices.length : invoices.filter(i => i.status === f.key).length}
              </span>
            </button>
          ))}
        </div>
        <div style={s.searchWrap}>
          <Search size={14} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search by name, email, or invoice #…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          <Receipt size={36} color="#d1d5db" strokeWidth={1.5} />
          <p>{search ? 'No invoices match your search.' : `No ${filter === 'all' ? '' : filter} invoices found.`}</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Invoice #', 'Mentee', 'Offering / Description', 'Amount', 'Issued', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const ss = STATUS_STYLES[inv.status] || STATUS_STYLES.pending
                const Icon = STATUS_ICONS[inv.status] || Clock
                return (
                  <tr key={inv.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={{ ...s.invoiceNum, cursor: 'pointer', textDecoration: 'none' }} onClick={() => navigate(`/admin/invoices/${inv.id}`)}>{inv.invoice_number || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <div style={s.menteeName}>{inv.mentee?.first_name} {inv.mentee?.last_name}</div>
                      {inv.mentee?.email && <div style={s.menteeEmail}>{inv.mentee.email}</div>}
                    </td>
                    <td style={s.td}>
                      <span style={s.offeringText}>{inv.offering?.name || inv.description || '—'}</span>
                      {inv.notes && <div style={s.notesPreview} title={inv.notes}>Has notes</div>}
                    </td>
                    <td style={s.td}>
                      <span style={s.amount}>{fmt(inv.amount)}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.dateText}>{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.dateText}>{inv.due_date}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, backgroundColor: ss.bg, color: ss.color }}>
                        <Icon size={11} />
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </td>
                    <td style={s.td}>
                      <InvoiceActions invoice={inv} onUpdate={fetchAll} />
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

function StatCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIcon, backgroundColor: bg }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={s.statValue}>{value}</div>
        <div style={s.statLabel}>{label}</div>
      </div>
    </div>
  )
}

const s = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(99,102,241,0.3)', cursor: 'pointer' },
  batchBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#fff', color: '#6366f1', border: '1.5px solid #6366f1', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  successBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  dismissBtn: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { backgroundColor: '#fff', borderRadius: 4, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6' },
  statIcon: { width: 36, height: 36, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue: { fontWeight: 700, fontSize: '1.15rem', color: '#111827', letterSpacing: '-0.02em' },
  statLabel: { fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 },
  card: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-md)', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '1.25rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6' },
  cardTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' },
  cancelBtn: { padding: '0.6rem 1.1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' },
  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: '0.25rem' },
  tab: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  tabActive: { borderColor: '#6366f1', color: '#6366f1', background: '#eef2ff' },
  tabCount: { padding: '0.1rem 0.45rem', borderRadius: 49, background: '#f3f4f6', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280' },
  tabCountActive: { background: '#c7d2fe', color: '#4338ca' },
  searchWrap: { position: 'relative', flexShrink: 0 },
  searchInput: { padding: '0.45rem 0.85rem 0.45rem 2rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.82rem', color: '#111827', width: 260, backgroundColor: '#fff', boxSizing: 'border-box' },
  tableWrap: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.85rem 1rem', verticalAlign: 'middle' },
  invoiceNum: { fontWeight: 600, color: '#6366f1', fontSize: '0.82rem', fontFamily: 'monospace' },
  menteeName: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  menteeEmail: { color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.1rem' },
  offeringText: { color: '#374151', fontSize: '0.875rem' },
  notesPreview: { fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.15rem' },
  amount: { fontWeight: 700, color: '#111827', fontSize: '0.9rem' },
  dateText: { color: '#6b7280', fontSize: '0.85rem' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: 49, fontSize: '0.75rem', fontWeight: 600 },
  empty: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
}
