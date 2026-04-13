import { useState } from 'react'
import type { FormEvent } from 'react'
import type { StaffMember } from '../types'

export interface TimeCardFormData {
  staff_id: string
  period_start: string
  period_end: string
  hours_worked: number
  notes: string | null
  document_data_url: string | null
  document_name: string | null
}

interface Props {
  eligibleStaff: StaffMember[]
  defaultPeriodStart: string
  defaultPeriodEnd: string
  onSave: (data: TimeCardFormData) => Promise<void>
  onClose: () => void
}

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

export default function TimeCardModal({
  eligibleStaff,
  defaultPeriodStart,
  defaultPeriodEnd,
  onSave,
  onClose,
}: Props) {
  const [staffId, setStaffId] = useState<string>('')
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart)
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd)
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [documentDataUrl, setDocumentDataUrl] = useState<string | null>(null)
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File | null) {
    setError(null)
    if (!file) {
      setDocumentDataUrl(null)
      setDocumentName(null)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File must be under 5 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB).`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDocumentDataUrl(reader.result as string)
      setDocumentName(file.name)
    }
    reader.onerror = () => setError('Failed to read file.')
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!staffId) { setError('Pick a staff member.'); return }
    const hoursNum = parseFloat(hours)
    if (!isFinite(hoursNum) || hoursNum < 0) { setError('Hours must be a non-negative number.'); return }
    if (periodEnd < periodStart) { setError('Period end must be on or after period start.'); return }

    setSaving(true)
    try {
      await onSave({
        staff_id: staffId,
        period_start: periodStart,
        period_end: periodEnd,
        hours_worked: hoursNum,
        notes: notes.trim() || null,
        document_data_url: documentDataUrl,
        document_name: documentName,
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
        className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Enter time card</h2>
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
            <label htmlFor="tcStaff" className="block text-sm font-medium text-gray-700 mb-1.5">
              Staff member
            </label>
            <select
              id="tcStaff"
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className={inputClass + ' bg-white'}
              required
            >
              <option value="">Select staff member...</option>
              {eligibleStaff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} — {s.role.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tcPeriodStart" className="block text-sm font-medium text-gray-700 mb-1.5">
                Period start
              </label>
              <input id="tcPeriodStart" type="date" required
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label htmlFor="tcPeriodEnd" className="block text-sm font-medium text-gray-700 mb-1.5">
                Period end
              </label>
              <input id="tcPeriodEnd" type="date" required
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="tcHours" className="block text-sm font-medium text-gray-700 mb-1.5">
              Hours worked
            </label>
            <input id="tcHours" type="number" step="0.25" min="0" required
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="e.g. 8.5"
              className={inputClass} />
            <p className="text-[11px] text-gray-400 mt-1">Total hours reported for this period. Decimals OK (8.5 = 8 hours 30 minutes).</p>
          </div>

          <div>
            <label htmlFor="tcNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes
            </label>
            <textarea id="tcNotes" rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional — context, project tags, etc."
              className={inputClass + ' resize-none'} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Attached document (optional)
            </label>
            {documentDataUrl && documentName ? (
              <div className="flex items-center gap-3 p-3 rounded border border-gray-200 bg-gray-50">
                <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-900 truncate flex-1">{documentName}</span>
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => handleFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:rounded file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 file:hover:bg-gray-50"
              />
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              Excel, CSV, PDF, or image (max 5 MB). Stored inline on the time card record.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 mt-5">
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
              {saving ? 'Saving…' : 'Save time card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
