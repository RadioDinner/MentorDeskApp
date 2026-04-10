import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import type { Offering } from '../types'

type ViewMode = 'list' | 'grid'

interface CourseWithLessons extends Offering {
  actual_lesson_count: number
}

export default function CoursesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<CourseWithLessons[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('mentordesk_courses_view') as ViewMode) || 'grid'
  )

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    async function fetchData() {
      setLoading(true)
      try {
        const { data, error: e } = await supabase
          .from('offerings')
          .select('*')
          .eq('organization_id', profile!.organization_id)
          .eq('type', 'course')
          .order('name', { ascending: true })
        if (e) { setError(e.message); return }

        const courses = (data ?? []) as Offering[]

        // Fetch actual lesson counts per course
        const courseIds = courses.map(c => c.id)
        let lessonCounts: Record<string, number> = {}
        if (courseIds.length > 0) {
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('offering_id')
            .in('offering_id', courseIds)

          if (lessonsData) {
            for (const l of lessonsData) {
              lessonCounts[l.offering_id] = (lessonCounts[l.offering_id] || 0) + 1
            }
          }
        }

        setItems(courses.map(c => ({
          ...c,
          actual_lesson_count: lessonCounts[c.id] ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [profile?.organization_id])

  function toggleView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('mentordesk_courses_view', mode)
  }

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
          <button
            onClick={() => navigate('/courses/new')}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + Create Course
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load courses: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No courses found.</p>
          <p className="text-xs text-gray-400 mt-1">Create your first course to get started.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(course => (
            <CourseGridCard key={course.id} course={course} price={getPrice(course)} navigate={navigate} />
          ))}
        </div>
      ) : (
        /* ── List View ── */
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {items.map(course => (
            <CourseListRow key={course.id} course={course} price={getPrice(course)} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Icon Component ──

function CourseIcon({ course, size = 'md' }: { course: CourseWithLessons; size?: 'sm' | 'md' }) {
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

function CourseGridCard({ course, price, navigate }: { course: CourseWithLessons; price: string; navigate: (path: string) => void }) {
  return (
    <div
      className="bg-white rounded-lg border border-gray-200/80 overflow-hidden hover:border-brand/40 hover:shadow-sm transition-all cursor-pointer group"
      onClick={() => navigate(`/courses/${course.id}/builder`)}
    >
      {/* Top section */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3 mb-3">
          <CourseIcon course={course} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-brand transition-colors truncate">
              {course.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {course.lesson_count ? `${course.lesson_count} lessons` : 'No lesson target'}
              {' · '}{price}
            </p>
          </div>
        </div>

        {course.description && (
          <p className="text-[11px] text-gray-400 line-clamp-2 mb-3">{course.description}</p>
        )}

        {/* Lesson build progress */}
        <LessonProgress created={course.actual_lesson_count} target={course.lesson_count} />
      </div>

      {/* Actions footer */}
      <div className="px-4 py-2.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          course.billing_mode === 'recurring' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
        }`}>
          {course.billing_mode === 'recurring' ? 'Recurring' : 'One-time'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); navigate(`/courses/${course.id}/edit`) }}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
          >
            Settings
          </button>
          <button
            onClick={e => { e.stopPropagation(); navigate(`/courses/${course.id}/builder`) }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-md hover:bg-brand-hover transition-colors"
          >
            Builder
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List Row ──

function CourseListRow({ course, price, navigate }: { course: CourseWithLessons; price: string; navigate: (path: string) => void }) {
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

      {/* Lesson progress */}
      <div className="w-36 shrink-0">
        <LessonProgress created={course.actual_lesson_count} target={course.lesson_count} compact />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate(`/courses/${course.id}/builder`)}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition-colors"
        >
          Builder
        </button>
        <button
          onClick={() => navigate(`/courses/${course.id}/edit`)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
        >
          Settings
        </button>
      </div>
    </div>
  )
}
