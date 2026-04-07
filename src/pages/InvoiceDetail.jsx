import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { ArrowLeft, Printer, Download, Pencil, Save, X, CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'

const STATUS_STYLES = {
  pending:   { bg: '#fff7ed', color: '#ea580c', label: 'Pending' },
  overdue:   { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  paid:      { bg: '#f0fdf4', color: '#16a34a', label: 'Paid' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
}

const STATUS_ICONS = { pending: Clock, overdue: AlertCircle, paid: CheckCircle, cancelled: XCircle }

export default function InvoiceDetail({ readOnly = false }) {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { organizationId, activeRole } = useRole()
  const printRef = useRef(null)

  const [invoice, setInvoice] = useState(null)
  const [org, setOrg] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadInvoice() }, [invoiceId])

  async function loadInvoice() {
    setLoading(true)
    const [invRes, settingsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, mentee:mentees(id, first_name, last_name, email, phone), offering:offerings(name, billing_type, offering_type)')
        .eq('id', invoiceId)
        .single(),
      supabase
        .from('settings')
        .select('key, value')
        .eq('organization_id', organizationId)
        .in('key', ['company_name', 'company_logo', 'company_logo_horizontal', 'currency', 'payment_terms']),
    ])

    if (invRes.data) {
      const inv = invRes.data
      // Auto-mark overdue
      const today = new Date().toISOString().split('T')[0]
      if (inv.status === 'pending' && inv.due_date < today) inv.status = 'overdue'
      setInvoice(inv)
    }

    if (settingsRes.data) {
      const map = {}
      settingsRes.data.forEach(s => { map[s.key] = s.value })
      setOrg(map)
    }
    setLoading(false)
  }

  function startEdit() {
    setEditForm({
      amount: invoice.amount,
      due_date: invoice.due_date,
      description: invoice.description || '',
      notes: invoice.notes || '',
      status: invoice.status === 'overdue' ? 'pending' : invoice.status,
    })
    setEditing(true)
    setError(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('invoices').update({
      amount: parseFloat(editForm.amount) || 0,
      due_date: editForm.due_date,
      description: editForm.description || null,
      notes: editForm.notes || null,
      status: editForm.status,
      paid_at: editForm.status === 'paid' ? new Date().toISOString() : invoice.paid_at,
    }).eq('id', invoiceId)

    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setEditing(false)
      loadInvoice()
    }
  }

  async function handleMarkPaid() {
    setSaving(true)
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId)
    setSaving(false)
    loadInvoice()
  }

  function handlePrint() {
    const el = printRef.current
    if (!el) return
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoice.invoice_number}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; color: #111827; padding: 2rem; font-size: 14px; }
        @media print { body { padding: 0; } }
      </style></head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  if (loading) return <div style={st.center}>Loading…</div>
  if (!invoice) return <div style={st.center}>Invoice not found.</div>

  const ss = STATUS_STYLES[invoice.status] || STATUS_STYLES.pending
  const Icon = STATUS_ICONS[invoice.status] || Clock
  const currency = org.currency || 'USD'
  const fmt = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amt || 0)
  const isAdmin = activeRole === 'admin' || activeRole === 'staff' || activeRole === 'super_admin'
  const canEdit = isAdmin && !readOnly
  const isPending = invoice.status === 'pending' || invoice.status === 'overdue'
  const backPath = readOnly ? '/mentee' : '/admin/invoicing'

  return (
    <div>
      {/* Header bar */}
      <div style={st.headerBar}>
        <button style={st.backBtn} onClick={() => navigate(backPath)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={st.printBtn} onClick={handlePrint}>
            <Printer size={14} /> Print / PDF
          </button>
          {canEdit && !editing && (
            <button style={st.editBtn} onClick={startEdit}>
              <Pencil size={14} /> Edit
            </button>
          )}
          {canEdit && isPending && !editing && (
            <button style={st.paidBtn} onClick={handleMarkPaid} disabled={saving}>
              <CheckCircle size={14} /> Mark Paid
            </button>
          )}
        </div>
      </div>

      {error && <div style={st.errorBox}>{error}</div>}

      {/* Edit form */}
      {editing && (
        <div style={st.editCard}>
          <form onSubmit={handleSave} style={st.editForm}>
            <div style={st.editRow}>
              <div style={st.editField}>
                <label style={st.editLabel}>Amount ({currency})</label>
                <input style={st.editInput} type="number" step="0.01" min="0" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div style={st.editField}>
                <label style={st.editLabel}>Due Date</label>
                <input style={st.editInput} type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} required />
              </div>
              <div style={st.editField}>
                <label style={st.editLabel}>Status</label>
                <select style={st.editInput} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div style={st.editField}>
              <label style={st.editLabel}>Description</label>
              <input style={st.editInput} type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={st.editField}>
              <label style={st.editLabel}>Notes / Payment Instructions</label>
              <textarea style={{ ...st.editInput, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" style={st.cancelBtn} onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
              <button type="submit" style={st.saveBtn} disabled={saving}><Save size={13} /> {saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Printable invoice */}
      <div ref={printRef}>
        <div style={st.invoiceCard}>
          {/* Invoice header */}
          <div style={st.invoiceHeader}>
            <div>
              {org.company_logo_horizontal || org.company_logo
                ? <img src={org.company_logo_horizontal || org.company_logo} alt="" style={{ height: 36, objectFit: 'contain', marginBottom: '0.5rem' }} />
                : <div style={st.companyName}>{org.company_name || 'Invoice'}</div>
              }
              {(org.company_logo_horizontal || org.company_logo) && (
                <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{org.company_name}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={st.invoiceTitle}>INVOICE</div>
              <div style={st.invoiceNumber}>{invoice.invoice_number || '—'}</div>
              <div style={{ ...st.statusBadge, backgroundColor: ss.bg, color: ss.color }}>
                <Icon size={12} /> {ss.label}
              </div>
            </div>
          </div>

          <div style={st.divider} />

          {/* Bill to + dates */}
          <div style={st.detailGrid}>
            <div>
              <div style={st.detailLabel}>BILL TO</div>
              <div style={st.detailValue}>{invoice.mentee?.first_name} {invoice.mentee?.last_name}</div>
              {invoice.mentee?.email && <div style={st.detailSub}>{invoice.mentee.email}</div>}
              {invoice.mentee?.phone && <div style={st.detailSub}>{invoice.mentee.phone}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={st.detailLabel}>ISSUED</div>
                <div style={st.detailValue}>{invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : '—'}</div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={st.detailLabel}>DUE DATE</div>
                <div style={st.detailValue}>{invoice.due_date}</div>
              </div>
              {invoice.paid_at && (
                <div>
                  <div style={st.detailLabel}>PAID</div>
                  <div style={st.detailValue}>{new Date(invoice.paid_at).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          </div>

          <div style={st.divider} />

          {/* Line items */}
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>Description</th>
                <th style={{ ...st.th, textAlign: 'center' }}>Type</th>
                <th style={{ ...st.th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={st.td}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{invoice.offering?.name || invoice.description || 'Invoice charge'}</div>
                  {invoice.mentee && (
                    <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.15rem' }}>{invoice.mentee.first_name} {invoice.mentee.last_name}</div>
                  )}
                </td>
                <td style={{ ...st.td, textAlign: 'center' }}>
                  <span style={st.typeBadge}>
                    {invoice.offering?.offering_type === 'course' ? 'Course' :
                     invoice.offering?.billing_type === 'one_time' ? 'One-time' :
                     invoice.offering?.billing_type === 'recurring' ? 'Recurring' : '—'}
                  </span>
                </td>
                <td style={{ ...st.td, textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{fmt(invoice.amount)}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ ...st.td, textAlign: 'right', fontWeight: 700, color: '#374151', borderTop: '2px solid #e5e7eb' }}>Total</td>
                <td style={{ ...st.td, textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: '#111827', borderTop: '2px solid #e5e7eb' }}>{fmt(invoice.amount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          {invoice.notes && (
            <div style={st.notesSection}>
              <div style={st.detailLabel}>NOTES / PAYMENT INSTRUCTIONS</div>
              <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{invoice.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const st = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#94a3b8' },
  headerBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  backBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 6, color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  printBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 6, color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  editBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: '#fff', border: '1.5px solid #6366f1', borderRadius: 6, color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  paidBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', background: 'var(--primary-gradient)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' },
  editCard: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-md)', border: '1px solid #f3f4f6', padding: '1.25rem', marginBottom: '1.25rem' },
  editForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  editRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' },
  editField: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  editLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  editInput: { padding: '0.5rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box' },
  cancelBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.85rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 6, color: '#6b7280', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.85rem', background: 'var(--primary-gradient)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  invoiceCard: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-md)', border: '1px solid #f3f4f6', padding: '2rem', maxWidth: 720 },
  invoiceHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  companyName: { fontSize: '1.25rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' },
  invoiceTitle: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' },
  invoiceNumber: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace', marginBottom: '0.5rem' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.75rem', borderRadius: 49, fontSize: '0.78rem', fontWeight: 700 },
  divider: { height: 1, backgroundColor: '#f3f4f6', margin: '1.25rem 0' },
  detailGrid: { display: 'flex', justifyContent: 'space-between' },
  detailLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' },
  detailValue: { fontSize: '0.9rem', fontWeight: 600, color: '#111827' },
  detailSub: { fontSize: '0.82rem', color: '#6b7280', marginTop: '0.1rem' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' },
  th: { padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '2px solid #e5e7eb' },
  td: { padding: '0.85rem 0.75rem', verticalAlign: 'middle' },
  typeBadge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', fontWeight: 600 },
  notesSection: { marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' },
}
