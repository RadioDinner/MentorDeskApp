import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee, FlowStep, MenteeHabit } from '../types'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import { durationSummary } from '../lib/habits'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name:  z.string().min(1, 'Last name is required'),
  email:      z.string().email('Enter a valid email'),
  phone:      z.string(),
  street:     z.string(),
  city:       z.string(),
  state:      z.string(),
  zip:        z.string(),
  country:    z.string(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const errorClass = 'mt-1 text-xs text-red-500'

export default function MenteeEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mentee, setMentee] = useState<Mentee | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [menteeHabits, setMenteeHabits] = useState<MenteeHabit[]>([])

  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [flowStepId, setFlowStepId] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  // De-activate / Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: '',
    },
  })

  useEffect(() => {
    if (!id) return

    async function fetchMentee() {
      try {
        const { data, error } = await supabase
          .from('mentees')
          .select('*')
          .eq('id', id!)
          .single()

        if (error) {
          setFetchError(error.message)
          return
        }

        const m = data as Mentee
        setMentee(m)
        reset({
          first_name: m.first_name,
          last_name: m.last_name,
          email: m.email,
          phone: m.phone ?? '',
          street: m.street ?? '',
          city: m.city ?? '',
          state: m.state ?? '',
          zip: m.zip ?? '',
          country: m.country ?? '',
        })
        setFlowStepId(m.flow_step_id ?? '')

        // Fetch org's mentee flow
        const { data: orgData } = await supabase
          .from('organizations')
          .select('mentee_flow')
          .eq('id', m.organization_id)
          .single()

        if (orgData?.mentee_flow) {
          setFlowSteps((orgData.mentee_flow as { steps: FlowStep[] }).steps ?? [])
        }

        // Fetch habit assignments for this mentee
        const mhRes = await supabaseRestGet<MenteeHabit>(
          'mentee_habits',
          `select=*&mentee_id=eq.${id}&order=assigned_at.desc`,
          { label: 'menteeEdit:habits' },
        )
        if (!mhRes.error) setMenteeHabits(mhRes.data ?? [])
      } catch (err) {
        setFetchError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetchMentee()
  }, [id, reset])

  async function onSubmit(values: FormValues) {
    if (!mentee) return

    const newVals = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      street: values.street.trim() || null,
      city: values.city.trim() || null,
      state: values.state.trim() || null,
      zip: values.zip.trim() || null,
      country: values.country.trim() || null,
    }

    const { error } = await supabase
      .from('mentees')
      .update(newVals)
      .eq('id', mentee.id)

    if (error) {
      reportSupabaseError(error, { component: 'MenteeEditPage', action: 'saveProfile' })
      toast.error(error.message)
      return
    }

    const oldVals = {
      first_name: mentee.first_name,
      last_name: mentee.last_name,
      email: mentee.email,
      phone: mentee.phone,
      street: mentee.street,
      city: mentee.city,
      state: mentee.state,
      zip: mentee.zip,
      country: mentee.country,
    }
    setMentee({ ...mentee, ...newVals })
    if (currentUser) {
      await logAudit({
        organization_id: mentee.organization_id,
        actor_id: currentUser.id,
        action: 'updated',
        entity_type: 'mentee',
        entity_id: mentee.id,
        details: { name: `${newVals.first_name} ${newVals.last_name}` },
        old_values: oldVals,
        new_values: newVals,
      })
    }
    toast.success('Mentee information has been updated.')
  }

  async function handleDeactivate() {
    if (!mentee || !currentUser) return
    const isDeactivated = !!mentee.archived_at
    const now = isDeactivated ? null : new Date().toISOString()
    const { error } = await supabase.from('mentees').update({ archived_at: now }).eq('id', mentee.id)
    if (error) { reportSupabaseError(error, { component: 'MenteeEditPage', action: 'deactivate' }); toast.error(error.message); return }
    setMentee({ ...mentee, archived_at: now } as Mentee)
    await logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: isDeactivated ? 'reactivated' : 'deactivated', entity_type: 'mentee', entity_id: mentee.id })
    toast.success(isDeactivated ? 'Mentee re-activated.' : 'Mentee de-activated.')
  }

  async function handleDeleteMentee() {
    if (!mentee || !currentUser) return
    setDeleting(true)
    const { error } = await supabase.from('mentees').delete().eq('id', mentee.id)
    setDeleting(false)
    if (error) { reportSupabaseError(error, { component: 'MenteeEditPage', action: 'delete' }); toast.error(error.message); return }
    await logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: 'deleted', entity_type: 'mentee', entity_id: mentee.id })
    navigate('/mentees')
  }

  if (loading) return <Skeleton count={6} className="h-11 w-full" gap="gap-3" />

  if (fetchError || !mentee) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Mentee not found.'}
        </div>
      </div>
    )
  }

  const hasAuthAccount = mentee.user_id !== null

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/mentees')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
            {mentee.first_name[0]}{mentee.last_name[0]}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {mentee.first_name} {mentee.last_name}
            </h1>
            <p className="text-xs text-gray-500">Mentee</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Personal Info */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Personal Information</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
                  <input id="mFirstName" type="text" {...register('first_name')} className={inputClass} />
                  {errors.first_name && <p className={errorClass}>{errors.first_name.message}</p>}
                </div>
                <div>
                  <label htmlFor="mLastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
                  <input id="mLastName" type="text" {...register('last_name')} className={inputClass} />
                  {errors.last_name && <p className={errorClass}>{errors.last_name.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mEmail" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input id="mEmail" type="email" {...register('email')} className={inputClass} />
                  {errors.email && <p className={errorClass}>{errors.email.message}</p>}
                </div>
                <div>
                  <label htmlFor="mPhone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input id="mPhone" type="tel" {...register('phone')} placeholder="Optional" className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="mStreet" className="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
                <input id="mStreet" type="text" {...register('street')} placeholder="Optional" className={inputClass} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="mCity" className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                  <input id="mCity" type="text" {...register('city')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mState" className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
                  <input id="mState" type="text" {...register('state')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="mZip" className="block text-sm font-medium text-gray-700 mb-1.5">ZIP</label>
                  <input id="mZip" type="text" {...register('zip')} className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="mCountry" className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <input id="mCountry" type="text" {...register('country')} className={inputClass} />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Program Status */}
          {flowSteps.length > 0 && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Program Status</h2>

              {/* Current status display */}
              {flowStepId && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Current status</p>
                  <p className="text-sm font-medium text-gray-900">
                    {flowSteps.find(s => s.id === flowStepId)?.name ?? 'Unknown'}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="flowStep" className="block text-xs font-medium text-gray-700 mb-1">
                  {flowStepId ? 'Change status' : 'Set status'}
                </label>
                <select id="flowStep" value={flowStepId}
                  onChange={e => setFlowStepId(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white">
                  <option value="">No status set</option>
                  {flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order).length > 0 && (
                    <optgroup label="Program journey">
                      {flowSteps.filter(s => s.in_flow).sort((a, b) => a.order - b.order).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {flowSteps.filter(s => !s.in_flow).length > 0 && (
                    <optgroup label="Other statuses">
                      {flowSteps.filter(s => !s.in_flow).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <Button type="button" disabled={statusSaving} block className="mt-3"
                onClick={async () => {
                  if (!mentee) return
                  setStatusSaving(true)
                  const { error } = await supabase
                    .from('mentees')
                    .update({ flow_step_id: flowStepId || null })
                    .eq('id', mentee.id)
                  setStatusSaving(false)
                  if (error) { reportSupabaseError(error, { component: 'MenteeEditPage', action: 'saveStatus' }); toast.error(error.message); return }
                  if (currentUser) await logAudit({ organization_id: mentee.organization_id, actor_id: currentUser.id, action: 'updated', entity_type: 'mentee', entity_id: mentee.id, details: { fields: 'status', status: flowSteps.find(s => s.id === flowStepId)?.name ?? 'cleared' } })
                  toast.success('Status updated.')
                }}>
                {statusSaving ? 'Saving…' : 'Save status'}
              </Button>
            </div>
          )}

          {/* Account */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-block w-2 h-2 rounded-full ${hasAuthAccount ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">
                {hasAuthAccount ? 'Login enabled' : 'No login account'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Added: {formatDate(mentee.created_at)}
            </p>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-md border border-red-200 px-6 py-6">
            <h2 className="text-base font-semibold text-red-600 mb-4">Danger Zone</h2>

            <div className="space-y-3">
              {/* De-activate / Re-activate */}
              <div>
                <button type="button" onClick={handleDeactivate}
                  className={`w-full rounded border px-4 py-2.5 text-sm font-medium transition-colors text-left ${mentee.archived_at ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                  {mentee.archived_at ? 'Re-activate this mentee' : 'De-activate this mentee'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {mentee.archived_at
                    ? 'Re-activating will return them to active mentee lists.'
                    : 'De-activating hides them from active lists. Can be re-activated later.'}
                </p>
              </div>

              {/* Delete */}
              {!showDeleteConfirm ? (
                <div>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
                    Delete this mentee
                  </button>
                  <p className="text-xs text-gray-400 mt-1 px-1">Permanently remove this mentee and all their data.</p>
                </div>
              ) : (
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure?</p>
                  <p className="text-xs text-red-600">
                    This will permanently delete <strong>{mentee.first_name} {mentee.last_name}</strong> and all associated data. This action cannot be undone.
                  </p>
                  <p className="text-xs text-gray-500">
                    Would you rather <button type="button" onClick={() => { handleDeactivate(); setShowDeleteConfirm(false) }} className="text-amber-600 font-medium underline hover:text-amber-700">de-activate</button> them instead? De-activated mentees can be re-activated later.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="danger" type="button" disabled={deleting} onClick={handleDeleteMentee}>
                      {deleting ? 'Deleting…' : 'Yes, permanently delete'}
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Habit assignments ─────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-md border border-gray-200/80 px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Habits</h2>
            <p className="text-xs text-gray-500 mt-0.5">Daily check-in routines assigned to this mentee.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/habits')}
            className="text-xs text-brand hover:underline"
          >
            Manage habits →
          </button>
        </div>

        {menteeHabits.length === 0 ? (
          <p className="text-sm text-gray-400">No habits assigned yet. Assign habits from the Habits page.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
            {menteeHabits.map(mh => (
              <li key={mh.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {mh.name_snapshot[0]?.toUpperCase() ?? 'H'}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/habits/${mh.habit_id}/edit`)}
                    className="text-sm font-medium text-gray-900 hover:text-brand text-left truncate"
                  >
                    {mh.name_snapshot}
                  </button>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {durationSummary({
                      duration_mode: mh.duration_mode_snapshot,
                      duration_days: mh.duration_days_snapshot,
                      goal_successful_days: mh.goal_successful_days_snapshot,
                    })}
                    {' · '}
                    {mh.successful_days_count} successful day{mh.successful_days_count === 1 ? '' : 's'}
                    {' · '}
                    started {formatDate(mh.start_date)}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                  mh.status === 'active' ? 'bg-teal-50 text-teal-600'
                    : mh.status === 'completed' ? 'bg-green-50 text-green-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {mh.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
