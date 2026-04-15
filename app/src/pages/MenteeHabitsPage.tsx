import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import { Skeleton } from '../components/ui'
import { durationSummary } from '../lib/habits'
import { formatDate } from '../lib/format'
import type { MenteeHabit } from '../types'

export default function MenteeHabitsPage() {
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [habits, setHabits] = useState<MenteeHabit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }
    const menteeId = menteeProfile.id

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const res = await supabaseRestGet<MenteeHabit>(
          'mentee_habits',
          `select=*&mentee_id=eq.${menteeId}&order=assigned_at.desc`,
          { label: 'mentee:habits' },
        )
        if (res.error) { setError(res.error.message); return }
        setHabits(res.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadData
    loadData()
  }, [menteeProfile?.id])

  if (loading) return <Skeleton count={5} className="h-20 w-full" gap="gap-3" />
  if (error) return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />

  const active = habits.filter(h => h.status === 'active')
  const past = habits.filter(h => h.status !== 'active')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Habits</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {active.length} active habit{active.length !== 1 ? 's' : ''}
        </p>
      </div>

      {habits.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No habits assigned yet.</p>
          <p className="text-xs text-gray-400 mt-1">Habits will appear here when your organization assigns them to you.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.map(h => <HabitRow key={h.id} habit={h} onOpen={() => navigate(`/my-habits/${h.id}`)} />)}
          {past.length > 0 && active.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Past</p>
            </div>
          )}
          {past.map(h => <HabitRow key={h.id} habit={h} onOpen={() => navigate(`/my-habits/${h.id}`)} />)}
        </div>
      )}
    </div>
  )
}

function HabitRow({ habit, onOpen }: { habit: MenteeHabit; onOpen: () => void }) {
  const goal = habit.goal_successful_days_snapshot ?? habit.duration_days_snapshot ?? 0
  const pct = goal > 0 ? Math.min(100, Math.round((habit.successful_days_count / goal) * 100)) : 0
  const isActive = habit.status === 'active'

  const statusColors: Record<string, string> = {
    active: 'bg-teal-50 text-teal-600',
    completed: 'bg-green-50 text-green-600',
    abandoned: 'bg-gray-100 text-gray-500',
  }

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left bg-white rounded-md border border-gray-200/80 px-5 py-4 hover:border-brand/40 hover:shadow-sm transition-all group ${!isActive ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900 group-hover:text-brand transition-colors">
          {habit.name_snapshot}
        </p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${statusColors[habit.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {habit.status}
        </span>
      </div>

      {habit.description_snapshot && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{habit.description_snapshot}</p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${habit.status === 'completed' ? 'bg-green-400' : 'bg-teal-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-gray-700 tabular-nums">{pct}%</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {habit.successful_days_count}/{goal || '?'} days
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
        <span>{durationSummary({
          duration_mode: habit.duration_mode_snapshot,
          duration_days: habit.duration_days_snapshot,
          goal_successful_days: habit.goal_successful_days_snapshot,
        })}</span>
        <span>Started {formatDate(habit.start_date)}</span>
      </div>
    </button>
  )
}
