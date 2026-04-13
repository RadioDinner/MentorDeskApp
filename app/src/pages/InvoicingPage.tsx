import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import InvoiceEditModal from '../components/InvoiceEditModal'
import type { InvoiceEditUpdates } from '../components/InvoiceEditModal'
import { logAudit } from '../lib/audit'
import { formatMoney, formatDate, formatDateShort } from '../lib/format'
import { Badge, toneForStatus, Skeleton, PageBar } from '../components/ui'
import type { BadgeTone } from '../components/ui'
import type { Invoice, InvoiceStatus } from '../types'

const PAGE_SIZE = 25

type FilterTab = 'all' | 'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled'

interface InvoiceRow extends Invoice {
  mentee: { id: string; first_name: string; last_name: string; email: string } | null
  mentee_offering: { id: string; offering: { id: string; name: string } | null } | null
}

function isOverdue(inv: InvoiceRow): boolean {
  if (inv.status !== 'sent') return false
  if (!inv.due_date) return false
  return new Date(inv.due_date).getTime() < Date.now()
}

function effectiveStatus(inv: InvoiceRow): InvoiceStatus | 'overdue' {
  return isOverdue(inv) ? 'overdue' : inv.status
}

const STATUS_LABELS: Record<InvoiceStatus | 'overdue', string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

// Override `cancelled` to the muted tone (shared `toneForStatus` maps
// it there already, but we keep this explicit for strike-through).
const STATUS_TONES: Record<InvoiceStatus | 'overdue', BadgeTone> = {
  draft:     toneForStatus('draft'),
  sent:      toneForStatus('sent'),
  paid:      toneForStatus('paid'),
  overdue:   toneForStatus('overdue'),
  cancelled: toneForStatus('cancelled'),
}

