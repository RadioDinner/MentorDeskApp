import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Offering, MenteeOffering } from '../types'

interface MenteeCourse extends MenteeOffering {
  offering?: Offering
  lesson_count: number
  completed_lessons: number
}

export default function MenteeCoursesPage() {
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<MenteeCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }

    async function fetchData() {
      setLoading(true)
      try {
        // Get all mentee_offerings for this mentee that are courses
        const { data: moData } = await supabase
          .from('mentee_offerings')
          .select('*, offering:offerings(*)')
          .eq('mentee_id', menteeProfile!.id)
          .in('status', ['active', 'completed'])
          .order('assigned_at', { ascending: false })

        const menteeOfferings = (moData ?? []) as (MenteeOffering & { offering: Offering })[]
        const courseOfferings = menteeOfferings.filter(mo => mo.offering?.type === 'course')

        if (courseOfferings.length === 0) { setCourses([]); return }

        // Get lesson counts for each course offering
        const offeringIds = courseOfferings.map(mo => mo.offering_id)
        const { data: lessonsData } = await supabase
          .from('lessons')
          .select('offering_id')
          .in('offering_id', offeringIds)

        const lessonCounts: Record<string, number> = {}
        if (lessonsData) {
          for (const l of lessonsData) {
            lessonCounts[l.offering_id] = (lessonCounts[l.offering_id] || 0) + 1
          }
        }

        // Get completed lesson counts from lesson_progress
        const moIds = courseOfferings.map(mo => mo.id)
        const { data: progressData } = await supabase
          .from('lesson_progress')
          .select('mentee_offering_id')
          .in('mentee_offering_id', moIds)
          .eq('status', 'completed')

        const completedCounts: Record<string, number> = {}
        if (progressData) {
          for (const p of progressData) {
            completedCounts[p.mentee_offering_id] = (completedCounts[p.mentee_offering_id] || 0) + 1
          }
        }

        setCourses(courseOfferings.map(mo => ({
          ...mo,
          lesson_count: lessonCounts[mo.offering_id] ?? 0,
          completed_lessons: completedCounts[mo.id] ?? 0,
        })))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [menteeProfile?.id])

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  const activeCourses = courses.filter(c => c.status === 'active')
  const completedCourses = courses.filter(c => c.status === 'completed')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Courses</h1>
        <p className="text-sm text-gray-500 mt-0.5">{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No courses assigned yet.</p>
          <p className="text-xs text-gray-400 mt-1">Courses will appear here when your organization assigns them to you.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeCourses.map(c => <CourseRow key={c.id} course={c} onOpen={() => navigate(`/my-courses/${c.id}`)} />)}
          {completedCourses.length > 0 && activeCourses.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Completed</p>
            </div>
          )}
          {completedCourses.map(c => <CourseRow key={c.id} course={c} onOpen={() => navigate(`/my-courses/${c.id}`)} />)}
        </div>
      )}
    </div>
  )
}

function CourseRow({ course, onOpen }: { course: MenteeCourse; onOpen: () => void }) {
  const offering = course.offering
  const total = course.lesson_count
  const completed = course.completed_lessons
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isCompleted = course.status === 'completed'

  const statusColors: Record<string, string> = {
    active: 'bg-green-50 text-green-600',
    completed: 'bg-blue-50 text-blue-600',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left bg-white rounded-md border border-gray-200/80 px-5 py-4 hover:border-brand/40 hover:shadow-sm transition-all group ${isCompleted ? 'opacity-75' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900 group-hover:text-brand transition-colors">
          {offering?.name ?? 'Course'}
        </p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${statusColors[course.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {course.status}
        </span>
      </div>

      {offering?.description && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{offering.description}</p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : 'bg-brand'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-gray-700 tabular-nums">{pct}%</span>
          <span className="text-xs text-gray-400 tabular-nums">{completed}/{total} lessons</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
        {course.assigned_at && <span>Assigned {new Date(course.assigned_at).toLocaleDateString()}</span>}
        {offering?.expected_completion_days && <span>{offering.expected_completion_days}d expected</span>}
      </div>
    </button>
  )
}
