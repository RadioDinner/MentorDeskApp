import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import type { OfferingType, DispenseMode, PreviewMode, AllocationPeriod, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'

const ALLOCATION_PERIODS: { value: AllocationPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'per_cycle', label: 'Per billing cycle' },
]

interface OfferingCreatePageProps {
  title: string
  offeringType: OfferingType
}

const DISPENSE_OPTIONS: { value: DispenseMode; label: string }[] = [
  { value: 'completion', label: 'After previous lesson is completed' },
  { value: 'interval', label: 'On a schedule (every X days)' },
  { value: 'all_at_once', label: 'All lessons available immediately' },
]

const PREVIEW_OPTIONS: { value: PreviewMode; label: string }[] = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'titles_only', label: 'Titles only' },
  { value: 'full_preview', label: 'Full preview' },
]

function formatOutcome(outcome: string): string {
  return outcome === 'keep_credit' ? 'keep credit' : 'lose credit'
}

function PolicySummary({ policy }: { policy: CancellationPolicy }) {
  return (
    <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 space-y-1">
      <p className="font-medium text-gray-700 mb-1.5">Current default policy:</p>
      <p>Cancel window: <span className="font-medium text-gray-900">{policy.cancel_window_value} {policy.cancel_window_unit}</span> before appointment</p>
      <p>Cancelled in window: <span className="font-medium text-gray-900">{formatOutcome(policy.cancelled_in_window)}</span></p>
      <p>Late cancel: <span className="font-medium text-gray-900">{formatOutcome(policy.cancelled_outside_window)}</span></p>
      <p>No-show: <span className="font-medium text-gray-900">{formatOutcome(policy.no_show)}</span></p>
    </div>
  )
}

const schema = z.object({
  name:            z.string().min(1, 'Name is required'),
  description:     z.string(),
  addToFlow:       z.boolean(),
  // Course fields
  billingMode:     z.enum(['one_time', 'recurring']),
  price:           z.string(),
  recurringPrice:  z.string(),
  setupFee:        z.string(),
  dispenseMode:    z.enum(['completion', 'interval', 'all_at_once']),
  intervalDays:    z.string(),
  lessonCount:     z.string(),
  dueDate:         z.string(),
  previewMode:     z.enum(['hidden', 'titles_only', 'full_preview']),
  // Engagement fields
  meetingCount:    z.string(),
  meetingDuration: z.string(),
  allocationPeriod: z.enum(['monthly', 'weekly', 'per_cycle']),
  useOrgDefault:   z.boolean(),
})

type FormValues = z.infer<typeof schema>

const errorClass = 'mt-1 text-[11px] text-red-500'

