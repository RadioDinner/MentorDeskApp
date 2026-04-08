import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Offering } from '../types'

interface MenteePairing {
  id: string
  status: string
  started_at: string
  offering_id: string | null
  mentor: { first_name: string; last_name: string } | null
  offering: Offering | null
}

export default function MenteeEngagementsPage() {
  const { menteeProfile } = useAuth()
  const [pairings, setPairings] = useState<MenteePairing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }

    async function fetchData() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('pairings')
          .select(`id, status, started_at, offering_id, mentor:staff!pairings_mentor_id_fkey ( first_name, last_name )`)
          .eq('mentee_id', menteeProfile!.id)
          .order('started_at', { ascending: false })

        if (data) {
          const offeringIds = data.map(p => p.offering_id).filter(Boolean) as string[]
          let offeringsMap: Record<string, Offering> = {}
          if (offeringIds.length > 0) {
            const { data: offerings } = await supabase.from('offerings').select('*').in('id', offeringIds)
            if (offerings) offeringsMap = Object.fromEntries(offerings.map(o => [o.id, o as Offering]))
          }

          setPairings(data.map(p => ({
            id: p.id,
            status: p.status,
            started_at: p.started_at,
            offering_id: p.offering_id,
            mentor: p.mentor as unknown as { first_name: string; last_name: string } | null,
            offering: p.offering_id ? offeringsMap[p.offering_id] ?? null : null,
          })))
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

  const active = pairings.filter(p => p.status === 'active' || p.status === 'paused')
  const ended = pairings.filter(p => p.status === 'ended')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Engagements</h1>
        <p className="text-sm text-gray-500 mt-0.5">{active.length} active{ended.length > 0 ? `, ${ended.length} completed` : ''}</p>
      </div>

      {active.length === 0 && ended.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No engagements yet.</p>
          <p className="text-xs text-gray-400 mt-1">Your organization will assign courses and engagements to you.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active</h3>
              <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
                {active.map(p => (
                  <PairingRow key={p.id} pairing={p} />
                ))}
              </div>
            </div>
          )}

          {ended.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Completed</h3>
              <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
                {ended.map(p => (
                  <PairingRow key={p.id} pairing={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PairingRow({ pairing }: { pairing: MenteePairing }) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-50 text-green-600',
    paused: 'bg-amber-50 text-amber-600',
    ended: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {pairing.offering ? pairing.offering.name : 'General Mentoring'}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-gray-500">
              Mentor: {pairing.mentor ? `${pairing.mentor.first_name} ${pairing.mentor.last_name}` : 'Unassigned'}
            </p>
            {pairing.offering?.type && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {pairing.offering.type === 'course' ? 'Course' : 'Engagement'}
              </span>
            )}
            <p className="text-[10px] text-gray-400">
              Started {new Date(pairing.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${statusColors[pairing.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {pairing.status}
        </span>
      </div>
    </div>
  )
}
