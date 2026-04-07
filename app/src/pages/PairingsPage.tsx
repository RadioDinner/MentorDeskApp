import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { PairingStatus } from '../types'

interface PairingRow {
  id: string
  status: PairingStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  mentor: { id: string; first_name: string; last_name: string }
  mentee: { id: string; first_name: string; last_name: string; email: string }
}

const STATUS_STYLES: Record<PairingStatus, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-yellow-50 text-yellow-700',
  ended: 'bg-gray-100 text-gray-500',
}

export default function PairingsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [pairings, setPairings] = useState<PairingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchPairings() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('assignments')
        .select(`
          id, status, started_at, ended_at, notes,
          mentor:staff!assignments_mentor_id_fkey ( id, first_name, last_name ),
          mentee:mentees!assignments_mentee_id_fkey ( id, first_name, last_name, email )
        `)
        .eq('organization_id', profile!.organization_id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setPairings(data as unknown as PairingRow[])
      setLoading(false)
    }

    fetchPairings()
  }, [profile])

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load pairings: {error}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Assignments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pairings.length} {pairings.length === 1 ? 'pairing' : 'pairings'}
          </p>
        </div>
        <button
          onClick={() => navigate('/pairings/new')}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
        >
          + Pair Mentee
        </button>
      </div>

      {pairings.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80  px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No pairings yet. Assign a mentee to a mentor to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80  divide-y divide-gray-100">
          {pairings.map(a => (
            <div key={a.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-5 min-w-0">
                {/* Mentor */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-600 shrink-0">
                    {a.mentor.first_name[0]}{a.mentor.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {a.mentor.first_name} {a.mentor.last_name}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Mentor</p>
                  </div>
                </div>

                {/* Arrow */}
                <span className="text-gray-300 shrink-0">&rarr;</span>

                {/* Mentee */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-xs font-semibold text-green-600 shrink-0">
                    {a.mentee.first_name[0]}{a.mentee.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {a.mentee.first_name} {a.mentee.last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{a.mentee.email}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[a.status]}`}>
                  {a.status}
                </span>
                <button
                  onClick={() => navigate(`/pairings/${a.id}/edit`)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
