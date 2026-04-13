import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import type { Invoice } from '../types'

interface Props {
  invoice: Invoice
  onSave: (updates: InvoiceEditUpdates) => Promise<void>
  onClose: () => void
}

export interface InvoiceEditUpdates {
  invoice_number: string | null
  line_description: string | null
  amount_cents: number
  due_date: string | null
  notes: string | null
}

/**
 * Modal for editing the content fields of an invoice (amount, description,
 * due date, notes, invoice number). Status transitions stay on the main
 * Invoicing page as discrete action buttons — this modal is strictly for
 * fixing typos or updating amounts/due dates on an existing invoice.
 */
export default function InvoiceEditModal({ invoice, onSave, onClose }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInvoiceNumber(invoice.invoice_number ?? '')
    setDescription(invoice.line_description ?? '')
    setAmount((invoice.amount_cents / 100).toFixed(2))
    setDueDate(invoice.due_date ?? '')
    setNotes(invoice.notes ?? '')
    setError(null)
  }, [invoice.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = parseFloat(amount)
    if (!isFinite(amountNum) || amountNum < 0) {
      setError('Amount must be a valid positive number.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        invoice_number: invoiceNumber.trim() || null,
        line_description: description.trim() || null,
        amount_cents: Math.round(amountNum * 100),
        due_date: dueDate || null,
        notes: notes.trim() || null,
      })
    } catch (err) {
      setError((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Edit invoice</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="invEditNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
              Invoice number
            </label>
            <input id="invEditNumber" type="text" value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="Optional" className={inputClass} />
          </div>

          <div>
            <label htmlFor="invEditDescription" className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <input id="invEditDescription" type="text" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Line item description" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="invEditAmount" className="block text-sm font-medium text-gray-700 mb-1.5">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input id="invEditAmount" type="number" step="0.01" min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
              </div>
            </div>
            <div>
              <label htmlFor="invEditDueDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                Due date
              </label>
              <input id="invEditDueDate" type="date" value={dueDate}
                onChange={e => setDueDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="invEditNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes
            </label>
            <textarea id="invEditNotes" rows={3} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes shown on the PDF"
              className={inputClass + ' resize-none'} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
