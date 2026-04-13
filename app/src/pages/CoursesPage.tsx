import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import OfferingFolderManager from '../components/OfferingFolderManager'
import LoadingErrorState from '../components/LoadingErrorState'
import type { Offering, OfferingFolder } from '../types'
import Button from '../components/ui/Button'

type ViewMode = 'list' | 'grid'

interface CourseWithStats extends Offering {
  actual_lesson_count: number
  active_mentees: number
  completed_mentees: number
}

export default function CoursesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<CourseWithStats[]>([])
  const [folders, setFolders] = useState<OfferingFolder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('mentordesk_courses_view') as ViewMode) || 'grid'
  )

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
        // Raw REST reads — bypass the SDK to avoid auth-lock / stale-conn hangs.
        const [offeringsRes, foldersRes] = await Promise.all([
          supabaseRestGet<Offering>(
            'offerings',
            `select=*&organization_id=eq.${orgId}&type=eq.course&order=name.asc`,
            { label: 'courses:offerings' },
          ),
          supabaseRestGet<OfferingFolder>(
            'offering_folders',
            `select=*&organization_id=eq.${orgId}&folder_type=eq.course&order=order_index.asc`,
            { label: 'courses:folders' },
          ),
        ])
        if (offeringsRes.error) { setError(offeringsRes.error.message); return }
        setFolders(foldersRes.data ?? [])

        const courses = offeringsRes.data ?? []
        const courseIds = courses.map(c => c.id)

        let lessonsData: { offering_id: string }[] = []
        let moData: { offering_id: string; status: string }[] = []
        if (courseIds.length > 0) {
          const idList = courseIds.join(',')
          const [lessonsRes, moRes] = await Promise.all([
            supabaseRestGet<{ offering_id: string }>(
              'lessons',
              `select=offering_id&offering_id=in.(${idList})`,
              { label: 'courses:lessons' },
            ),
            supabaseRestGet<{ offering_id: string; status: string }>(
              'mentee_offerings',
              `select=offering_id,status&offering_id=in.(${idList})&status=in.(active,completed)`,
              { label: 'courses:counts' },
            ),
          ])
          if (lessonsRes.error) { setError(lessonsRes.error.message); return }
          if (moRes.error) { setError(moRes.error.message); return }
          lessonsData = lessonsRes.data ?? []
          moData = moRes.data ?? []
        }

        const lessonCounts: Record<string, number> = {}
        for (const l of lessonsData) lessonCounts[l.offering_id] = (lessonCounts[l.offering_id] || 0) + 1

        const activeCounts: Record<string, number> = {}
        const completedCounts: Record<string, number> = {}
        for (const mo of moData) {
          if (mo.status === 'active') activeCounts[mo.offering_id] = (activeCounts[mo.offering_id] || 0) + 1
          else if (mo.status === 'completed') completedCounts[mo.offering_id] = (completedCounts[mo.offering_id] || 0) + 1
        }

        setItems(courses.map(c => ({
          ...c,
          actual_lesson_count: lessonCounts[c.id] ?? 0,
          active_mentees: activeCounts[c.id] ?? 0,
          completed_mentees: completedCounts[c.id] ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[CoursesPage] loadAll error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id])

  function toggleView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('mentordesk_courses_view', mode)
  }

  async function moveOfferingToFolder(offeringId: string, folderId: string | null) {
    await supabase.from('offerings').update({ folder_id: folderId }).eq('id', offeringId)
    setItems(prev => prev.map(c => c.id === offeringId ? { ...c, folder_id: folderId } : c))
  }

  const visibleItems = items.filter(c => (c.folder_id ?? null) === currentFolderId)

  function getPrice(course: Offering): string {
    if (course.billing_mode === 'recurring' && course.recurring_price_cents > 0) {
      return `$${(course.recurring_price_cents / 100).toFixed(2)}/mo`
    }
    if (course.price_cents > 0) {
      return `$${(course.price_cents / 100).toFixed(2)}`
    }
    return 'Free'
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} course{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded overflow-hidden">
            <button
              onClick={() => toggleView('list')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => toggleView('grid')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
          </div>
          <Button onClick={() => navigate('/courses/new')}>+ Create Course</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : (
        <>
          {profile?.organization_id && (
            <OfferingFolderManager
              folders={folders} setFolders={setFolders}
              currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId}
              folderType="course" orgId={profile.organization_id}
              onMoveOffering={moveOfferingToFolder}
            />
          )}

          {visibleItems.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
              <p className="text-sm text-gray-500">{currentFolderId ? 'This folder is empty.' : 'No courses found.'}</p>
              <p className="text-xs text-gray-400 mt-1">{currentFolderId ? 'Drag courses into this folder.' : 'Create your first course to get started.'}</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {visibleItems.map(course => (
                <div key={course.id} draggable onDragStart={e => e.dataTransfer.setData('offering-id', course.id)}>
                  <CourseGridCard course={course} price={getPrice(course)} navigate={navigate} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {visibleItems.map(course => (
                <div key={course.id} draggable onDragStart={e => e.dataTransfer.setData('offering-id', course.id)}>
                  <CourseListRow course={course} price={getPrice(course)} navigate={navigate} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Icon Component ──

function CourseIcon({ course, size = 'md' }: { course: CourseWithStats; size?: 'sm' | 'md' }) {
  const dims = size === 'md' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm'

  if (course.icon_url) {
    // Check if it's an emoji (1-2 chars or emoji pattern) vs a URL
    const isEmoji = course.icon_url.length <= 4 && !/^https?:\/\//.test(course.icon_url)
    if (isEmoji) {
      return (
        <div className={`${dims} rounded-lg bg-brand-light flex items-center justify-center shrink-0`}>
          <span>{course.icon_url}</span>
        </div>
      )
    }
    return (
      <img
        src={course.icon_url}
        alt=""
        className={`${dims} rounded-lg object-cover shrink-0`}
      />
    )
  }

  // Default: letter icon
  return (
    <div className={`${dims} rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0`}>
      {course.name[0]?.toUpperCase() ?? 'C'}
    </div>
  )
}

// ── Lesson Progress Bar ──

function LessonProgress({ created, target, compact = false }: { created: number; target: number | null; compact?: boolean }) {
  if (!target || target === 0) {
    return <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400`}>{created} lesson{created !== 1 ? 's' : ''}</span>
  }

  const pct = Math.min(Math.round((created / target) * 100), 100)
  const isComplete = created >= target
  const barColor = isComplete ? 'bg-green-400' : pct >= 50 ? 'bg-brand' : 'bg-amber-400'

  return (
    <div className={compact ? '' : 'w-full'}>
      <div className="flex items-center justify-between mb-0.5">
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-500`}>
          {created}/{target} lessons built
        </span>
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-medium tabular-nums ${isComplete ? 'text-green-600' : 'text-gray-600'}`}>
          {pct}%
        </span>
      </div>
      <div className={`${compact ? 'h-1' : 'h-1.5'} bg-gray-100 rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Grid Card ──

function CourseGridCard({ course, price, navigate }: { course: CourseWithStats; price: string; navigate: (path: string) => void }) {
  const totalEnrolled = course.active_mentees + course.completed_mentees
  const completionRate = totalEnrolled > 0 ? Math.round((course.completed_mentees / totalEnrolled) * 100) : 0

  return (
    <div
      className="bg-white rounded-lg border border-gray-200/80 overflow-hidden hover:border-brand/40 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => navigate(`/courses/${course.id}/builder`)}
    >
      <div className="px-5 pt-5 pb-4">
        {/* Header */}
        <div className="flex items-start gap-3.5 mb-3">
          <CourseIcon course={course} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900 group-hover:text-brand transition-colors truncate">
              {course.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {course.lesson_count ? `${course.lesson_count} lessons` : 'No lesson target'}
              {' · '}{price}
            </p>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${
            course.billing_mode === 'recurring' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {course.billing_mode === 'recurring' ? 'Recurring' : 'One-time'}
          </span>
        </div>

        {course.description && (
          <p className="text-xs text-gray-400 line-clamp-2 mb-4">{course.description}</p>
        )}

        {/* Enrollment stats */}
        <div className="flex items-stretch gap-3 mb-4">
          <div className="flex-1 rounded-lg bg-brand-light/60 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-brand tabular-nums">{course.active_mentees}</p>
            <p className="text-[10px] text-brand/70 font-medium mt-0.5">In progress</p>
          </div>
          <div className="flex-1 rounded-lg bg-green-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-green-600 tabular-nums">{course.completed_mentees}</p>
            <p className="text-[10px] text-green-600/70 font-medium mt-0.5">Completed</p>
          </div>
          <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-gray-700 tabular-nums">{totalEnrolled}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Total</p>
          </div>
        </div>

        {/* Completion rate bar */}
        {totalEnrolled > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">Completion rate</span>
              <span className="text-[10px] font-semibold text-gray-600 tabular-nums">{completionRate}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        )}

        {/* Lesson build progress */}
        <LessonProgress created={course.actual_lesson_count} target={course.lesson_count} />
      </div>

      {/* Actions footer */}
      <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm"
          onClick={e => { e.stopPropagation(); navigate(`/courses/${course.id}/edit`) }}>
          Settings
        </Button>
        <Button size="sm"
          onClick={e => { e.stopPropagation(); navigate(`/courses/${course.id}/builder`) }}>
          Builder
        </Button>
      </div>
    </div>
  )
}

// ── List Row ──

function CourseListRow({ course, price, navigate }: { course: CourseWithStats; price: string; navigate: (path: string) => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
      <CourseIcon course={course} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{course.name}</p>
          <span className="text-xs text-gray-400 shrink-0">{price}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {course.lesson_count ? `${course.lesson_count} lessons` : 'No lesson target'}
        </p>
      </div>

      {/* Enrollment counts */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs tabular-nums"><span className="font-semibold text-brand">{course.active_mentees}</span> <span className="text-gray-400">active</span></span>
        <span className="text-xs tabular-nums"><span className="font-semibold text-green-600">{course.completed_mentees}</span> <span className="text-gray-400">done</span></span>
      </div>

      {/* Lesson progress */}
      <div className="w-36 shrink-0">
        <LessonProgress created={course.actual_lesson_count} target={course.lesson_count} compact />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={() => navigate(`/courses/${course.id}/builder`)}>Builder</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/courses/${course.id}/edit`)}>Settings</Button>
      </div>
    </div>
  )
}
