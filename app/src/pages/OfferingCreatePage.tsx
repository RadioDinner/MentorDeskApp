import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { OfferingType, DispenseMode, PreviewMode, AllocationPeriod, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'

const ALLOCATION_PERIODS: { value: AllocationPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'per_cycle', label: 'Per billing cycle' },
]

interface OfferingCreatePageProps {
  title: string
  offeringType: OfferingType
}

const DISPENSE_OPTIONS: { value: DispenseMode; label: string; short: string }[] = [
  { value: 'completion', label: 'After previous lesson is completed', short: 'After completion' },
  { value: 'interval', label: 'On a schedule (every X days)', short: 'Scheduled' },
  { value: 'all_at_once', label: 'All lessons available immediately', short: 'All at once' },
]

const PREVIEW_OPTIONS: { value: PreviewMode; label: string }[] = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'titles_only', label: 'Titles only' },
  { value: 'full_preview', label: 'Full preview' },
]

type BillingMode = 'one_time' | 'recurring'

export default function OfferingCreatePage({ title, offeringType }: OfferingCreatePageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isCourse = offeringType === 'course'

  // Shared
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [addToFlow, setAddToFlow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Course
  const [billingMode, setBillingMode] = useState<BillingMode>('one_time')
  const [price, setPrice] = useState('')
  const [recurringPrice, setRecurringPrice] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [dispenseMode, setDispenseMode] = useState<DispenseMode>('completion')
  const [intervalDays, setIntervalDays] = useState('')
  const [lessonCount, setLessonCount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('titles_only')

  // Engagement
  const [meetingCount, setMeetingCount] = useState('')
  const [allocationPeriod, setAllocationPeriod] = useState<AllocationPeriod>('monthly')
  const [useOrgDefault, setUseOrgDefault] = useState(true)
  const [cancelPolicy, setCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setMsg(null)
    setSaving(true)

    const record: Record<string, unknown> = {
      organization_id: profile.organization_id,
      type: offeringType,
      name: name.trim(),
      description: description.trim() || null,
    }

    if (isCourse) {
      record.billing_mode = billingMode
      record.price_cents = billingMode === 'one_time' && price ? Math.round(parseFloat(price) * 100) : 0
      record.recurring_price_cents = billingMode === 'recurring' && recurringPrice ? Math.round(parseFloat(recurringPrice) * 100) : 0
      record.setup_fee_cents = setupFee ? Math.round(parseFloat(setupFee) * 100) : 0
      record.dispense_mode = dispenseMode
      record.dispense_interval_days = dispenseMode === 'interval' && intervalDays ? parseInt(intervalDays) : null
      record.lesson_count = lessonCount ? parseInt(lessonCount) : null
      record.course_due_date = billingMode === 'one_time' && dueDate ? dueDate : null
      record.preview_mode = previewMode
    } else {
      record.meeting_count = meetingCount ? parseInt(meetingCount) : null
      record.allocation_period = allocationPeriod
      record.use_org_default_cancellation = useOrgDefault
      record.cancellation_policy = useOrgDefault ? null : cancelPolicy
    }

    const { data, error } = await supabase.from('offerings').insert(record).select('id')
    setSaving(false)

    if (error) { setMsg({ type: 'error', text: error.message }); return }

    if (data && data.length > 0) {
      logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'offering', entity_id: data[0].id, details: { type: offeringType, name: name.trim() } })

      if (addToFlow) {
        const { data: orgData } = await supabase.from('organizations').select('mentee_flow').eq('id', profile.organization_id).single()
        if (orgData) {
          const flow = (orgData.mentee_flow as { steps: unknown[] }) ?? { steps: [] }
          flow.steps.push({ id: crypto.randomUUID(), name: name.trim(), type: offeringType, offering_id: data[0].id, in_flow: true, order: flow.steps.length })
          await supabase.from('organizations').update({ mentee_flow: flow }).eq('id', profile.organization_id)
        }
      }

      navigate(`/offerings/${data[0].id}/edit`)
    } else {
      navigate(`/offerings?tab=${offeringType}`)
    }
  }

  const backRoute = `/offerings?tab=${offeringType}`
  const inputClass = 'w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
  const selectClass = inputClass + ' bg-white'
  const dollarInput = 'w-full rounded border border-gray-300 pl-7 pr-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  // ======== COURSE LAYOUT (two columns, single screen) ========
  if (isCourse) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center gap-4 mb-5">
          <button onClick={() => navigate(backRoute)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </div>

        {msg && (
          <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm mb-4 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* LEFT COLUMN — 3/5 */}
            <div className="lg:col-span-3 space-y-4">
              {/* Name + Description */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="offeringName" className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input id="offeringName" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. JumpStart Your Freedom" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="offeringDesc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea id="offeringDesc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" className={inputClass + ' resize-none'} />
                  </div>
                </div>
              </div>

              {/* Course Plan */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Course Plan</h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="lessonCount" className="block text-xs font-medium text-gray-700 mb-1">Lessons</label>
                      <input id="lessonCount" type="number" min="1" value={lessonCount} onChange={e => setLessonCount(e.target.value)} placeholder="e.g. 27" className={inputClass + ' max-w-28'} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Upcoming visibility</label>
                      <select value={previewMode} onChange={e => setPreviewMode(e.target.value as PreviewMode)} className={selectClass}>
                        {PREVIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Lesson release</label>
                    <div className="space-y-1.5">
                      {DISPENSE_OPTIONS.map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer transition-colors text-sm ${dispenseMode === opt.value ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input type="radio" name="dispenseMode" value={opt.value} checked={dispenseMode === opt.value} onChange={e => setDispenseMode(e.target.value as DispenseMode)} className="accent-brand" />
                          <span className={dispenseMode === opt.value ? 'text-gray-900 font-medium' : 'text-gray-600'}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {dispenseMode === 'interval' && (
                    <div>
                      <label htmlFor="intervalDays" className="block text-xs font-medium text-gray-700 mb-1">Days between lessons</label>
                      <input id="intervalDays" type="number" min="1" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} placeholder="e.g. 7" className={inputClass + ' max-w-28'} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — 2/5 */}
            <div className="lg:col-span-2 space-y-4">
              {/* Pricing + Billing */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Pricing</h2>
                <div className="space-y-3">
                  {/* Billing mode */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Billing type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setBillingMode('one_time')}
                        className={`px-3 py-2 text-xs font-medium rounded border transition-colors ${billingMode === 'one_time' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                        One-time
                      </button>
                      <button type="button" onClick={() => setBillingMode('recurring')}
                        className={`px-3 py-2 text-xs font-medium rounded border transition-colors ${billingMode === 'recurring' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                        Monthly
                      </button>
                    </div>
                  </div>

                  {billingMode === 'one_time' ? (
                    <>
                      <div>
                        <label htmlFor="price" className="block text-xs font-medium text-gray-700 mb-1">Course price</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                          <input id="price" type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className={dollarInput} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="dueDate" className="block text-xs font-medium text-gray-700 mb-1">Due date</label>
                        <input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
                        <p className="text-[10px] text-gray-400 mt-1">Optional. One-time courses can still have no due date.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="recurringPrice" className="block text-xs font-medium text-gray-700 mb-1">Monthly price</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                          <input id="recurringPrice" type="number" step="0.01" min="0" value={recurringPrice} onChange={e => setRecurringPrice(e.target.value)} placeholder="0.00" className={dollarInput} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Charged monthly until the mentee completes all lessons.</p>
                      </div>
                    </>
                  )}

                  <div>
                    <label htmlFor="setupFee" className="block text-xs font-medium text-gray-700 mb-1">Setup fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input id="setupFee" type="number" step="0.01" min="0" value={setupFee} onChange={e => setSetupFee(e.target.value)} placeholder="0.00" className={dollarInput} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">One-time fee charged at enrollment.</p>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Options</h2>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={addToFlow} onChange={e => setAddToFlow(e.target.checked)} className="mt-0.5 accent-brand" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Add to mentee flow</p>
                    <p className="text-[10px] text-gray-400">Include as a step in the mentee progression.</p>
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {saving ? 'Creating…' : 'Create Course'}
                </button>
                <button type="button" onClick={() => navigate(backRoute)} className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    )
  }

  // ======== ENGAGEMENT LAYOUT ========
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-5">
        <button onClick={() => navigate(backRoute)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      {msg && (
        <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm mb-4 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <div className="space-y-3">
            <div>
              <label htmlFor="offeringName" className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input id="offeringName" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 4x Mentoring" className={inputClass} />
            </div>
            <div>
              <label htmlFor="offeringDesc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea id="offeringDesc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" className={inputClass + ' resize-none'} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Engagement Settings</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="meetingCount" className="block text-xs font-medium text-gray-700 mb-1">Meetings per cycle</label>
              <input id="meetingCount" type="number" min="1" value={meetingCount} onChange={e => setMeetingCount(e.target.value)} placeholder="e.g. 4" className={inputClass + ' max-w-28'} />
            </div>
            <div>
              <label htmlFor="allocPeriod" className="block text-xs font-medium text-gray-700 mb-1">Allocation period</label>
              <select id="allocPeriod" value={allocationPeriod} onChange={e => setAllocationPeriod(e.target.value as AllocationPeriod)} className={selectClass}>
                {ALLOCATION_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Cancellation Policy</h2>
          <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
            <input type="checkbox" checked={useOrgDefault} onChange={e => setUseOrgDefault(e.target.checked)} className="mt-0.5 accent-brand" />
            <div>
              <p className="text-sm font-medium text-gray-900">Use organization default</p>
              <p className="text-[10px] text-gray-400">Apply the default cancellation policy from Company Settings.</p>
            </div>
          </label>
          {!useOrgDefault && <CancellationPolicyEditor policy={cancelPolicy} onChange={setCancelPolicy} />}
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={addToFlow} onChange={e => setAddToFlow(e.target.checked)} className="mt-0.5 accent-brand" />
            <div>
              <p className="text-sm font-medium text-gray-900">Add to mentee flow</p>
              <p className="text-[10px] text-gray-400">Include as a step in the mentee progression.</p>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
            {saving ? 'Creating…' : 'Create Engagement'}
          </button>
          <button type="button" onClick={() => navigate(backRoute)} className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
        </div>
      </form>
    </div>
  )
}
