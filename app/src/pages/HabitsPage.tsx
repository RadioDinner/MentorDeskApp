import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { durationSummary } from '../lib/habits'
import type { Habit } from '../types'

interface HabitWithStats extends Habit {
  step_count: number
  active_assignments: number
  completed_assignments: number
}

export default function HabitsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<HabitWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const habitsRes = await supabaseRestGet<Habit>(
          'habits',
          `select=*&organization_id=eq.${orgId}&order=created_at.desc`,
          { label: 'habits:list' },
        )
        if (habitsRes.error) { setError(habitsRes.error.message); return }
        const habits = habitsRes.data ?? []

        if (habits.length === 0) {
          setItems([])
          return
        }

        const habitIds = habits.map(h => h.id).join(',')
        const [stepsRes, mhRes] = await Promise.all([
          supabaseRestGet<{ habit_id: string }>(
            'habit_steps',
            `select=habit_id&habit_id=in.(${habitIds})`,
            { label: 'habits:steps' },
          ),
          supabaseRestGet<{ habit_id: string; status: string }>(
            'mentee_habits',
            `select=habit_id,status&habit_id=in.(${habitIds})`,
            { label: 'habits:assignments' },
          ),
        ])
        if (stepsRes.error) { setError(stepsRes.error.message); return }
        if (mhRes.error)    { setError(mhRes.error.message); return }

        const stepCounts: Record<string, number> = {}
        for (const s of stepsRes.data ?? []) stepCounts[s.habit_id] = (stepCounts[s.habit_id] || 0) + 1

        const activeCounts: Record<string, number> = {}
        const completedCounts: Record<string, number> = {}
        for (const mh of mhRes.data ?? []) {
          if (mh.status === 'active') activeCounts[mh.habit_id] = (activeCounts[mh.habit_id] || 0) + 1
          else if (mh.status === 'completed') completedCounts[mh.habit_id] = (completedCounts[mh.habit_id] || 0) + 1
        }

        setItems(habits.map(h => ({
          ...h,
          step_count: stepCounts[h.id] ?? 0,
          active_assignments: activeCounts[h.id] ?? 0,
          completed_assignments: completedCounts[h.id] ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[HabitsPage] loadAll error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id])

  const visibleItems = items.filter(h => showRetired ? true : h.is_active)
  const canCreate = profile?.role === 'admin' || profile?.role === 'course_creator'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Habits</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {visibleItems.length} habit{visibleItems.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={e => setShowRetired(e.target.checked)}
              className="rounded"
            />
            Show retired
          </label>
          {canCreate && (
            <Button onClick={() => navigate('/habits/new')}>+ Create Habit</Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton count={6} className="h-16 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : visibleItems.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No habits yet.</p>
          <p className="text-xs text-gray-400 mt-1">Create a habit to build out a daily check-in routine for your mentees.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {visibleItems.map(h => (
            <HabitRow key={h.id} habit={h} onOpen={() => navigate(`/habits/${h.id}/edit`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function HabitRow({ habit, onOpen }: { habit: HabitWithStats; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold shrink-0">
        {habit.name[0]?.toUpperCase() ?? 'H'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{habit.name}</p>
          {!habit.is_active && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Retired
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {habit.step_count} step{habit.step_count !== 1 ? 's' : ''} · {durationSummary(habit)}
          {habit.description ? ` · ${habit.description}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs tabular-nums">
          <span className="font-semibold text-teal-600">{habit.active_assignments}</span>{' '}
          <span className="text-gray-400">active</span>
        </span>
        <span className="text-xs tabular-nums">
          <span className="font-semibold text-green-600">{habit.completed_assignments}</span>{' '}
          <span className="text-gray-400">done</span>
        </span>
      </div>
    </button>
  )
}
