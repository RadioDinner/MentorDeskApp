import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import type { Offering, DispenseMode, PreviewMode, AllocationPeriod, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
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

const schema = z.object({
  name:              z.string().min(1, 'Name is required'),
  description:       z.string(),
  icon_url:          z.string(),
  billing_mode:      z.enum(['one_time', 'recurring']),
  price:             z.string(),
  recurring_price:   z.string(),
  setup_fee:         z.string(),
  dispense_mode:     z.enum(['completion', 'interval', 'all_at_once']),
  interval_days:     z.string(),
  lesson_count:      z.string(),
  completion_days:   z.string(),
  preview_mode:      z.enum(['hidden', 'titles_only', 'full_preview']),
  meeting_count:     z.string(),
  meeting_duration:  z.string(),
  allocation_period: z.enum(['monthly', 'weekly', 'per_cycle']),
  use_org_default:   z.boolean(),
  auto_send_invoice: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const selectClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'
const errorClass = 'mt-1 text-xs text-red-500'

export default function OfferingEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [offering, setOffering] = useState<Offering | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  // cancelPolicy is a structured value managed by CancellationPolicyEditor,
  // which takes (policy, onChange) props. Keeping it in local state rather
  // than in the RHF form avoids having to Controller-wrap the nested editor.
  const [cancelPolicy, setCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      icon_url: '',
      billing_mode: 'one_time',
      price: '',
      recurring_price: '',
      setup_fee: '',
      dispense_mode: 'completion',
      interval_days: '',
      lesson_count: '',
      completion_days: '',
      preview_mode: 'titles_only',
      meeting_count: '',
      meeting_duration: '60',
      allocation_period: 'monthly',
      use_org_default: true,
      auto_send_invoice: false,
    },
  })

  // Watched fields for conditional UI.
  const iconUrl = watch('icon_url')
  const name = watch('name')
  const billingMode = watch('billing_mode')
  const dispenseMode = watch('dispense_mode')
  const useOrgDefault = watch('use_org_default')

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
        reset({
          name: o.name,
          description: o.description ?? '',
          icon_url: o.icon_url ?? '',
          billing_mode: o.billing_mode ?? 'one_time',
          price: o.price_cents ? (o.price_cents / 100).toFixed(2) : '',
          recurring_price: o.recurring_price_cents ? (o.recurring_price_cents / 100).toFixed(2) : '',
          setup_fee: o.setup_fee_cents ? (o.setup_fee_cents / 100).toFixed(2) : '',
          dispense_mode: o.dispense_mode,
          interval_days: o.dispense_interval_days ? String(o.dispense_interval_days) : '',
          lesson_count: o.lesson_count ? String(o.lesson_count) : '',
          completion_days: o.expected_completion_days ? String(o.expected_completion_days) : '',
          preview_mode: o.preview_mode,
          meeting_count: o.meeting_count ? String(o.meeting_count) : '',
          meeting_duration: String(o.default_meeting_duration_minutes ?? 60),
          allocation_period: o.allocation_period ?? 'monthly',
          use_org_default: o.use_org_default_cancellation ?? true,
          auto_send_invoice: o.auto_send_invoice ?? false,
        })
        setCancelPolicy(o.cancellation_policy ?? DEFAULT_CANCELLATION_POLICY)
      } catch (err) {
        setFetchError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchOffering()
  }, [id, reset])

  async function onSubmit(values: FormValues) {
    if (!offering) return

    const updates: Record<string, unknown> = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      icon_url: values.icon_url.trim() || null,
    }

    if (offering.type === 'course') {
      updates.billing_mode = values.billing_mode
      updates.price_cents = values.billing_mode === 'one_time' && values.price
        ? Math.round(parseFloat(values.price) * 100)
        : 0
      updates.recurring_price_cents = values.billing_mode === 'recurring' && values.recurring_price
        ? Math.round(parseFloat(values.recurring_price) * 100)
        : 0
      updates.setup_fee_cents = values.setup_fee ? Math.round(parseFloat(values.setup_fee) * 100) : 0
      updates.dispense_mode = values.dispense_mode
      updates.dispense_interval_days = values.dispense_mode === 'interval' && values.interval_days
        ? parseInt(values.interval_days)
        : null
      updates.lesson_count = values.lesson_count ? parseInt(values.lesson_count) : null
      updates.expected_completion_days = values.completion_days ? parseInt(values.completion_days) : null
      updates.preview_mode = values.preview_mode
    }

    if (offering.type === 'engagement') {
      updates.recurring_price_cents = values.recurring_price
        ? Math.round(parseFloat(values.recurring_price) * 100)
        : 0
      updates.setup_fee_cents = values.setup_fee ? Math.round(parseFloat(values.setup_fee) * 100) : 0
      updates.meeting_count = values.meeting_count ? parseInt(values.meeting_count) : null
      updates.default_meeting_duration_minutes = values.meeting_duration
        ? Math.max(5, parseInt(values.meeting_duration))
        : 60
      updates.allocation_period = values.allocation_period
      updates.use_org_default_cancellation = values.use_org_default
      updates.cancellation_policy = values.use_org_default ? null : cancelPolicy
      updates.auto_send_invoice = values.auto_send_invoice
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

      const oldVals = {
        name: offering.name,
        description: offering.description,
        billing_mode: offering.billing_mode,
        price_cents: offering.price_cents,
        recurring_price_cents: offering.recurring_price_cents,
        setup_fee_cents: offering.setup_fee_cents,
      }
      setOffering({ ...offering, name: values.name.trim(), description: values.description.trim() || null })
      if (currentUser) {
        await logAudit({
          organization_id: offering.organization_id,
          actor_id: currentUser.id,
          action: 'updated',
          entity_type: 'offering',
          entity_id: offering.id,
          details: { type: offering.type, name: values.name.trim() },
          old_values: oldVals,
          new_values: updates,
        })
      }
      toast.success('Offering has been updated.')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
      console.error('[OfferingEdit] save error:', err)
    }
  }

  if (loading) return <Skeleton count={6} className="h-11 w-full" gap="gap-3" />

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Basic info */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{typeLabel} Details</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="editName" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input id="editName" type="text" {...register('name')} className={inputClass} />
              {errors.name && <p className={errorClass}>{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="editDesc" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea id="editDesc" rows={3} {...register('description')}
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
                  <input type="text" {...register('icon_url')}
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
                        reader.onload = () => setValue('icon_url', reader.result as string, { shouldDirty: true })
                        reader.readAsDataURL(file)
                      }
                      input.click()
                    }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                      Upload image
                    </button>
                    {iconUrl && (
                      <Button variant="dangerGhost" size="sm" type="button" onClick={() => setValue('icon_url', '', { shouldDirty: true })}>
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
                <label htmlFor="editPrice" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {billingMode === 'recurring' ? 'Recurring price' : 'Course price'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    id="editPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register(billingMode === 'recurring' ? 'recurring_price' : 'price')}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="editRecurringPrice" className="block text-sm font-medium text-gray-700 mb-1.5">Recurring price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="editRecurringPrice" type="number" step="0.01" min="0"
                    {...register('recurring_price')} placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="editSetupFee" className="block text-sm font-medium text-gray-700 mb-1.5">One-time setup fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input id="editSetupFee" type="number" step="0.01" min="0"
                  {...register('setup_fee')} placeholder="0.00"
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
                <input id="editLessonCount" type="number" min="1"
                  {...register('lesson_count')} placeholder="e.g. 12"
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
                      <input type="radio" value={opt.value}
                        {...register('dispense_mode')}
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
                  <input id="editIntervalDays" type="number" min="1"
                    {...register('interval_days')} placeholder="e.g. 7"
                    className={inputClass + ' max-w-32'} />
                </div>
              )}

              <div>
                <label htmlFor="editCompletionDays" className="block text-sm font-medium text-gray-700 mb-1.5">Expected completion time</label>
                <div className="flex items-center gap-2">
                  <input id="editCompletionDays" type="number" min="1"
                    {...register('completion_days')} placeholder="e.g. 90"
                    className={inputClass + ' max-w-28'} />
                  <span className="text-sm text-gray-500">days</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Optional. Each mentee's due date will be calculated from their start date + this duration.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upcoming lesson visibility</label>
                <select {...register('preview_mode')} className={selectClass}>
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
                  <input id="editMeetingCount" type="number" min="1"
                    {...register('meeting_count')}
                    placeholder="e.g. 4"
                    className={inputClass} />
                  <p className="text-xs text-gray-400 mt-1">Credits allocated per payment cycle.</p>
                </div>
                <div>
                  <label htmlFor="editMeetingDuration" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Meeting length
                  </label>
                  <div className="flex items-center gap-2">
                    <input id="editMeetingDuration" type="number" min="5" step="5"
                      {...register('meeting_duration')}
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
                  <select id="editAllocPeriod"
                    {...register('allocation_period')}
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
                {...register('auto_send_invoice')}
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
                {...register('use_org_default')}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
