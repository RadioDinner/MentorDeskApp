import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestCall, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import LoadingErrorState from '../components/LoadingErrorState'
import { durationSummary, computeEndDate, todayISO } from '../lib/habits'
import { formatDate } from '../lib/format'
import type { Habit, HabitStep, MenteeHabit, Mentee } from '../types'

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

interface MenteeHabitWithName extends MenteeHabit {
  mentee_name: string
}

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const errorClass = 'mt-1 text-xs text-red-500'

export default function HabitEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [habit, setHabit] = useState<Habit | null>(null)
  const [steps, setSteps] = useState<HabitStep[]>([])
  const [assignments, setAssignments] = useState<MenteeHabitWithName[]>([])
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Step builder state
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [stepDraft, setStepDraft] = useState<{ title: string; instructions: string }>({ title: '', instructions: '' })
  const stepDragRef = useRef<number | null>(null)
  const [stepDragOver, setStepDragOver] = useState<number | null>(null)

  // Assignment form state
  const [assignMenteeId, setAssignMenteeId] = useState('')
  const [assignStartDate, setAssignStartDate] = useState(todayISO())
  const [assigning, setAssigning] = useState(false)

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
    if (!id || !profile) return
    const orgId = profile.organization_id
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [habitRes, stepsRes, mhRes, menteesRes] = await Promise.all([
          supabase.from('habits').select('*').eq('id', id!).single(),
          supabaseRestGet<HabitStep>('habit_steps', `habit_id=eq.${id}&order=order_index.asc`, { label: 'habit:steps' }),
          supabaseRestGet<MenteeHabit & { mentee: { first_name: string; last_name: string } | null }>(
            'mentee_habits',
            `select=*,mentee:mentees(first_name,last_name)&habit_id=eq.${id}&order=assigned_at.desc`,
            { label: 'habit:assignments' },
          ),
          supabaseRestGet<Mentee>(
            'mentees',
            `select=id,first_name,last_name,email&organization_id=eq.${orgId}&archived_at=is.null&order=first_name.asc`,
            { label: 'habit:mentees' },
          ),
        ])
        if (habitRes.error) { setError(habitRes.error.message); return }
        const h = habitRes.data as Habit
        setHabit(h)
        reset({
          name: h.name,
          description: h.description ?? '',
          duration_mode: h.duration_mode,
          duration_days: h.duration_days != null ? String(h.duration_days) : '30',
          goal_successful_days: h.goal_successful_days != null ? String(h.goal_successful_days) : '21',
        })
        if (stepsRes.error) { setError(stepsRes.error.message); return }
        setSteps(stepsRes.data ?? [])
        if (mhRes.error) { setError(mhRes.error.message); return }
        setAssignments((mhRes.data ?? []).map(mh => ({
          ...mh,
          mentee_name: mh.mentee
            ? `${mh.mentee.first_name} ${mh.mentee.last_name}`
            : '(unknown)',
        })))
        if (menteesRes.error) { setError(menteesRes.error.message); return }
        setMentees(menteesRes.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchRef.current = load
    load()
  }, [id, reset, profile?.organization_id])

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

  // ── Step builder ─────────────────────────────────────────────────────

  function beginEditStep(step: HabitStep) {
    setEditingStepId(step.id)
    setStepDraft({ title: step.title, instructions: step.instructions ?? '' })
  }

  function cancelEditStep() {
    setEditingStepId(null)
    setStepDraft({ title: '', instructions: '' })
  }

  async function addStep() {
    if (!profile || !habit) return
    const newIndex = steps.length
    const { data, error: err } = await supabaseRestCall('habit_steps', 'POST', {
      habit_id: habit.id,
      organization_id: profile.organization_id,
      order_index: newIndex,
      title: `Step ${newIndex + 1}`,
    })
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'addStep' })
      toast.error(err.message)
      return
    }
    if (!data?.length) return
    const newStep = data[0] as unknown as HabitStep
    setSteps(prev => [...prev, newStep])
    beginEditStep(newStep)
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'created',
      entity_type: 'habit',
      entity_id: habit.id,
      details: { sub: 'step_added', step_id: newStep.id },
    })
  }

  async function saveStep(stepId: string) {
    if (!profile || !habit) return
    const title = stepDraft.title.trim()
    if (!title) {
      toast.error('Step title is required')
      return
    }
    const instructions = stepDraft.instructions.trim() || null
    const { error: err } = await supabaseRestCall(
      'habit_steps',
      'PATCH',
      { title, instructions },
      `id=eq.${stepId}`,
    )
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'saveStep' })
      toast.error(err.message)
      return
    }
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, title, instructions } : s))
    setEditingStepId(null)
    setStepDraft({ title: '', instructions: '' })
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'habit',
      entity_id: habit.id,
      details: { sub: 'step_updated', step_id: stepId },
    })
    toast.success('Step saved')
  }

  async function deleteStep(stepId: string) {
    if (!profile || !habit) return
    if (!confirm('Delete this step?')) return
    const { error: err } = await supabaseRestCall('habit_steps', 'DELETE', {}, `id=eq.${stepId}`)
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'deleteStep' })
      toast.error(err.message)
      return
    }
    const remaining = steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order_index: i }))
    setSteps(remaining)
    // Re-index the survivors whose index changed
    await Promise.all(
      remaining
        .filter((s, i) => steps.find(o => o.id === s.id)?.order_index !== i)
        .map(s => supabaseRestCall('habit_steps', 'PATCH', { order_index: s.order_index }, `id=eq.${s.id}`)),
    )
    if (editingStepId === stepId) cancelEditStep()
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'habit',
      entity_id: habit.id,
      details: { sub: 'step_deleted', step_id: stepId },
    })
  }

  function handleStepDragStart(index: number) { stepDragRef.current = index }
  function handleStepDragOver(e: React.DragEvent, index: number) { e.preventDefault(); setStepDragOver(index) }
  async function handleStepDrop(targetIndex: number) {
    const fromIndex = stepDragRef.current
    stepDragRef.current = null
    setStepDragOver(null)
    if (fromIndex === null || fromIndex === targetIndex) return
    const prev = [...steps]
    const reordered = [...steps]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, order_index: i }))
    setSteps(updated)
    try {
      const results = await Promise.all(
        updated.map(s => supabaseRestCall('habit_steps', 'PATCH', { order_index: s.order_index }, `id=eq.${s.id}`)),
      )
      if (results.some(r => r.error)) { setSteps(prev); toast.error('Reorder failed') }
    } catch {
      setSteps(prev)
      toast.error('Reorder failed')
    }
  }

  // ── Mentee assignment ────────────────────────────────────────────────

  async function assignToMentee() {
    if (!profile || !habit) return
    if (!assignMenteeId) { toast.error('Pick a mentee first'); return }
    if (steps.length === 0) { toast.error('Add at least one step before assigning'); return }
    if (!habit.is_active) { toast.error('Cannot assign a retired habit'); return }
    setAssigning(true)
    try {
      const endDate = computeEndDate(assignStartDate, {
        duration_mode: habit.duration_mode,
        duration_days: habit.duration_days,
        goal_successful_days: habit.goal_successful_days,
      })
      const { data: mhRows, error: mhErr } = await supabaseRestCall('mentee_habits', 'POST', {
        organization_id: profile.organization_id,
        habit_id: habit.id,
        mentee_id: assignMenteeId,
        assigned_by: profile.id,
        start_date: assignStartDate,
        end_date: endDate,
        status: 'active',
        successful_days_count: 0,
        name_snapshot: habit.name,
        description_snapshot: habit.description,
        duration_mode_snapshot: habit.duration_mode,
        duration_days_snapshot: habit.duration_days,
        goal_successful_days_snapshot: habit.goal_successful_days,
      })
      if (mhErr || !mhRows?.length) {
        toast.error(mhErr?.message ?? 'Failed to assign habit')
        return
      }
      const mh = mhRows[0] as unknown as MenteeHabit

      // Snapshot steps
      const stepPayload = steps.map(s => ({
        mentee_habit_id: mh.id,
        organization_id: profile.organization_id,
        order_index: s.order_index,
        title: s.title,
        instructions: s.instructions,
      }))
      const { error: stepErr } = await supabaseRestCall('mentee_habit_steps', 'POST', stepPayload as unknown as Record<string, unknown>)
      if (stepErr) {
        toast.error('Assignment created but step snapshot failed: ' + stepErr.message)
      }

      const mentee = mentees.find(m => m.id === assignMenteeId)
      const menteeName = mentee ? `${mentee.first_name} ${mentee.last_name}` : '(unknown)'
      setAssignments(prev => [{ ...mh, mentee_name: menteeName }, ...prev])
      setAssignMenteeId('')
      setAssignStartDate(todayISO())
      toast.success(`Assigned to ${menteeName}`)
      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'created',
        entity_type: 'mentee_habit',
        entity_id: mh.id,
        details: { habit_id: habit.id, mentee_id: assignMenteeId, name: habit.name },
      })
    } finally {
      setAssigning(false)
    }
  }

  async function endAssignment(mhId: string) {
    if (!profile) return
    if (!confirm('End this habit assignment?')) return
    const { error: err } = await supabaseRestCall(
      'mentee_habits',
      'PATCH',
      { status: 'abandoned', completed_at: new Date().toISOString() },
      `id=eq.${mhId}`,
    )
    if (err) {
      reportSupabaseError(err, { component: 'HabitEditPage', action: 'endAssignment' })
      toast.error(err.message)
      return
    }
    setAssignments(prev => prev.map(a => a.id === mhId ? { ...a, status: 'abandoned' } : a))
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'updated',
      entity_type: 'mentee_habit',
      entity_id: mhId,
      details: { ended: true },
    })
    toast.success('Assignment ended')
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

  const activeAssignments = assignments.filter(a => a.status === 'active')
  const pastAssignments = assignments.filter(a => a.status !== 'active')
  const menteeIdsAlreadyActive = new Set(activeAssignments.map(a => a.mentee_id))
  const availableMentees = mentees.filter(m => !menteeIdsAlreadyActive.has(m.id))

  return (
    <div className="max-w-3xl">
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

      {/* ── Metadata form ──────────────────────────────────────────── */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Details</h2>
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

      {/* ── Step builder ───────────────────────────────────────────── */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Steps</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {steps.length === 0
                ? 'No steps yet. A day is successful only when every step is checked off.'
                : 'Drag to reorder. A day is successful only when every step is checked off.'}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={addStep}>+ Add step</Button>
        </div>

        {steps.length === 0 ? (
          <div className="rounded border border-dashed border-gray-200 px-4 py-8 text-center">
            <p className="text-sm text-gray-400">No steps yet — click "Add step" to start.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {steps.map((step, index) => {
              const isEditing = editingStepId === step.id
              const isDragTarget = stepDragOver === index
              return (
                <li
                  key={step.id}
                  draggable={!isEditing}
                  onDragStart={() => handleStepDragStart(index)}
                  onDragOver={(e) => handleStepDragOver(e, index)}
                  onDrop={() => handleStepDrop(index)}
                  onDragEnd={() => { stepDragRef.current = null; setStepDragOver(null) }}
                  className={`rounded border ${isDragTarget ? 'border-brand bg-brand-light/30' : 'border-gray-200'} ${isEditing ? 'bg-gray-50' : 'bg-white'} px-4 py-3`}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="font-mono">{index + 1}.</span>
                        <span>Editing step</span>
                      </div>
                      <input
                        type="text"
                        value={stepDraft.title}
                        onChange={e => setStepDraft(d => ({ ...d, title: e.target.value }))}
                        placeholder="Step title"
                        className={inputClass}
                      />
                      <textarea
                        value={stepDraft.instructions}
                        onChange={e => setStepDraft(d => ({ ...d, instructions: e.target.value }))}
                        placeholder="Instructions (optional)"
                        rows={2}
                        className={`${inputClass} resize-none`}
                      />
                      <div className="flex items-center gap-2">
                        <Button type="button" onClick={() => saveStep(step.id)}>Save step</Button>
                        <Button type="button" variant="secondary" onClick={cancelEditStep}>Cancel</Button>
                        <button
                          type="button"
                          onClick={() => deleteStep(step.id)}
                          className="ml-auto text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="text-gray-300 cursor-grab select-none mt-0.5" aria-hidden>⋮⋮</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          <span className="text-gray-400 font-normal mr-1">{index + 1}.</span>
                          {step.title}
                        </p>
                        {step.instructions && (
                          <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{step.instructions}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => beginEditStep(step)}
                        className="text-xs text-brand hover:underline shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStep(step.id)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Mentee assignments ─────────────────────────────────────── */}
      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8 mb-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">Mentee assignments</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Assigning snapshots the habit's current steps and duration, so later edits
            won't retroactively change an in-flight assignment.
          </p>
        </div>

        {/* Assign form */}
        {habit.is_active && (
          <div className="rounded border border-gray-200 bg-gray-50/60 px-4 py-4 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div>
                <label htmlFor="assignMentee" className="block text-xs font-medium text-gray-700 mb-1">Mentee</label>
                <select
                  id="assignMentee"
                  value={assignMenteeId}
                  onChange={e => setAssignMenteeId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a mentee…</option>
                  {availableMentees.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
                {availableMentees.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">All active mentees already have this habit.</p>
                )}
              </div>
              <div>
                <label htmlFor="assignStart" className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                <input
                  id="assignStart"
                  type="date"
                  value={assignStartDate}
                  onChange={e => setAssignStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <Button type="button" onClick={assignToMentee} disabled={assigning || !assignMenteeId || steps.length === 0}>
                {assigning ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
            {steps.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">Add at least one step before assigning this habit.</p>
            )}
          </div>
        )}

        {/* Active assignments */}
        {activeAssignments.length === 0 && pastAssignments.length === 0 ? (
          <p className="text-sm text-gray-400">No assignments yet.</p>
        ) : (
          <div className="space-y-4">
            {activeAssignments.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Active</p>
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
                  {activeAssignments.map(a => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.mentee_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {durationSummary({
                            duration_mode: a.duration_mode_snapshot,
                            duration_days: a.duration_days_snapshot,
                            goal_successful_days: a.goal_successful_days_snapshot,
                          })}
                          {' · '}
                          {a.successful_days_count} successful day{a.successful_days_count === 1 ? '' : 's'}
                          {' · '}
                          started {formatDate(a.start_date)}
                          {a.end_date && ` · ends ${formatDate(a.end_date)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => endAssignment(a.id)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0"
                      >
                        End
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pastAssignments.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Past</p>
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
                  {pastAssignments.map(a => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-700 truncate">{a.mentee_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {a.status} · {a.successful_days_count} successful day{a.successful_days_count === 1 ? '' : 's'}
                          {' · '}
                          started {formatDate(a.start_date)}
                        </p>
                      </div>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${a.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
