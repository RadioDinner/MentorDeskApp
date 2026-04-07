import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Pencil, Send, CheckCircle, XCircle, X, Save } from 'lucide-react'

export default function InvoiceActions({ invoice, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [result, setResult] = useState(null)

  const isPending = invoice.status === 'pending' || invoice.status === 'overdue'

  function openEdit() {
    setForm({
      amount: invoice.amount ?? '',
      due_date: invoice.due_date ?? '',
      description: invoice.description ?? '',
      status: invoice.status,
    })
    setEditing(true)
    setResult(null)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    const { error } = await supabase.from('invoices').update({
      amount: parseFloat(form.amount) || 0,
      due_date: form.due_date,
      description: form.description || null,
      status: form.status,
      paid_at: form.status === 'paid' ? new Date().toISOString() : null,
    }).eq('id', invoice.id)
    setSaving(false)
    if (error) {
      setResult({ type: 'error', text: error.message })
    } else {
      setResult({ type: 'success', text: 'Invoice updated.' })
      setEditing(false)
      onUpdate?.()
    }
  }

  async function handleMarkPaid() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', invoice.id)
    setSaving(false)
    if (error) setResult({ type: 'error', text: error.message })
    else onUpdate?.()
  }

  async function handleCancel() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      status: 'cancelled',
    }).eq('id', invoice.id)
    setSaving(false)
    if (error) setResult({ type: 'error', text: error.message })
    else onUpdate?.()
  }

  async function handleResend() {
    setResending(true)
    setResult(null)
    const { data, error } = await supabase.functions.invoke('send-invoice-email', {
      body: { invoice_id: invoice.id },
    })
    setResending(false)
    if (error || data?.error) {
      setResult({ type: 'error', text: data?.error || error.message || 'Failed to send invoice email.' })
    } else {
      setResult({ type: 'success', text: 'Invoice sent to mentee.' })
    }
    setTimeout(() => setResult(null), 4000)
  }

  if (editing && form) {
    return (
      <div style={st.editOverlay}>
        <form onSubmit={handleSaveEdit} style={st.editForm}>
          <div style={st.editHeader}>
            <span style={st.editTitle}>Edit Invoice</span>
            <button type="button" style={st.closeBtn} onClick={() => setEditing(false)}><X size={15} /></button>
          </div>
          <div style={st.editRow}>
            <div style={st.editField}>
              <label style={st.editLabel}>Amount ($)</label>
              <input style={st.editInput} type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div style={st.editField}>
              <label style={st.editLabel}>Due Date</label>
              <input style={st.editInput} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required />
            </div>
            <div style={st.editField}>
              <label style={st.editLabel}>Status</label>
              <select style={st.editInput} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div style={st.editField}>
            <label style={st.editLabel}>Description</label>
            <input style={st.editInput} type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          {result && (
            <div style={result.type === 'success' ? st.successMsg : st.errorMsg}>{result.text}</div>
          )}
          <div style={st.editActions}>
            <button type="button" style={st.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" style={st.saveBtn} disabled={saving}>
              <Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div style={st.actions}>
      {result && (
        <span style={{ fontSize: '0.72rem', color: result.type === 'success' ? '#16a34a' : '#dc2626', marginRight: '0.25rem' }}>
          {result.text}
        </span>
      )}
      <button style={st.actionBtn} onClick={openEdit} title="Edit invoice">
        <Pencil size={12} />
      </button>
      {isPending && (
        <>
          <button style={st.actionBtn} onClick={handleResend} disabled={resending} title="Resend invoice">
            <Send size={12} />
          </button>
          <button style={{ ...st.actionBtn, ...st.paidBtn }} onClick={handleMarkPaid} disabled={saving} title="Mark as paid">
            <CheckCircle size={12} />
          </button>
          <button style={{ ...st.actionBtn, ...st.cancelActionBtn }} onClick={handleCancel} disabled={saving} title="Cancel invoice">
            <XCircle size={12} />
          </button>
        </>
      )}
    </div>
  )
}

const st = {
  actions: { display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 },
  actionBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', flexShrink: 0 },
  paidBtn: { borderColor: '#bbf7d0', color: '#16a34a' },
  cancelActionBtn: { borderColor: '#fecaca', color: '#dc2626' },
  editOverlay: { padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', marginTop: '0.5rem' },
  editForm: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  editHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  editTitle: { fontSize: '0.82rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2, display: 'flex' },
  editRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' },
  editField: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  editLabel: { fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  editInput: { padding: '0.45rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.82rem', color: '#111827', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' },
  editActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' },
  cancelBtn: { padding: '0.4rem 0.8rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.78rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  successMsg: { fontSize: '0.78rem', color: '#16a34a', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.4rem 0.65rem' },
  errorMsg: { fontSize: '0.78rem', color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.4rem 0.65rem' },
}