export default function OfferingCreatePage({ title, offeringType }: OfferingCreatePageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isCourse = offeringType === 'course'
  const toast = useToast()

  // cancelPolicy stays outside RHF — managed by CancellationPolicyEditor
  const [cancelPolicy, setCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [orgDefaultPolicy, setOrgDefaultPolicy] = useState<CancellationPolicy | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '', description: '', addToFlow: false,
      billingMode: 'one_time', price: '', recurringPrice: '', setupFee: '',
      dispenseMode: 'completion', intervalDays: '', lessonCount: '', dueDate: '',
      previewMode: 'titles_only',
      meetingCount: '', meetingDuration: '60',
      allocationPeriod: 'monthly', useOrgDefault: true,
    },
  })

  const billingMode  = watch('billingMode')
  const dispenseMode = watch('dispenseMode')
  const useOrgDefault = watch('useOrgDefault')

  // Fetch org default cancellation policy for summary display
  useEffect(() => {
    if (!profile || isCourse) return
    async function fetchOrgPolicy() {
      const { data } = await supabase.from('organizations').select('default_cancellation_policy').eq('id', profile!.organization_id).single()
      if (data?.default_cancellation_policy) {
        setOrgDefaultPolicy(data.default_cancellation_policy as CancellationPolicy)
      }
    }
    fetchOrgPolicy()
  }, [profile?.organization_id, isCourse])

  async function onSubmit(values: FormValues) {
    if (!profile) return

    try {
      const record: Record<string, unknown> = {
        organization_id: profile.organization_id,
        type: offeringType,
        name: values.name.trim(),
        description: values.description.trim() || null,
      }

      if (isCourse) {
        record.billing_mode = values.billingMode
        record.price_cents = values.billingMode === 'one_time' && values.price ? Math.round(parseFloat(values.price) * 100) : 0
        record.recurring_price_cents = values.billingMode === 'recurring' && values.recurringPrice ? Math.round(parseFloat(values.recurringPrice) * 100) : 0
        record.setup_fee_cents = values.setupFee ? Math.round(parseFloat(values.setupFee) * 100) : 0
        record.dispense_mode = values.dispenseMode
        record.dispense_interval_days = values.dispenseMode === 'interval' && values.intervalDays ? parseInt(values.intervalDays) : null
        record.lesson_count = values.lessonCount ? parseInt(values.lessonCount) : null
        record.course_due_date = values.billingMode === 'one_time' && values.dueDate ? values.dueDate : null
        record.preview_mode = values.previewMode
      } else {
        record.billing_mode = 'recurring'
        record.recurring_price_cents = values.recurringPrice ? Math.round(parseFloat(values.recurringPrice) * 100) : 0
        record.setup_fee_cents = values.setupFee ? Math.round(parseFloat(values.setupFee) * 100) : 0
        record.meeting_count = values.meetingCount ? parseInt(values.meetingCount) : null
        record.default_meeting_duration_minutes = values.meetingDuration ? Math.max(5, parseInt(values.meetingDuration)) : 60
        record.allocation_period = values.allocationPeriod
        record.use_org_default_cancellation = values.useOrgDefault
        record.cancellation_policy = values.useOrgDefault ? null : cancelPolicy
      }

      const { data, error } = await supabase.from('offerings').insert(record).select('id')
      if (error) {
        reportSupabaseError(error, { component: 'OfferingCreatePage', action: 'create', metadata: { type: offeringType } })
        toast.error(error.message)
        return
      }

      if (data && data.length > 0) {
        await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'offering', entity_id: data[0].id, details: { type: offeringType, name: values.name.trim() } })

        if (values.addToFlow) {
          const { data: orgData } = await supabase.from('organizations').select('mentee_flow').eq('id', profile.organization_id).single()
          if (orgData) {
            const flow = (orgData.mentee_flow as { steps: unknown[] }) ?? { steps: [] }
            flow.steps.push({ id: crypto.randomUUID(), name: values.name.trim(), type: offeringType, offering_id: data[0].id, in_flow: true, order: flow.steps.length })
            await supabase.from('organizations').update({ mentee_flow: flow }).eq('id', profile.organization_id)
          }
        }

        if (offeringType === 'course') {
          navigate(`/courses/${data[0].id}/builder`)
        } else {
          navigate(`/engagements/${data[0].id}/edit`)
        }
      } else {
        navigate(offeringType === 'course' ? '/courses' : '/engagements')
      }
    } catch (err) {
      reportSupabaseError({ message: (err as Error).message }, { component: 'OfferingCreatePage', action: 'create' })
      toast.error((err as Error).message || 'Failed to create offering')
    }
  }

  const backRoute = offeringType === 'course' ? '/courses' : '/engagements'
  const inputClass = 'w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
  const selectClass = inputClass + ' bg-white'
  const dollarInput = 'w-full rounded border border-gray-300 pl-7 pr-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  // ======== COURSE LAYOUT ========
  if (isCourse) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center gap-4 mb-5">
          <button onClick={() => navigate(backRoute)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* LEFT COLUMN — 3/5 */}
            <div className="lg:col-span-3 space-y-4">
              {/* Name + Description */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="offeringName" className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input id="offeringName" type="text" placeholder="e.g. JumpStart Your Freedom"
                      {...register('name')}
                      className={`${inputClass}${errors.name ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
                    {errors.name && <p className={errorClass}>{errors.name.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="offeringDesc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea id="offeringDesc" rows={2} placeholder="Optional"
                      {...register('description')} className={inputClass + ' resize-none'} />
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
                      <input id="lessonCount" type="number" min="1" placeholder="e.g. 27"
                        {...register('lessonCount')} className={inputClass + ' max-w-28'} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Upcoming visibility</label>
                      <select {...register('previewMode')} className={selectClass}>
                        {PREVIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Lesson release</label>
                    <div className="space-y-1.5">
                      {DISPENSE_OPTIONS.map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer transition-colors text-sm ${dispenseMode === opt.value ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input type="radio" value={opt.value} checked={dispenseMode === opt.value}
                            onChange={() => setValue('dispenseMode', opt.value as DispenseMode)}
                            className="accent-brand" />
                          <span className={dispenseMode === opt.value ? 'text-gray-900 font-medium' : 'text-gray-600'}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {dispenseMode === 'interval' && (
                    <div>
                      <label htmlFor="intervalDays" className="block text-xs font-medium text-gray-700 mb-1">Days between lessons</label>
                      <input id="intervalDays" type="number" min="1" placeholder="e.g. 7"
                        {...register('intervalDays')} className={inputClass + ' max-w-28'} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — 2/5 */}
            <div className="lg:col-span-2 space-y-4">
              {/* Pricing */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Pricing</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Billing type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setValue('billingMode', 'one_time')}
                        className={`px-3 py-2 text-xs font-medium rounded border transition-colors ${billingMode === 'one_time' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                        One-time
                      </button>
                      <button type="button" onClick={() => setValue('billingMode', 'recurring')}
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
                          <input id="price" type="number" step="0.01" min="0" placeholder="0.00"
                            {...register('price')} className={dollarInput} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="dueDate" className="block text-xs font-medium text-gray-700 mb-1">Due date</label>
                        <input id="dueDate" type="date" {...register('dueDate')} className={inputClass} />
                        <p className="text-[10px] text-gray-400 mt-1">Optional. One-time courses can still have no due date.</p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label htmlFor="recurringPrice" className="block text-xs font-medium text-gray-700 mb-1">Monthly price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                        <input id="recurringPrice" type="number" step="0.01" min="0" placeholder="0.00"
                          {...register('recurringPrice')} className={dollarInput} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">Charged monthly until the mentee completes all lessons.</p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="setupFee" className="block text-xs font-medium text-gray-700 mb-1">Setup fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input id="setupFee" type="number" step="0.01" min="0" placeholder="0.00"
                        {...register('setupFee')} className={dollarInput} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">One-time fee charged at enrollment.</p>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Options</h2>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" {...register('addToFlow')} className="mt-0.5 accent-brand" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Add to mentee flow</p>
                    <p className="text-[10px] text-gray-400">Include as a step in the mentee progression.</p>
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create Course'}</Button>
                <Button variant="secondary" type="button" onClick={() => navigate(backRoute)}>Cancel</Button>
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <div className="space-y-3">
            <div>
              <label htmlFor="offeringName" className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input id="offeringName" type="text" placeholder="e.g. 4x Mentoring"
                {...register('name')}
                className={`${inputClass}${errors.name ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.name && <p className={errorClass}>{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="offeringDesc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea id="offeringDesc" rows={2} placeholder="Optional"
                {...register('description')} className={inputClass + ' resize-none'} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Engagement Settings</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="meetingCount" className="block text-xs font-medium text-gray-700 mb-1">Meetings per cycle</label>
              <input id="meetingCount" type="number" min="1" placeholder="e.g. 4"
                {...register('meetingCount')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="meetingDuration" className="block text-xs font-medium text-gray-700 mb-1">Meeting length (min)</label>
              <input id="meetingDuration" type="number" min="5" step="5" placeholder="60"
                {...register('meetingDuration')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="allocPeriod" className="block text-xs font-medium text-gray-700 mb-1">Allocation period</label>
              <select id="allocPeriod" {...register('allocationPeriod')} className={selectClass}>
                {ALLOCATION_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Pricing</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="engRecurringPrice" className="block text-xs font-medium text-gray-700 mb-1">Monthly price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input id="engRecurringPrice" type="number" step="0.01" min="0" placeholder="0.00"
                  {...register('recurringPrice')} className={dollarInput} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Automatically invoiced monthly when a mentee is assigned to this engagement.</p>
            </div>
            <div>
              <label htmlFor="engSetupFee" className="block text-xs font-medium text-gray-700 mb-1">Setup fee (one-time)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input id="engSetupFee" type="number" step="0.01" min="0" placeholder="0.00"
                  {...register('setupFee')} className={dollarInput} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Charged once at enrollment.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Cancellation Policy</h2>
          <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
            <input type="checkbox" {...register('useOrgDefault')} className="mt-0.5 accent-brand" />
            <div>
              <p className="text-sm font-medium text-gray-900">Use organization default</p>
              <p className="text-[10px] text-gray-400">Apply the default cancellation policy from Company Settings.</p>
            </div>
          </label>
          {useOrgDefault && orgDefaultPolicy && (
            <PolicySummary policy={orgDefaultPolicy} />
          )}
          {!useOrgDefault && <CancellationPolicyEditor policy={cancelPolicy} onChange={setCancelPolicy} />}
        </div>

        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" {...register('addToFlow')} className="mt-0.5 accent-brand" />
            <div>
              <p className="text-sm font-medium text-gray-900">Add to mentee flow</p>
              <p className="text-[10px] text-gray-400">Include as a step in the mentee progression.</p>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create Engagement'}</Button>
          <Button variant="secondary" type="button" onClick={() => navigate(backRoute)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
