import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'

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

export default function HabitCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    watch,
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

  const durationMode = watch('duration_mode')

  async function onSubmit(values: FormValues) {
    if (!profile) return

    const payload = {
      organization_id: profile.organization_id,
      name: values.name.trim(),
      description: values.description.trim() || null,
      duration_mode: values.duration_mode,
      duration_days: values.duration_mode === 'until_x_successful'
        ? null
        : Number(values.duration_days),
      goal_successful_days: values.duration_mode === 'fixed_days'
        ? null
        : Number(values.goal_successful_days),
      is_active: true,
      created_by: profile.id,
    }

    const { data, error } = await supabase
      .from('habits')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      reportSupabaseError(error, { component: 'HabitCreatePage', action: 'create' })
      toast.error(error.message)
      return
    }

    if (data) {
      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'created',
        entity_type: 'habit',
        entity_id: data.id,
        details: { name: payload.name },
      })
      navigate(`/habits/${data.id}/edit`)
    } else {
      navigate('/habits')
    }
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
        <h1 className="text-lg font-semibold text-gray-900">Create Habit</h1>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="habitName" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              id="habitName"
              type="text"
              placeholder="e.g. Daily Walk"
              {...register('name')}
              className={`${inputClass}${errors.name ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
            />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="habitDescription" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              id="habitDescription"
              rows={3}
              placeholder="Optional — what this habit is for"
              {...register('description')}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input
                  type="radio"
                  value="fixed_days"
                  {...register('duration_mode')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Fixed number of days</p>
                  <p className="text-xs text-gray-500">Habit runs for a set window then auto-completes.</p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input
                  type="radio"
                  value="goal_x_of_y"
                  {...register('duration_mode')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">X successful days within a window</p>
                  <p className="text-xs text-gray-500">Completes early if the goal is hit; marked abandoned if the window ends short.</p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
                <input
                  type="radio"
                  value="until_x_successful"
                  {...register('duration_mode')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Until X successful days</p>
                  <p className="text-xs text-gray-500">Open-ended. Runs until the goal is hit.</p>
                </div>
              </label>
            </div>
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
              {isSubmitting ? 'Creating…' : 'Create Habit'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => navigate('/habits')}>Cancel</Button>
          </div>
          <p className="text-xs text-gray-400">After creating, you'll add steps and assign it to mentees on the next page.</p>
        </form>
      </div>
    </div>
  )
}