export default function InvoicingPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const [editing, setEditing] = useState<InvoiceRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id

    async function loadInvoices() {
      setLoading(true)
      setError(null)
      try {
        const res = await supabaseRestGet<InvoiceRow>(
          'invoices',
          `select=*,mentee:mentees(id,first_name,last_name,email),mentee_offering:mentee_offerings(id,offering:offerings(id,name))` +
            `&organization_id=eq.${orgId}` +
            `&order=created_at.desc`,
          { label: 'invoicing:list' },
        )
        if (res.error) { setError(res.error.message); return }
        setInvoices(res.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[InvoicingPage] loadInvoices error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadInvoices
    loadInvoices()
  }, [profile?.organization_id])

  // ─────────── Actions (status transitions) ───────────

  async function transition(inv: InvoiceRow, next: InvoiceStatus) {
    if (!profile) return
    setActing(inv.id)
    const updates: Record<string, unknown> = { status: next }
    if (next === 'paid') updates.paid_at = new Date().toISOString()
    else updates.paid_at = null

    const { error: err } = await supabase.from('invoices').update(updates).eq('id', inv.id)
    setActing(null)
    if (err) {
      toast.error(err.message)
      return
    }
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...updates } as InvoiceRow : i))
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'invoice',
      entity_id: inv.id,
      details: { from: inv.status, to: next, amount_cents: inv.amount_cents },
    })
  }

  async function saveEdit(updates: InvoiceEditUpdates) {
    if (!profile || !editing) return
    const oldVals = {
      invoice_number: editing.invoice_number,
      line_description: editing.line_description,
      amount_cents: editing.amount_cents,
      due_date: editing.due_date,
      notes: editing.notes,
    }
    const { error: err } = await supabase.from('invoices').update(updates).eq('id', editing.id)
    if (err) {
      throw new Error(err.message)
    }
    setInvoices(prev => prev.map(i => i.id === editing.id ? { ...i, ...updates } as InvoiceRow : i))
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'invoice',
      entity_id: editing.id,
      details: { fields: 'content' },
      old_values: oldVals,
      new_values: updates as unknown as Record<string, unknown>,
    })
    setEditing(null)
  }

  async function deleteInvoice(inv: InvoiceRow) {
    if (!profile) return
    setActing(inv.id)
    const { error: err } = await supabase.from('invoices').delete().eq('id', inv.id)
    setActing(null)
    if (err) {
      toast.error(err.message)
      return
    }
    setInvoices(prev => prev.filter(i => i.id !== inv.id))
    setConfirmDelete(null)
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'deleted',
      entity_type: 'invoice',
      entity_id: inv.id,
      details: {
        invoice_number: inv.invoice_number,
        amount_cents: inv.amount_cents,
        status: inv.status,
      },
    })
  }

  // ─────────── Derived data ───────────

  const summary = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    let outstanding = 0
    let paidThisMonth = 0
    let overdueCount = 0
    for (const inv of invoices) {
      if (inv.status === 'sent') outstanding += inv.amount_cents
      if (inv.status === 'paid' && inv.paid_at && new Date(inv.paid_at).getTime() >= monthStart) {
        paidThisMonth += inv.amount_cents
      }
      if (isOverdue(inv)) overdueCount += 1
    }
    return { outstanding, paidThisMonth, overdueCount }
  }, [invoices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      const eff = effectiveStatus(inv)
      if (filter !== 'all' && eff !== filter) return false
      if (q) {
        const menteeName = inv.mentee ? `${inv.mentee.first_name} ${inv.mentee.last_name}`.toLowerCase() : ''
        const menteeEmail = inv.mentee?.email?.toLowerCase() ?? ''
        const invoiceNum = inv.invoice_number?.toLowerCase() ?? ''
        const offeringName = inv.mentee_offering?.offering?.name?.toLowerCase() ?? ''
        if (!menteeName.includes(q) && !menteeEmail.includes(q) && !invoiceNum.includes(q) && !offeringName.includes(q)) return false
      }
      return true
    })
  }, [invoices, filter, search])

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: invoices.length, draft: 0, sent: 0, overdue: 0, paid: 0, cancelled: 0 }
    for (const inv of invoices) {
      const eff = effectiveStatus(inv)
      counts[eff as FilterTab] = (counts[eff as FilterTab] ?? 0) + 1
    }
    return counts
  }, [invoices])

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  // ─────────── Render ───────────

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Invoicing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and process invoices across your organization.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          label="Outstanding"
          value={formatMoney(summary.outstanding)}
          caption="Sent, awaiting payment"
          color="blue"
        />
        <SummaryCard
          label="Paid this month"
          value={formatMoney(summary.paidThisMonth)}
          caption={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          color="green"
        />
        <SummaryCard
          label="Overdue"
          value={String(summary.overdueCount)}
          caption={summary.overdueCount === 1 ? 'invoice past due' : 'invoices past due'}
          color="red"
        />
      </div>

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden">
          {(['all', 'draft', 'sent', 'overdue', 'paid', 'cancelled'] as FilterTab[]).map((tab, i) => (
            <button
              key={tab}
              onClick={() => { setFilter(tab); setPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                i > 0 ? 'border-l border-gray-200' : ''
              } ${
                filter === tab
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab}
              <span className="ml-1.5 text-[10px] tabular-nums text-gray-400">
                {tabCounts[tab] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by mentee, invoice #, or engagement..."
          className="flex-1 min-w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {/* Body */}
      {loading ? (
        <Skeleton count={8} className="h-11 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No invoices found.</p>
          <p className="text-xs text-gray-400 mt-1">
            {invoices.length === 0
              ? 'Invoices are created from the engagement management panel.'
              : 'Try a different filter or search term.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Mentee</th>
                <th className="px-4 py-3">Engagement</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map(inv => (
                <InvoiceTableRow
                  key={inv.id}
                  invoice={inv}
                  onTransition={transition}
                  onEdit={() => setEditing(inv)}
                  onDelete={() => deleteInvoice(inv)}
                  confirmDelete={confirmDelete === inv.id}
                  onToggleConfirmDelete={() => setConfirmDelete(confirmDelete === inv.id ? null : inv.id)}
                  busy={acting === inv.id}
                />
              ))}
            </tbody>
          </table>
          </div>
          <PageBar page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} className="px-4" />
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <InvoiceEditModal
          invoice={editing}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ─────────── Summary card ───────────

function SummaryCard({ label, value, caption, color }: { label: string; value: string; caption: string; color: 'blue' | 'green' | 'red' }) {
  const colors = {
    blue:  { text: 'text-blue-700',  dot: 'bg-blue-400' },
    green: { text: 'text-green-700', dot: 'bg-green-400' },
    red:   { text: 'text-red-700',   dot: 'bg-red-400' },
  }[color]
  return (
    <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${colors.text}`}>{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{caption}</p>
    </div>
  )
}

// ─────────── Table row ───────────

function InvoiceTableRow({
  invoice,
  onTransition,
  onEdit,
  onDelete,
  confirmDelete,
  onToggleConfirmDelete,
  busy,
}: {
  invoice: InvoiceRow
  onTransition: (inv: InvoiceRow, next: InvoiceStatus) => void
  onEdit: () => void
  onDelete: () => void
  confirmDelete: boolean
  onToggleConfirmDelete: () => void
  busy: boolean
}) {
  const eff = effectiveStatus(invoice)
  const menteeName = invoice.mentee
    ? `${invoice.mentee.first_name} ${invoice.mentee.last_name}`
    : 'Unknown mentee'
  const offeringName = invoice.mentee_offering?.offering?.name ?? invoice.line_description ?? '—'
  const dueDate = invoice.due_date ? formatDate(invoice.due_date) : '—'
  const invoiceId = invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900 tabular-nums">{invoiceId}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Created {formatDateShort(invoice.created_at)}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-900 truncate max-w-40">{menteeName}</p>
        {invoice.mentee?.email && <p className="text-[10px] text-gray-400 truncate max-w-40">{invoice.mentee.email}</p>}
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-700 truncate max-w-52">{offeringName}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatMoney(invoice.amount_cents, invoice.currency)}
        </p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={STATUS_TONES[eff]} strike={eff === 'cancelled'}>
          {STATUS_LABELS[eff]}
        </Badge>
        {invoice.status === 'paid' && invoice.paid_at && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatDateShort(invoice.paid_at)}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <p className={`text-xs tabular-nums ${isOverdue(invoice) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
          {dueDate}
        </p>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {/* Status transitions */}
          {invoice.status === 'draft' && (
            <ActionButton busy={busy} onClick={() => onTransition(invoice, 'sent')}>Mark Sent</ActionButton>
          )}
          {invoice.status === 'sent' && (
            <>
              <ActionButton busy={busy} variant="primary" onClick={() => onTransition(invoice, 'paid')}>Mark Paid</ActionButton>
              <ActionButton busy={busy} onClick={() => onTransition(invoice, 'cancelled')}>Cancel</ActionButton>
            </>
          )}
          {invoice.status === 'paid' && (
            <ActionButton busy={busy} onClick={() => onTransition(invoice, 'sent')}>Revert to Sent</ActionButton>
          )}
          {invoice.status === 'cancelled' && (
            <ActionButton busy={busy} onClick={() => onTransition(invoice, 'draft')}>Restore</ActionButton>
          )}

          {/* View / PDF — opens print page in new tab */}
          <a
            href={`/invoices/${invoice.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            title="View / Print / Save as PDF"
          >
            View
          </a>

          {/* Edit */}
          <ActionButton busy={busy} onClick={onEdit}>Edit</ActionButton>

          {/* Delete with confirm */}
          {confirmDelete ? (
            <>
              <button
                onClick={onDelete}
                disabled={busy}
                className="px-2.5 py-1 text-[11px] font-medium rounded border border-red-500 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={onToggleConfirmDelete}
                disabled={busy}
                className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onToggleConfirmDelete}
              disabled={busy}
              className="px-2.5 py-1 text-[11px] font-medium rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              title="Delete invoice"
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function ActionButton({
  children,
  onClick,
  busy,
  variant,
}: {
  children: ReactNode
  onClick: () => void
  busy: boolean
  variant?: 'primary'
}) {
  const base = 'px-2.5 py-1 text-[11px] font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const style = variant === 'primary'
    ? 'border-brand bg-brand text-white hover:bg-brand-hover'
    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
  return (
    <button onClick={onClick} disabled={busy} className={`${base} ${style}`}>
      {children}
    </button>
  )
}
