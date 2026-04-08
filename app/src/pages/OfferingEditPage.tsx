import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Offering, DispenseMode, PreviewMode, AllocationPeriod, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'

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

  const [offering, setOffering] = useState<Offering | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [billingMode, setBillingMode] = useState<'one_time' | 'recurring'>('one_time')
  const [price, setPrice] = useState('')
  const [recurringPrice, setRecurringPrice] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [dispenseMode, setDispenseMode] = useState<DispenseMode>('completion')
  const [intervalDays, setIntervalDays] = useState('')
  const [lessonCount, setLessonCount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('titles_only')
  const [meetingCount, setMeetingCount] = useState('')
  const [allocationPeriod, setAllocationPeriod] = useState<AllocationPeriod>('monthly')
  const [useOrgDefault, setUseOrgDefault] = useState(true)
  const [cancelPolicy, setCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
        setBillingMode(o.billing_mode ?? 'one_time')
        setPrice(o.price_cents ? (o.price_cents / 100).toFixed(2) : '')
        setRecurringPrice(o.recurring_price_cents ? (o.recurring_price_cents / 100).toFixed(2) : '')
        setSetupFee(o.setup_fee_cents ? (o.setup_fee_cents / 100).toFixed(2) : '')
        setDispenseMode(o.dispense_mode)
        setIntervalDays(o.dispense_interval_days ? String(o.dispense_interval_days) : '')
        setLessonCount(o.lesson_count ? String(o.lesson_count) : '')
        setDueDate(o.course_due_date ?? '')
        setPreviewMode(o.preview_mode)
        setMeetingCount(o.meeting_count ? String(o.meeting_count) : '')
        setAllocationPeriod(o.allocation_period ?? 'monthly')
        setUseOrgDefault(o.use_org_default_cancellation ?? true)
        setCancelPolicy(o.cancellation_policy ?? DEFAULT_CANCELLATION_POLICY)
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
    setMsg(null)
    setSaving(true)

    const updates: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
    }

    if (offering.type === 'course') {
      updates.billing_mode = billingMode
      updates.price_cents = billingMode === 'one_time' && price ? Math.round(parseFloat(price) * 100) : 0
      updates.recurring_price_cents = billingMode === 'recurring' && recurringPrice ? Math.round(parseFloat(recurringPrice) * 100) : 0
      updates.setup_fee_cents = setupFee ? Math.round(parseFloat(setupFee) * 100) : 0
      updates.dispense_mode = dispenseMode
      updates.dispense_interval_days = dispenseMode === 'interval' && intervalDays ? parseInt(intervalDays) : null
      updates.lesson_count = lessonCount ? parseInt(lessonCount) : null
      updates.course_due_date = billingMode === 'one_time' && dueDate ? dueDate : null
      updates.preview_mode = previewMode
    }

    if (offering.type === 'engagement') {
      updates.meeting_count = meetingCount ? parseInt(meetingCount) : null
      updates.allocation_period = allocationPeriod
      updates.use_org_default_cancellation = useOrgDefault
      updates.cancellation_policy = useOrgDefault ? null : cancelPolicy
    }

    const { error } = await supabase
      .from('offerings')
      .update(updates)
      .eq('id', offering.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    const oldVals = { name: offering.name, description: offering.description, billing_mode: offering.billing_mode, price_cents: offering.price_cents, recurring_price_cents: offering.recurring_price_cents, setup_fee_cents: offering.setup_fee_cents }
    setOffering({ ...offering, name: name.trim(), description: description.trim() || null })
    if (currentUser) logAudit({ organization_id: offering.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'offering', entity_id: offering.id, details: { type: offering.type, name: name.trim() }, old_values: oldVals, new_values: updates })
    setMsg({ type: 'success', text: 'Offering has been updated.' })
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
        {msg && (
          <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm ${
            msg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {msg.text}
          </div>
        )}

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
          </div>
        </div>

        {/* Pricing — courses only */}
        {isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="editPrice" className="block text-sm font-medium text-gray-700 mb-1.5">Course price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="editPrice" type="number" step="0.01" min="0" value={price}
                    onChange={e => setPrice(e.target.value)} placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
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
        )}

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

              {dispenseMode === 'all_at_once' && (
                <div>
                  <label htmlFor="editDueDate" className="block text-sm font-medium text-gray-700 mb-1.5">Course due date</label>
                  <input id="editDueDate" type="date" value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={inputClass + ' max-w-48'} />
                  <p className="text-xs text-gray-400 mt-1">Optional. When all work should be completed by.</p>
                </div>
              )}

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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editMeetingCount" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Meetings per cycle
                  </label>
                  <input id="editMeetingCount" type="number" min="1" value={meetingCount}
                    onChange={e => setMeetingCount(e.target.value)}
                    placeholder="e.g. 4"
                    className={inputClass + ' max-w-32'} />
                  <p className="text-xs text-gray-400 mt-1">Credits allocated per payment cycle.</p>
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
              <span>Created: <span className="font-medium text-gray-700">{new Date(offering.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
              <span className="mx-3">·</span>
              <span>Updated: <span className="font-medium text-gray-700">{new Date(offering.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
            </div>
          </div>
        </div>

        <div>
          <button type="submit" disabled={saving}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
