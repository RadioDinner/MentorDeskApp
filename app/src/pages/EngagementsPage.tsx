import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import type { Offering } from '../types'

type ViewMode = 'list' | 'grid'

interface EngagementWithStats extends Offering {
  active_mentees: number
  completed_mentees: number
}

export default function EngagementsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<EngagementWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('mentordesk_engagements_view') as ViewMode) || 'grid'
  )

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

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
        const engagements = (data ?? []) as Offering[]

        // Fetch mentee enrollment counts
        const engIds = engagements.map(eng => eng.id)
        const activeCounts: Record<string, number> = {}
        const completedCounts: Record<string, number> = {}
        if (engIds.length > 0) {
          const { data: moData } = await supabase
            .from('mentee_offerings')
            .select('offering_id, status')
            .in('offering_id', engIds)
            .in('status', ['active', 'completed'])
          if (moData) {
            for (const mo of moData) {
              if (mo.status === 'active') activeCounts[mo.offering_id] = (activeCounts[mo.offering_id] || 0) + 1
              else if (mo.status === 'completed') completedCounts[mo.offering_id] = (completedCounts[mo.offering_id] || 0) + 1
            }
          }
        }

        setItems(engagements.map(eng => ({
          ...eng,
          active_mentees: activeCounts[eng.id] ?? 0,
          completed_mentees: completedCounts[eng.id] ?? 0,
        })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [profile?.organization_id])

  function toggleView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('mentordesk_engagements_view', mode)
  }

  function getPrice(item: Offering): string {
    if (item.recurring_price_cents > 0) return `$${(item.recurring_price_cents / 100).toFixed(2)}/mo`
    if (item.price_cents > 0) return `$${(item.price_cents / 100).toFixed(2)}`
    return 'Free'
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Engagements</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} engagement{items.length !== 1 ? 's' : ''}</p>
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
            onClick={() => navigate('/engagements/new')}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + Create Engagement
          </button>
        </div>
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
          <p className="text-xs text-gray-400 mt-1">Create your first engagement to get started.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {items.map(item => (
            <EngagementGridCard key={item.id} item={item} price={getPrice(item)} navigate={navigate} />
          ))}
        </div>
      ) : (
        /* ── List View ── */
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {items.map(item => (
            <EngagementListRow key={item.id} item={item} price={getPrice(item)} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Icon ──

function EngagementIcon({ item, size = 'md' }: { item: Offering; size?: 'sm' | 'md' }) {
  const dims = size === 'md' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm'

  if (item.icon_url) {
    const isEmoji = item.icon_url.length <= 4 && !/^https?:\/\//.test(item.icon_url)
    if (isEmoji) {
      return (
        <div className={`${dims} rounded-lg bg-emerald-50 flex items-center justify-center shrink-0`}>
          <span>{item.icon_url}</span>
        </div>
      )
    }
    return <img src={item.icon_url} alt="" className={`${dims} rounded-lg object-cover shrink-0`} />
  }

  return (
    <div className={`${dims} rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold shrink-0`}>
      {item.name[0]?.toUpperCase() ?? 'E'}
    </div>
  )
}

// ── Grid Card ──

function EngagementGridCard({ item, price, navigate }: { item: EngagementWithStats; price: string; navigate: (path: string) => void }) {
  const totalEnrolled = item.active_mentees + item.completed_mentees

  return (
    <div
      className="bg-white rounded-lg border border-gray-200/80 overflow-hidden hover:border-brand/40 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => navigate(`/engagements/${item.id}/edit`)}
    >
      <div className="px-5 pt-5 pb-4">
        {/* Header */}
        <div className="flex items-start gap-3.5 mb-3">
          <EngagementIcon item={item} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900 group-hover:text-brand transition-colors truncate">
              {item.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {item.meeting_count ? `${item.meeting_count} session${item.meeting_count !== 1 ? 's' : ''}` : 'Unlimited sessions'}
              {' · '}{price}
            </p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded shrink-0 bg-emerald-50 text-emerald-600">
            {item.allocation_period === 'weekly' ? 'Weekly' : item.allocation_period === 'per_cycle' ? 'Per cycle' : 'Monthly'}
          </span>
        </div>

        {item.description && (
          <p className="text-xs text-gray-400 line-clamp-2 mb-4">{item.description}</p>
        )}

        {/* Enrollment stats */}
        <div className="flex items-stretch gap-3 mb-3">
          <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-emerald-600 tabular-nums">{item.active_mentees}</p>
            <p className="text-[10px] text-emerald-600/70 font-medium mt-0.5">Active</p>
          </div>
          <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-gray-600 tabular-nums">{item.completed_mentees}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Completed</p>
          </div>
          <div className="flex-1 rounded-lg bg-blue-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-blue-600 tabular-nums">{totalEnrolled}</p>
            <p className="text-[10px] text-blue-600/70 font-medium mt-0.5">Total</p>
          </div>
        </div>

        {item.setup_fee_cents > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            ${(item.setup_fee_cents / 100).toFixed(2)} setup fee
          </span>
        )}
      </div>

      <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end">
        <button
          onClick={e => { e.stopPropagation(); navigate(`/engagements/${item.id}/edit`) }}
          className="px-3.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
        >
          Settings
        </button>
      </div>
    </div>
  )
}

// ── List Row ──

function EngagementListRow({ item, price, navigate }: { item: EngagementWithStats; price: string; navigate: (path: string) => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
      <EngagementIcon item={item} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
          <span className="text-xs text-gray-400 shrink-0">{price}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {item.meeting_count ? `${item.meeting_count} session${item.meeting_count !== 1 ? 's' : ''}` : 'Unlimited sessions'}
          {' · '}{item.allocation_period === 'weekly' ? 'Weekly' : item.allocation_period === 'per_cycle' ? 'Per cycle' : 'Monthly'}
        </p>
      </div>

      {/* Enrollment counts */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs tabular-nums"><span className="font-semibold text-emerald-600">{item.active_mentees}</span> <span className="text-gray-400">active</span></span>
        <span className="text-xs tabular-nums"><span className="font-semibold text-gray-600">{item.completed_mentees}</span> <span className="text-gray-400">done</span></span>
      </div>

      <button
        onClick={() => navigate(`/engagements/${item.id}/edit`)}
        className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
      >
        Settings
      </button>
    </div>
  )
}
