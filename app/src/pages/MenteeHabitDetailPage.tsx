import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet, supabaseRestCall } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import { Skeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import {
  todayISO,
  diffDays,
  addDaysISO,
  durationSummary,
  successfulDatesFromLogs,
  computeStatus,
} from '../lib/habits'
import { formatDate } from '../lib/format'
import type { MenteeHabit, MenteeHabitStep, MenteeHabitStepLog } from '../types'

export default function MenteeHabitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mh, setMh] = useState<MenteeHabit | null>(null)
  const [steps, setSteps] = useState<MenteeHabitStep[]>([])
  const [logs, setLogs] = useState<MenteeHabitStepLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyStepId, setBusyStepId] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const today = todayISO()

  useEffect(() => {
    if (!id || !menteeProfile) { setLoading(false); return }
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const [mhRes, stepsRes, logsRes] = await Promise.all([
          supabaseRestGet<MenteeHabit>(
            'mentee_habits',
            `select=*&id=eq.${id}&mentee_id=eq.${menteeProfile!.id}`,
            { label: 'mentee:habit:header' },
          ),
          supabaseRestGet<MenteeHabitStep>(
            'mentee_habit_steps',
            `select=*&mentee_habit_id=eq.${id}&order=order_index.asc`,
            { label: 'mentee:habit:steps' },
          ),
          supabaseRestGet<MenteeHabitStepLog>(
            'mentee_habit_step_logs',
            `select=*&mentee_habit_id=eq.${id}`,
            { label: 'mentee:habit:logs' },
          ),
        ])
        if (mhRes.error) { setError(mhRes.error.message); return }
        if (!mhRes.data?.length) { setError('Habit assignment not found.'); return }
        setMh(mhRes.data[0])
        if (stepsRes.error) { setError(stepsRes.error.message); return }
        setSteps(stepsRes.data ?? [])
        if (logsRes.error) { setError(logsRes.error.message); return }
        setLogs(logsRes.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchRef.current = loadData
    loadData()
  }, [id, menteeProfile?.id])

  // Recompute denormalized fields on the mentee_habit row after a log change
  // and persist both successful_days_count and status if they moved.
  async function syncProgress(updatedLogs: MenteeHabitStepLog[]) {
    if (!mh) return
    const successCount = successfulDatesFromLogs(updatedLogs, steps.length).size
    const nextStatus = computeStatus(mh, successCount, today)
    const patch: Record<string, unknown> = {
      successful_days_count: successCount,
    }
    if (nextStatus !== mh.status) {
      patch.status = nextStatus
      if (nextStatus !== 'active') {
        patch.completed_at = new Date().toISOString()
      }
    }
    const { error: err } = await supabaseRestCall('mentee_habits', 'PATCH', patch, `id=eq.${mh.id}`)
    if (err) {
      // Non-fatal — the log already succeeded. Just log.
      console.warn('[MenteeHabitDetailPage] syncProgress failed:', err.message)
      return
    }
    setMh(prev => prev ? {
      ...prev,
      successful_days_count: successCount,
      status: nextStatus,
      completed_at: nextStatus !== 'active' ? new Date().toISOString() : prev.completed_at,
    } : prev)
  }

  async function toggleStep(step: MenteeHabitStep) {
    if (!mh || !menteeProfile) return
    if (mh.status !== 'active') { toast.error('This habit is no longer active.'); return }
    setBusyStepId(step.id)
    try {
      const existing = logs.find(l => l.mentee_habit_step_id === step.id && l.log_date === today)
      if (existing) {
        const { error: err } = await supabaseRestCall(
          'mentee_habit_step_logs',
          'DELETE',
          {},
          `id=eq.${existing.id}`,
        )
        if (err) { toast.error(err.message); return }
        const next = logs.filter(l => l.id !== existing.id)
        setLogs(next)
        await syncProgress(next)
      } else {
        const { data, error: err } = await supabaseRestCall('mentee_habit_step_logs', 'POST', {
          mentee_habit_id: mh.id,
          mentee_habit_step_id: step.id,
          organization_id: mh.organization_id,
          log_date: today,
        })
        if (err) { toast.error(err.message); return }
        if (!data?.length) return
        const newLog = data[0] as unknown as MenteeHabitStepLog
        const next = [...logs, newLog]
        setLogs(next)
        await syncProgress(next)
      }
    } finally {
      setBusyStepId(null)
    }
  }

  if (loading) return <Skeleton count={6} className="h-12 w-full" gap="gap-2" />
  if (error || !mh) {
    return (
      <div className="max-w-2xl">
        <button onClick={() => navigate('/my-habits')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          &larr; Back
        </button>
        <LoadingErrorState message={error ?? 'Habit not found.'} onRetry={() => fetchRef.current()} />
      </div>
    )
  }

  const successfulDates = successfulDatesFromLogs(logs, steps.length)
  const goal = mh.goal_successful_days_snapshot ?? mh.duration_days_snapshot ?? 0
  const pct = goal > 0 ? Math.min(100, Math.round((successfulDates.size / goal) * 100)) : 0

  // Today's checked-step ids
  const checkedToday = new Set(
    logs.filter(l => l.log_date === today).map(l => l.mentee_habit_step_id),
  )
  const allCheckedToday = steps.length > 0 && steps.every(s => checkedToday.has(s.id))

  // Build day grid from start_date to whichever is sooner of end_date or today (inclusive)
  const lastDay = mh.end_date && mh.end_date < today ? mh.end_date : today
  const totalDays = Math.max(1, diffDays(mh.start_date, lastDay) + 1)
  const gridDays: { date: string; successful: boolean; isFuture: boolean; isToday: boolean }[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = addDaysISO(mh.start_date, i)
    if (d > today) break
    gridDays.push({
      date: d,
      successful: successfulDates.has(d),
      isFuture: d > today,
      isToday: d === today,
    })
  }

  const isActive = mh.status === 'active'
  const statusColors: Record<string, string> = {
    active: 'bg-teal-50 text-teal-600',
    completed: 'bg-green-50 text-green-600',
    abandoned: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/my-habits')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{mh.name_snapshot}</h1>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${statusColors[mh.status]}`}>
          {mh.status}
        </span>
      </div>

      {mh.description_snapshot && (
        <p className="text-sm text-gray-500">{mh.description_snapshot}</p>
      )}

      {/* Progress summary */}
      <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400">Progress</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {successfulDates.size} successful day{successfulDates.size === 1 ? '' : 's'}
              {goal > 0 && ` of ${goal}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Duration</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {durationSummary({
                duration_mode: mh.duration_mode_snapshot,
                duration_days: mh.duration_days_snapshot,
                goal_successful_days: mh.goal_successful_days_snapshot,
              })}
            </p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${mh.status === 'completed' ? 'bg-green-400' : 'bg-teal-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
          <span>Started {formatDate(mh.start_date)}</span>
          {mh.end_date && <span>Ends {formatDate(mh.end_date)}</span>}
        </div>
      </div>

      {/* Today's checklist */}
      <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Today's check-in</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {allCheckedToday
                ? '🎉 Today is a successful day.'
                : 'Check off every step to mark today successful.'}
            </p>
          </div>
          <span className="text-xs text-gray-400">{formatDate(today)}</span>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-gray-400">This habit has no steps.</p>
        ) : (
          <ul className="space-y-2">
            {steps.map(step => {
              const checked = checkedToday.has(step.id)
              const isBusy = busyStepId === step.id
              return (
                <li
                  key={step.id}
                  className={`rounded border px-4 py-3 transition-colors ${
                    checked ? 'border-teal-300 bg-teal-50/40' : 'border-gray-200 bg-white'
                  } ${isActive ? '' : 'opacity-60'}`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!isActive || isBusy}
                      onChange={() => toggleStep(step)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${checked ? 'text-teal-700' : 'text-gray-900'}`}>
                        {step.title}
                      </p>
                      {step.instructions && (
                        <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{step.instructions}</p>
                      )}
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* History grid */}
      <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">History</h2>
        {gridDays.length === 0 ? (
          <p className="text-sm text-gray-400">History will appear as days go by.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {gridDays.map(d => (
              <div
                key={d.date}
                title={`${formatDate(d.date)}${d.successful ? ' — successful' : ''}`}
                className={`w-5 h-5 rounded-sm ${
                  d.successful
                    ? 'bg-teal-500'
                    : d.isToday
                      ? 'bg-gray-200 ring-1 ring-teal-400'
                      : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          Filled squares are successful days. Today is ringed.
        </p>
      </div>
    </div>
  )
}
