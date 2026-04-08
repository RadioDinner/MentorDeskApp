import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Offering } from '../types'

export default function EngagementsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[EngagementsPage] No profile.organization_id — profile:', profile); setLoading(false); return }
    async function fetch() {
      setLoading(true)
      try {
        const { data, error: e } = await supabase
          .from('offerings')
          .select('*')
          .eq('organization_id', profile!.organization_id)
          .eq('type', 'engagement')
          .order('name', { ascending: true })
        if (e) { setError(e.message); return }
        setItems(data as Offering[])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [profile?.organization_id])

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Engagements</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} engagement{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => navigate('/engagements/new')}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
        >
          + Create Engagement
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load engagements: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No engagements found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
                )}
              </div>
              <button
                onClick={() => navigate(`/engagements/${item.id}/edit`)}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
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
