import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import LoadingErrorState from '../components/LoadingErrorState'
import { durationSummary } from '../lib/habits'
import type { Habit } from '../types'

// Metadata-only edit form. The step builder and mentee-assignment UI
// are planned for session 018 (see Session 017 handoff log).
const schema = z.object({
  name:                 z.string().min(1, 'Name is required'),
  description:          z.string(),
  duration_mode:        z.enum(['fixed_days', 'goal_x_of_y', 'until_x_successful']),
  duration_days:        z.string(),
  goal_successful_days: z.string(),
}).superRefine((val, ctx) => {
  if (val.duration_mode === 'fixed_days') {
    const n = Number(val.duration_days)
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', path: ['duration_days'], message: 'Enter a number of days (> 0)' })
    }
  }
  if (val.duration_mode === 'goal_x_of_y') {
    const y = Number(val.duration_days)
    const x = Number(val.goal_successful_days)
    if (!Number.isInteger(y) || y <= 0) {
      ctx.addIssue({ code: 'custom', path: ['duration_days'], message: 'Window must be > 0' })
    }
    if (!Number.isInteger(x) || x <= 0) {
      ctx.addIssue({ code: 'custom', path: ['goal_successful_days'], message: 'Goal must be > 0' })
    }
    if (Number.isInteger(x) && Number.isInteger(y) && x > y) {
      ctx.addIssue({ code: 'custom', path: ['goal_successful_days'], message: 'Goal cannot exceed the window' })
    }
  }
  if (val.duration_mode === 'until_x_successful') {
    const n = Number(val.goal_successful_days)
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', path: ['goal_successful_days'], message: 'Enter a goal (> 0)' })
    }
  }
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const errorClass = 'mt-1 text-xs text-red-500'

export default function HabitEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [habit, setHabit] = useState<Habit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      duration_mode: 'fixed_days',
      duration_days: '30',
      goal_successful_days: '21',
    },
  })

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('habits')
          .select('*')
          .eq('id', id!)
          .single()
        if (err) { setError(err.message); return }
        const h = data as Habit
        setHabit(h)
        reset({
          name: h.name,
          description: h.description ?? '',
          duration_mode: h.duration_mode,
          duration_days: h.duration_days != null ? String(h.duration_days) : '30',
          goal_successful_days: h.goal_successful_days != null ? String(h.goal_successful_days) : '21',
        })
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchRef.current = load
    load()
  }, [id, reset])

  const durationMode = watch('duration_mode')

  async function onSubmit(values: FormValues) {
    if (!profile || !habit) return

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      duration_mode: values.duration_mode,
      duration_days: values.duration_mode === 'until_x_successful'
        ? null
        : Number(values.duration_days),
      goal_successful_days: values.duration_mode === 'fixed_days'
        ? null
        : Number(values.goal_successful_days),
    }

    const { error: err } = await supabase
      .from('habits')
      .update(payload)
      .eq('id', habit.id)

    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'update' })
      toast.error(err.message)
      return
    }

    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'habit',
      entity_id: habit.id,
      details: { name: payload.name },
      old_values: { name: habit.name, description: habit.description },
      new_values: payload,
    })
    toast.success('Habit updated')
    setHabit({ ...habit, ...payload })
  }

  async function toggleActive() {
    if (!profile || !habit) return
    const next = !habit.is_active
    const { error: err } = await supabase
      .from('habits')
      .update({ is_active: next })
      .eq('id', habit.id)
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'toggleActive' })
      toast.error(err.message)
      return
    }
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: next ? 'restored' : 'retired',
      entity_type: 'habit',
      entity_id: habit.id,
    })
    setHabit({ ...habit, is_active: next })
    toast.success(next ? 'Habit restored' : 'Habit retired')
  }

  async function handleDelete() {
    if (!profile || !habit) return
    if (!confirm(`Delete "${habit.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const { error: err } = await supabase.from('habits').delete().eq('id', habit.id)
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'delete' })
      toast.error(err.message)
      setDeleting(false)
      return
    }
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'deleted',
      entity_type: 'habit',
      entity_id: habit.id,
      details: { name: habit.name },
    })
    toast.success('Habit deleted')
    navigate('/habits')
  }

  if (loading) return <Skeleton count={4} className="h-16 w-full" gap="gap-3" />
  if (error || !habit) {
    return (
      <div className="max-w-2xl">
        <button onClick={() => navigate('/habits')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          &larr; Back
        </button>
        <LoadingErrorState message={error ?? 'Habit not found.'} onRetry={() => fetchRef.current()} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/habits')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{habit.name}</h1>
        {!habit.is_active && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            Retired
          </span>
        )}
      </div>

      {/* Placeholder notice about unfinished parts of the feature */}
      <div className="mb-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <p className="font-medium mb-0.5">Step builder and mentee assignments coming soon.</p>
        <p>You can edit a habit's metadata here; adding steps and assigning it to mentees is in the next session's backlog.</p>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className={`${inputClass}${errors.name ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
            />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              id="description"
              rows={3}
              {...register('description')}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input type="radio" value="fixed_days" {...register('duration_mode')} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Fixed number of days</p>
                  <p className="text-xs text-gray-500">Habit runs for a set window then auto-completes.</p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input type="radio" value="goal_x_of_y" {...register('duration_mode')} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">X successful days within a window</p>
                  <p className="text-xs text-gray-500">Completes early if the goal is hit; abandoned if the window ends short.</p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input type="radio" value="until_x_successful" {...register('duration_mode')} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Until X successful days</p>
                  <p className="text-xs text-gray-500">Open-ended. Runs until the goal is hit.</p>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-2">Current: {durationSummary(habit)}</p>
          </div>

          {durationMode === 'fixed_days' && (
            <div>
              <label htmlFor="dDays" className="block text-sm font-medium text-gray-700 mb-1.5">Number of days</label>
              <input
                id="dDays"
                type="number"
                min={1}
                {...register('duration_days')}
                className={`${inputClass} w-32${errors.duration_days ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
              />
              {errors.duration_days && <p className={errorClass}>{errors.duration_days.message}</p>}
            </div>
          )}

          {durationMode === 'goal_x_of_y' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="goalX" className="block text-sm font-medium text-gray-700 mb-1.5">Goal (successful days)</label>
                <input
                  id="goalX"
                  type="number"
                  min={1}
                  {...register('goal_successful_days')}
                  className={`${inputClass}${errors.goal_successful_days ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
                />
                {errors.goal_successful_days && <p className={errorClass}>{errors.goal_successful_days.message}</p>}
              </div>
              <div>
                <label htmlFor="windowY" className="block text-sm font-medium text-gray-700 mb-1.5">Window (days)</label>
                <input
                  id="windowY"
                  type="number"
                  min={1}
                  {...register('duration_days')}
                  className={`${inputClass}${errors.duration_days ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
                />
                {errors.duration_days && <p className={errorClass}>{errors.duration_days.message}</p>}
              </div>
            </div>
          )}

          {durationMode === 'until_x_successful' && (
            <div>
              <label htmlFor="goalUntil" className="block text-sm font-medium text-gray-700 mb-1.5">Target successful days</label>
              <input
                id="goalUntil"
                type="number"
                min={1}
                {...register('goal_successful_days')}
                className={`${inputClass} w-32${errors.goal_successful_days ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
              />
              {errors.goal_successful_days && <p className={errorClass}>{errors.goal_successful_days.message}</p>}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button variant="secondary" type="button" onClick={toggleActive}>
              {habit.is_active ? 'Retire' : 'Restore'}
            </Button>
            <Button variant="secondary" type="button" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
