import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet, supabaseRestCall } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import FolderManager from '../components/FolderManager'
import ListGridToggle from '../components/ListGridToggle'
import { durationSummary } from '../lib/habits'
import type { Habit, HabitFolder, ViewMode } from '../types'

interface HabitWithStats extends Habit {
  step_count: number
  active_assignments: number
  completed_assignments: number
}

const VIEW_STORAGE_KEY = 'mentordesk_habits_view'

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'list' || v === 'grid' ? v : 'grid'
}

export default function HabitsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<HabitWithStats[]>([])
  const [folders, setFolders] = useState<HabitFolder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [view, setView] = useState<ViewMode>(readStoredView)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  function changeView(next: ViewMode) {
    setView(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    }
  }

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [habitsRes, foldersRes] = await Promise.all([
          supabaseRestGet<Habit>(
            'habits',
            `select=*&organization_id=eq.${orgId}&order=created_at.desc&limit=1000`,
            { label: 'habits:list' },
          ),
          supabaseRestGet<HabitFolder>(
            'habit_folders',
            `select=*&organization_id=eq.${orgId}&order=order_index.asc`,
            { label: 'habits:folders' },
          ),
        ])
        if (habitsRes.error) { setError(habitsRes.error.message); return }
        if (foldersRes.error) { setError(foldersRes.error.message); return }
        const habits = habitsRes.data ?? []
        setFolders(foldersRes.data ?? [])

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
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id])

  async function moveHabitToFolder(habitId: string, folderId: string | null) {
    // Optimistic local update first, then persist. If the server rejects
    // (shouldn't happen — RLS was broadened in migration 952), we'll just
    // have a stale client state until next refetch; toast surfacing can
    // be added later if needed.
    setItems(prev => prev.map(h => h.id === habitId ? { ...h, folder_id: folderId } : h))
    await supabaseRestCall(
      'habits',
      'PATCH',
      { folder_id: folderId },
      `id=eq.${habitId}`,
    )
  }

  const visibleItems = items
    .filter(h => showRetired ? true : h.is_active)
    .filter(h => (h.folder_id ?? null) === currentFolderId)
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
          <ListGridToggle value={view} onChange={changeView} />
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

      {profile?.organization_id && (
        <FolderManager<HabitFolder>
          folders={folders}
          setFolders={setFolders}
          currentFolderId={currentFolderId}
          setCurrentFolderId={setCurrentFolderId}
          orgId={profile.organization_id}
          folderTable="habit_folders"
          itemTable="habits"
          dragKey="habit-id"
          rootLabel="All Habits"
          onMoveItem={moveHabitToFolder}
        />
      )}

      {loading ? (
        <Skeleton count={6} className="h-16 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : visibleItems.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No habits yet.</p>
          <p className="text-xs text-gray-400 mt-1">Create a habit to build out a daily check-in routine for your mentees.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleItems.map(h => (
            <HabitGridCard key={h.id} habit={h} onOpen={() => navigate(`/habits/${h.id}/edit`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {visibleItems.map(h => (
            <HabitListRow key={h.id} habit={h} onOpen={() => navigate(`/habits/${h.id}/edit`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function HabitListRow({ habit, onOpen }: { habit: HabitWithStats; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('habit-id', habit.id)}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
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
    </div>
  )
}

function HabitGridCard({ habit, onOpen }: { habit: HabitWithStats; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('habit-id', habit.id)}
      onClick={onOpen}
      className="group bg-white rounded-md border border-gray-200/80 px-5 py-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {habit.name[0]?.toUpperCase() ?? 'H'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand transition-colors">
              {habit.name}
            </h3>
            {!habit.is_active && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                Retired
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{durationSummary(habit)}</p>
          {habit.description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{habit.description}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatBox label="Steps" value={habit.step_count} tone="slate" />
        <StatBox label="Active" value={habit.active_assignments} tone="teal" />
        <StatBox label="Done" value={habit.completed_assignments} tone="green" />
      </div>
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'teal' | 'green' }) {
  const toneClasses = {
    slate: 'bg-slate-50 text-slate-700',
    teal:  'bg-teal-50 text-teal-700',
    green: 'bg-green-50 text-green-700',
  }[tone]
  return (
    <div className={`rounded px-2 py-1.5 text-center ${toneClasses}`}>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  )
}
