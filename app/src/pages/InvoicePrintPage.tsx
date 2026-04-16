import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import { formatMoney, formatDateLong } from '../lib/format'
import { Button } from '../components/ui'
import type { Invoice, Organization, Mentee, Offering } from '../types'

interface InvoiceWithRelations extends Invoice {
  mentee: Mentee | null
  mentee_offering: {
    id: string
    offering: Pick<Offering, 'id' | 'name' | 'description' | 'type'> | null
  } | null
}

/** Long date or em-dash. Only used in the invoice PDF header fields. */
function formatDateOrDash(s: string | null): string {
  if (!s) return '—'
  return formatDateLong(s)
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, menteeProfile } = useAuth()
  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!id) { setLoading(false); return }
    const orgId = profile?.organization_id ?? menteeProfile?.organization_id

    async function loadInvoice() {
      setLoading(true)
      setError(null)
      try {
        const invRes = await supabaseRestGet<InvoiceWithRelations>(
          'invoices',
          `select=*,mentee:mentees(*),mentee_offering:mentee_offerings(id,offering:offerings(id,name,description,type))` +
            `&id=eq.${id}`,
          { label: 'invoice:print' },
        )
        if (invRes.error) { setError(invRes.error.message); return }
        if (!invRes.data || invRes.data.length === 0) {
          setError('Invoice not found.')
          return
        }
        const inv = invRes.data[0]
        setInvoice(inv)

        // Fetch org for branding (logo, colors, name, address if available)
        const targetOrgId = orgId ?? inv.organization_id
        if (targetOrgId) {
          const orgRes = await supabaseRestGet<Organization>(
            'organizations',
            `select=*&id=eq.${targetOrgId}`,
            { label: 'invoice:print:org' },
          )
          if (orgRes.data?.[0]) setOrg(orgRes.data[0])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadInvoice
    loadInvoice()
  }, [id, profile?.organization_id, menteeProfile?.organization_id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading invoice...
      </div>
    )
  }
  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-lg w-full">
          <LoadingErrorState
            message={error ?? 'Invoice not found.'}
            onRetry={() => fetchRef.current()}
          />
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            &larr; Go back
          </button>
        </div>
      </div>
    )
  }

  const mentee = invoice.mentee
  const menteeName = mentee ? `${mentee.first_name} ${mentee.last_name}` : 'Unknown mentee'
  const offeringName = invoice.mentee_offering?.offering?.name ?? invoice.line_description ?? 'Service'
  const isPaid = invoice.status === 'paid'
  const isOverdue = invoice.status === 'sent' && invoice.due_date && new Date(invoice.due_date) < new Date()

  const primary = org?.primary_color ?? '#4F46E5'
  const invoiceId = invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Screen-only action bar */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between print:hidden z-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => window.print()}
            leadingIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            }
          >
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Invoice paper */}
      <div className="max-w-3xl mx-auto my-8 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        <div className="px-12 py-10 print:px-10 print:py-8">
          {/* Header */}
          <div className="flex items-start justify-between pb-8 border-b-2" style={{ borderColor: primary }}>
            <div className="flex items-start gap-4">
              {org?.logo_url ? (
                org.logo_url.length <= 4 && !/^https?:\/\//.test(org.logo_url) && !org.logo_url.startsWith('data:') ? (
                  <div
                    className="w-16 h-16 rounded-lg flex items-center justify-center text-3xl shrink-0"
                    style={{ backgroundColor: primary + '20' }}
                  >
                    {org.logo_url}
                  </div>
                ) : (
                  <img src={org.logo_url} alt={org.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )
              ) : (
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white shrink-0"
                  style={{ backgroundColor: primary }}
                >
                  {org?.name?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div>
                <p className="text-xl font-bold text-gray-900">{org?.name ?? 'Organization'}</p>
                {org?.slug && <p className="text-xs text-gray-400 mt-0.5">{org.slug}</p>}
              </div>
            </div>

            <div className="text-right">
              <p className="text-3xl font-bold tracking-tight" style={{ color: primary }}>INVOICE</p>
              <p className="text-sm text-gray-500 mt-1 tabular-nums">{invoiceId}</p>
              <div className="mt-3">
                {isPaid && (
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                    Paid
                  </span>
                )}
                {!isPaid && isOverdue && (
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                    Overdue
                  </span>
                )}
                {!isPaid && !isOverdue && invoice.status === 'sent' && (
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Due
                  </span>
                )}
                {invoice.status === 'draft' && (
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                    Draft
                  </span>
                )}
                {invoice.status === 'cancelled' && (
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded bg-gray-100 text-gray-400 border border-gray-200 line-through">
                    Cancelled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-12 py-8 border-b border-gray-100">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Bill To</p>
              <p className="text-sm font-semibold text-gray-900">{menteeName}</p>
              {mentee?.email && <p className="text-xs text-gray-500 mt-0.5">{mentee.email}</p>}
              {mentee?.phone && <p className="text-xs text-gray-500">{mentee.phone}</p>}
              {mentee?.street && <p className="text-xs text-gray-500 mt-2">{mentee.street}</p>}
              {(mentee?.city || mentee?.state || mentee?.zip) && (
                <p className="text-xs text-gray-500">
                  {[mentee?.city, mentee?.state, mentee?.zip].filter(Boolean).join(', ')}
                </p>
              )}
              {mentee?.country && <p className="text-xs text-gray-500">{mentee.country}</p>}
            </div>
            <div className="text-right">
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Issue Date</p>
                <p className="text-sm text-gray-900 mt-1">{formatDateOrDash(invoice.created_at)}</p>
              </div>
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Due Date</p>
                <p className={`text-sm mt-1 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                  {formatDateOrDash(invoice.due_date)}
                </p>
              </div>
              {invoice.paid_at && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Paid On</p>
                  <p className="text-sm text-green-700 font-medium mt-1">{formatDateOrDash(invoice.paid_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="py-8">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="pb-3 text-left">Description</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-4">
                    <p className="text-sm font-medium text-gray-900">{offeringName}</p>
                    {invoice.line_description && invoice.line_description !== offeringName && (
                      <p className="text-xs text-gray-500 mt-1">{invoice.line_description}</p>
                    )}
                  </td>
                  <td className="py-4 text-right text-sm tabular-nums text-gray-900">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mt-6">
              <div className="w-64">
                <div className="flex justify-between py-2 text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(invoice.amount_cents, invoice.currency)}</span>
                </div>
                <div
                  className="flex justify-between py-3 text-base font-bold text-gray-900 border-t-2"
                  style={{ borderColor: primary }}
                >
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(invoice.amount_cents, invoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="py-6 border-t border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-8 border-t border-gray-100 text-center">
            <p className="text-[10px] text-gray-400">
              Thank you for your business. Questions? Contact {org?.name ?? 'us'}.
            </p>
          </div>
        </div>
      </div>

      {/* Print styles — also strip the outer bg-gray-100 for clean PDFs */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
