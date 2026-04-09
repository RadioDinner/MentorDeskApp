import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import type { Offering, OfferingType } from '../types'

const TABS: { label: string; value: OfferingType }[] = [
  { label: 'Courses', value: 'course' },
  { label: 'Engagements', value: 'engagement' },
]

export default function OfferingsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get('tab') as OfferingType) || 'course'
  const [items, setItems] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[OfferingsPage] No profile.organization_id — profile:', profile); setLoading(false); return }

    async function fetchOfferings() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('offerings')
          .select('*')
          .eq('organization_id', profile!.organization_id)
          .eq('type', activeTab)
          .order('name', { ascending: true })

        if (fetchError) { setError(fetchError.message); return }
        setItems(data as Offering[])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchOfferings()
  }, [profile?.organization_id, activeTab])

  function switchTab(tab: OfferingType) {
    setSearchParams({ tab })
  }

  const tabLabel = activeTab === 'course' ? 'courses' : 'engagements'

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Offerings</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/courses/new')}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + Create Course
          </button>
          <button
            onClick={() => navigate('/engagements/new')}
            className="rounded border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-light focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + Create Engagement
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => switchTab(tab.value)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.value
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load {tabLabel}: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80  px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No {tabLabel} found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80  divide-y divide-gray-100">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
                )}
              </div>
              <button
                onClick={() => navigate(`/${item.type === 'course' ? 'courses' : 'engagements'}/${item.id}/edit`)}
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
