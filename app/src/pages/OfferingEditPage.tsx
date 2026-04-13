import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import type { Offering, DispenseMode, PreviewMode, AllocationPeriod, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/format'

const ALLOCATION_PERIODS: { value: AllocationPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'per_cycle', label: 'Per billing cycle' },
]

const DISPENSE_OPTIONS: { value: DispenseMode; label: string; desc: string }[] = [
  { value: 'completion', label: 'After completion', desc: 'Next lesson unlocks when the previous one is completed' },
  { value: 'interval', label: 'On a schedule', desc: 'Dispense a new lesson every X days' },
  { value: 'all_at_once', label: 'All at once', desc: 'All lessons are available immediately' },
]

const PREVIEW_OPTIONS: { value: PreviewMode; label: string; desc: string }[] = [
  { value: 'hidden', label: 'Hidden', desc: 'Mentees cannot see upcoming lessons' },
  { value: 'titles_only', label: 'Titles visible', desc: 'Mentees see titles but cannot access content' },
  { value: 'full_preview', label: 'Full preview', desc: 'Mentees can view content but cannot submit work' },
]

export default function OfferingEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [offering, setOffering] = useState<Offering | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [iconUrl, setIconUrl] = useState('')
  const [billingMode, setBillingMode] = useState<'one_time' | 'recurring'>('one_time')
  const [price, setPrice] = useState('')
  const [recurringPrice, setRecurringPrice] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [dispenseMode, setDispenseMode] = useState<DispenseMode>('completion')
  const [intervalDays, setIntervalDays] = useState('')
  const [lessonCount, setLessonCount] = useState('')
  const [completionDays, setCompletionDays] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('titles_only')
  const [meetingCount, setMeetingCount] = useState('')
  const [meetingDuration, setMeetingDuration] = useState('60')
  const [allocationPeriod, setAllocationPeriod] = useState<AllocationPeriod>('monthly')
  const [useOrgDefault, setUseOrgDefault] = useState(true)
  const [cancelPolicy, setCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [autoSendInvoice, setAutoSendInvoice] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return

    async function fetchOffering() {
      try {
        const { data, error } = await supabase
          .from('offerings')
          .select('*')
          .eq('id', id!)
          .single()

        if (error) { setFetchError(error.message); return }

        const o = data as Offering
        setOffering(o)
        setName(o.name)
        setDescription(o.description ?? '')
        setIconUrl(o.icon_url ?? '')
        setBillingMode(o.billing_mode ?? 'one_time')
        setPrice(o.price_cents ? (o.price_cents / 100).toFixed(2) : '')
        setRecurringPrice(o.recurring_price_cents ? (o.recurring_price_cents / 100).toFixed(2) : '')
        setSetupFee(o.setup_fee_cents ? (o.setup_fee_cents / 100).toFixed(2) : '')
        setDispenseMode(o.dispense_mode)
        setIntervalDays(o.dispense_interval_days ? String(o.dispense_interval_days) : '')
        setLessonCount(o.lesson_count ? String(o.lesson_count) : '')
        setCompletionDays(o.expected_completion_days ? String(o.expected_completion_days) : '')
        setPreviewMode(o.preview_mode)
        setMeetingCount(o.meeting_count ? String(o.meeting_count) : '')
        setMeetingDuration(String(o.default_meeting_duration_minutes ?? 60))
        setAllocationPeriod(o.allocation_period ?? 'monthly')
        setUseOrgDefault(o.use_org_default_cancellation ?? true)
        setCancelPolicy(o.cancellation_policy ?? DEFAULT_CANCELLATION_POLICY)
        setAutoSendInvoice(o.auto_send_invoice ?? false)
      } catch (err) {
        setFetchError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchOffering()
  }, [id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!offering) return
    setSaving(true)

    const updates: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      icon_url: iconUrl.trim() || null,
    }

    if (offering.type === 'course') {
      updates.billing_mode = billingMode
      updates.price_cents = billingMode === 'one_time' && price ? Math.round(parseFloat(price) * 100) : 0
      updates.recurring_price_cents = billingMode === 'recurring' && recurringPrice ? Math.round(parseFloat(recurringPrice) * 100) : 0
      updates.setup_fee_cents = setupFee ? Math.round(parseFloat(setupFee) * 100) : 0
      updates.dispense_mode = dispenseMode
      updates.dispense_interval_days = dispenseMode === 'interval' && intervalDays ? parseInt(intervalDays) : null
      updates.lesson_count = lessonCount ? parseInt(lessonCount) : null
      updates.expected_completion_days = completionDays ? parseInt(completionDays) : null
      updates.preview_mode = previewMode
    }

    if (offering.type === 'engagement') {
      updates.recurring_price_cents = recurringPrice ? Math.round(parseFloat(recurringPrice) * 100) : 0
      updates.setup_fee_cents = setupFee ? Math.round(parseFloat(setupFee) * 100) : 0
      updates.meeting_count = meetingCount ? parseInt(meetingCount) : null
      updates.default_meeting_duration_minutes = meetingDuration ? Math.max(5, parseInt(meetingDuration)) : 60
      updates.allocation_period = allocationPeriod
      updates.use_org_default_cancellation = useOrgDefault
      updates.cancellation_policy = useOrgDefault ? null : cancelPolicy
      updates.auto_send_invoice = autoSendInvoice
    }

    try {
      const { error } = await supabase
        .from('offerings')
        .update(updates)
        .eq('id', offering.id)

      if (error) {
        reportSupabaseError(error, { component: 'OfferingEditPage', action: 'save' })
        toast.error(error.message)
        return
      }

      const oldVals = { name: offering.name, description: offering.description, billing_mode: offering.billing_mode, price_cents: offering.price_cents, recurring_price_cents: offering.recurring_price_cents, setup_fee_cents: offering.setup_fee_cents }
      setOffering({ ...offering, name: name.trim(), description: description.trim() || null })
      if (currentUser) await logAudit({ organization_id: offering.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'offering', entity_id: offering.id, details: { type: offering.type, name: name.trim() }, old_values: oldVals, new_values: updates })
      toast.success('Offering has been updated.')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
      console.error('[OfferingEdit] save error:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (fetchError || !offering) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Offering not found.'}
        </div>
      </div>
    )
  }

  const isCourse = offering.type === 'course'
  const typeLabel = isCourse ? 'Course' : 'Engagement'
  const backRoute = isCourse ? '/courses' : '/engagements'

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const selectClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(backRoute)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{offering.name}</h1>
          <p className="text-xs text-gray-500">{typeLabel}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Basic info */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{typeLabel} Details</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="editName" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input id="editName" type="text" required value={name}
                onChange={e => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="editDesc" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea id="editDesc" rows={3} value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional"
                className={inputClass + ' resize-none'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Icon</label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-brand-light flex items-center justify-center text-lg shrink-0 border border-gray-200 overflow-hidden">
                  {iconUrl ? (
                    iconUrl.length <= 4 && !/^https?:\/\//.test(iconUrl) && !iconUrl.startsWith('data:')
                      ? <span>{iconUrl}</span>
                      : <img src={iconUrl} alt="" className="w-12 h-12 object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-brand">{name?.[0]?.toUpperCase() ?? '?'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <input type="text" value={iconUrl}
                    onChange={e => setIconUrl(e.target.value)}
                    placeholder="Emoji (e.g. 📚) or image URL"
                    className={inputClass} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = () => {
                        const file = input.files?.[0]
                        if (!file) return
                        if (file.size > 512 * 1024) { toast.error('Icon must be under 512KB.'); return }
                        const reader = new FileReader()
                        reader.onload = () => setIconUrl(reader.result as string)
                        reader.readAsDataURL(file)
                      }
                      input.click()
                    }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                      Upload image
                    </button>
                    {iconUrl && (
                      <Button variant="dangerGhost" size="sm" type="button" onClick={() => setIconUrl('')}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Enter an emoji, paste an image URL, or upload an image (max 512KB).</p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            {isCourse ? (
              <div>
                <label htmlFor="editPrice" className="block text-sm font-medium text-gray-700 mb-1.5">Course price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="editPrice" type="number" step="0.01" min="0" value={price}
                    onChange={e => setPrice(e.target.value)} placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="editRecurringPrice" className="block text-sm font-medium text-gray-700 mb-1.5">Recurring price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="editRecurringPrice" type="number" step="0.01" min="0" value={recurringPrice}
                    onChange={e => setRecurringPrice(e.target.value)} placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="editSetupFee" className="block text-sm font-medium text-gray-700 mb-1.5">One-time setup fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input id="editSetupFee" type="number" step="0.01" min="0" value={setupFee}
                  onChange={e => setSetupFee(e.target.value)} placeholder="0.00"
                  className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
              </div>
            </div>
          </div>
        </div>

        {/* Course Plan — courses only */}
        {isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Course Plan</h2>
            <p className="text-xs text-gray-400 mb-4">Control how and when lessons become available to mentees.</p>

            <div className="space-y-4">
              <div>
                <label htmlFor="editLessonCount" className="block text-sm font-medium text-gray-700 mb-1.5">Number of lessons</label>
                <input id="editLessonCount" type="number" min="1" value={lessonCount}
                  onChange={e => setLessonCount(e.target.value)} placeholder="e.g. 12"
                  className={inputClass + ' max-w-32'} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lesson release method</label>
                <div className="space-y-2">
                  {DISPENSE_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        dispenseMode === opt.value
                          ? 'border-brand bg-brand-light'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <input type="radio" name="editDispenseMode" value={opt.value}
                        checked={dispenseMode === opt.value}
                        onChange={e => setDispenseMode(e.target.value as DispenseMode)}
                        className="mt-0.5 accent-brand" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {dispenseMode === 'interval' && (
                <div>
                  <label htmlFor="editIntervalDays" className="block text-sm font-medium text-gray-700 mb-1.5">Days between lessons</label>
                  <input id="editIntervalDays" type="number" min="1" value={intervalDays}
                    onChange={e => setIntervalDays(e.target.value)} placeholder="e.g. 7"
                    className={inputClass + ' max-w-32'} />
                </div>
              )}

              <div>
                <label htmlFor="editCompletionDays" className="block text-sm font-medium text-gray-700 mb-1.5">Expected completion time</label>
                <div className="flex items-center gap-2">
                  <input id="editCompletionDays" type="number" min="1" value={completionDays}
                    onChange={e => setCompletionDays(e.target.value)} placeholder="e.g. 90"
                    className={inputClass + ' max-w-28'} />
                  <span className="text-sm text-gray-500">days</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Optional. Each mentee's due date will be calculated from their start date + this duration.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upcoming lesson visibility</label>
                <select value={previewMode}
                  onChange={e => setPreviewMode(e.target.value as PreviewMode)}
                  className={selectClass}>
                  {PREVIEW_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Engagement settings */}
        {!isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Engagement Settings</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="editMeetingCount" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Meetings per cycle
                  </label>
                  <input id="editMeetingCount" type="number" min="1" value={meetingCount}
                    onChange={e => setMeetingCount(e.target.value)}
                    placeholder="e.g. 4"
                    className={inputClass} />
                  <p className="text-xs text-gray-400 mt-1">Credits allocated per payment cycle.</p>
                </div>
                <div>
                  <label htmlFor="editMeetingDuration" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Meeting length
                  </label>
                  <div className="flex items-center gap-2">
                    <input id="editMeetingDuration" type="number" min="5" step="5" value={meetingDuration}
                      onChange={e => setMeetingDuration(e.target.value)}
                      placeholder="60"
                      className={inputClass} />
                    <span className="text-sm text-gray-500">min</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Length of each scheduled meeting.</p>
                </div>
                <div>
                  <label htmlFor="editAllocPeriod" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Allocation period
                  </label>
                  <select id="editAllocPeriod" value={allocationPeriod}
                    onChange={e => setAllocationPeriod(e.target.value as AllocationPeriod)}
                    className={selectClass}>
                    {ALLOCATION_PERIODS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">How often credits are refreshed.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Settings — engagements only */}
        {!isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Invoice Settings</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSendInvoice}
                onChange={e => setAutoSendInvoice(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-send invoice when opened</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When this engagement is opened for a mentee, automatically create and send the first recurring invoice. If disabled, invoices must be created manually.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Cancellation Policy — engagements only */}
        {!isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Cancellation Policy</h2>

            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={useOrgDefault}
                onChange={e => setUseOrgDefault(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Use organization default</p>
                <p className="text-xs text-gray-500">Apply the default cancellation policy set in Company Settings.</p>
              </div>
            </label>

            {!useOrgDefault && (
              <CancellationPolicyEditor policy={cancelPolicy} onChange={setCancelPolicy} />
            )}
          </div>
        )}

        {/* Info */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1 text-xs text-gray-500">
              <span>Type: <span className="font-medium text-gray-700">{typeLabel}</span></span>
              <span className="mx-3">·</span>
              <span>Created: <span className="font-medium text-gray-700">{formatDate(offering.created_at)}</span></span>
              <span className="mx-3">·</span>
              <span>Updated: <span className="font-medium text-gray-700">{formatDate(offering.updated_at)}</span></span>
            </div>
          </div>
        </div>

        <div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  )
}
