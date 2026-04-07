import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { StaffMember, StaffRole } from '../types'

interface PeopleListPageProps {
  title: string
  roles: StaffRole[]
  createLabel: string
  createRoute: string
}

export default function PeopleListPage({ title, roles, createLabel, createRoute }: PeopleListPageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [people, setPeople] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchPeople() {
      setLoading(true)
      setError(null)

      // No roles means this module doesn't have a data source yet
      if (roles.length === 0) {
        setPeople([])
        setLoading(false)
        return
      }

      let query = supabase
        .from('staff')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('first_name', { ascending: true })

      if (roles.length === 1) {
        query = query.eq('role', roles[0])
      } else {
        query = query.in('role', roles)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setPeople(data as StaffMember[])
      setLoading(false)
    }

    fetchPeople()
  }, [profile, roles])

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load {title.toLowerCase()}: {error}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <button
          onClick={() => navigate(createRoute)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
        >
          + {createLabel}
        </button>
      </div>

      {people.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No {title.toLowerCase()} found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm divide-y divide-gray-100">
          {people.map(person => (
            <div key={person.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                  {person.first_name[0]}{person.last_name[0]}
                </div>

                {/* Name + email */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {person.first_name} {person.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{person.email}</p>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => navigate(`/people/${person.id}/edit`)}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
