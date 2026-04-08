import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Offering } from '../types'

interface MenteeCourse {
  id: string
  status: string
  started_at: string
  offering: Offering | null
  mentor: { first_name: string; last_name: string } | null
}

export default function MenteeCoursesPage() {
  const { menteeProfile } = useAuth()
  const [courses, setCourses] = useState<MenteeCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }

    async function fetchData() {
      setLoading(true)
      try {
        // Get all pairings for this mentee that have an offering_id
        const { data } = await supabase
          .from('pairings')
          .select(`id, status, started_at, offering_id, mentor:staff!pairings_mentor_id_fkey ( first_name, last_name )`)
          .eq('mentee_id', menteeProfile!.id)
          .not('offering_id', 'is', null)
          .order('started_at', { ascending: false })

        if (data) {
          const offeringIds = data.map(p => p.offering_id).filter(Boolean) as string[]
          let offeringsMap: Record<string, Offering> = {}
          if (offeringIds.length > 0) {
            const { data: offerings } = await supabase
              .from('offerings')
              .select('*')
              .in('id', offeringIds)
              .eq('type', 'course')
            if (offerings) offeringsMap = Object.fromEntries(offerings.map(o => [o.id, o as Offering]))
          }

          // Only show pairings that map to a course-type offering
          setCourses(
            data
              .filter(p => p.offering_id && offeringsMap[p.offering_id])
              .map(p => ({
                id: p.id,
                status: p.status,
                started_at: p.started_at,
                offering: offeringsMap[p.offering_id!] ?? null,
                mentor: p.mentor as unknown as { first_name: string; last_name: string } | null,
              }))
          )
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [menteeProfile?.id])

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

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
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {courses.map(c => {
            const statusColors: Record<string, string> = {
              active: 'bg-green-50 text-green-600',
              paused: 'bg-amber-50 text-amber-600',
              ended: 'bg-gray-100 text-gray-500',
            }
            return (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.offering?.name ?? 'Course'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-500">
                        Mentor: {c.mentor ? `${c.mentor.first_name} ${c.mentor.last_name}` : 'Unassigned'}
                      </p>
                      {c.offering?.lesson_count && (
                        <p className="text-xs text-gray-400">{c.offering.lesson_count} lessons</p>
                      )}
                    </div>
                    {c.offering?.description && (
                      <p className="text-xs text-gray-400 mt-1">{c.offering.description}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${statusColors[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {c.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
