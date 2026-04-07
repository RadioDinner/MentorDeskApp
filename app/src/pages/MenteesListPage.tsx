import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Mentee } from '../types'

export default function MenteesListPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchMentees() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('mentees')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('first_name', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setMentees(data as Mentee[])
      setLoading(false)
    }

    fetchMentees()
  }, [profile])

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded-lg border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load mentees: {error}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Mentees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {mentees.length} {mentees.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <button
          onClick={() => navigate('/mentees/new')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
        >
          + Create Mentee Account
        </button>
      </div>

      {mentees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No mentees found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm divide-y divide-gray-100">
          {mentees.map(mentee => (
            <div key={mentee.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                  {mentee.first_name[0]}{mentee.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {mentee.first_name} {mentee.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/mentees/${mentee.id}/edit`)}
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
