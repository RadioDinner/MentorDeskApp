import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import type { Offering, MenteeOffering } from '../types'

interface MenteeEngagement extends MenteeOffering {
  offering?: Offering
}

export default function MenteeEngagementsPage() {
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [engagements, setEngagements] = useState<MenteeEngagement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }
    const menteeId = menteeProfile.id

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const res = await supabaseRestGet<MenteeOffering & { offering: Offering | null }>(
          'mentee_offerings',
          `select=*,offering:offerings(*)&mentee_id=eq.${menteeId}&status=in.(active,completed)&order=assigned_at.desc`,
          { label: 'mentee:engagements' },
        )
        if (res.error) { setError(res.error.message); return }
        const all = res.data ?? []
        setEngagements(all
          .filter(mo => mo.offering?.type === 'engagement')
          .map(mo => ({ ...mo, offering: mo.offering ?? undefined })))
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[MenteeEngagementsPage] loadData error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadData
    loadData()
  }, [menteeProfile?.id])

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>
  if (error) return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />

  const active = engagements.filter(e => e.status === 'active')
  const completed = engagements.filter(e => e.status === 'completed')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Engagements</h1>
        <p className="text-sm text-gray-500 mt-0.5">{active.length} active{completed.length > 0 ? `, ${completed.length} completed` : ''}</p>
      </div>

      {active.length === 0 && completed.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No engagements yet.</p>
          <p className="text-xs text-gray-400 mt-1">Your organization will assign engagements to you.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active</h3>
              <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
                {active.map(e => <EngagementRow key={e.id} engagement={e} onClick={() => navigate(`/my-engagements/${e.id}`)} />)}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Completed</h3>
              <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
                {completed.map(e => <EngagementRow key={e.id} engagement={e} onClick={() => navigate(`/my-engagements/${e.id}`)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EngagementRow({ engagement, onClick }: { engagement: MenteeEngagement; onClick: () => void }) {
  const offering = engagement.offering
  const totalCredits = engagement.meeting_count ?? offering?.meeting_count ?? 0
  const used = engagement.sessions_used
  const remaining = Math.max(0, totalCredits - used)
  const isCompleted = engagement.status === 'completed'
  const period = engagement.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/mo' : period === 'weekly' ? '/wk' : ''
  const priceCents = engagement.recurring_price_cents ?? offering?.recurring_price_cents ?? 0

  const statusColors: Record<string, string> = {
    active: 'bg-green-50 text-green-600',
    completed: 'bg-blue-50 text-blue-600',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className={`px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors ${isCompleted ? 'opacity-75' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {offering?.name ?? 'Engagement'}
          </p>
          <div className="flex items-center gap-4 mt-1.5">
            {totalCredits > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : remaining <= 1 ? 'bg-amber-400' : 'bg-brand'}`}
                      style={{ width: `${totalCredits > 0 ? Math.round((used / totalCredits) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">{used}/{totalCredits} sessions</span>
                </div>
                <span className={`text-xs ${remaining <= 1 && !isCompleted ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {remaining} remaining
                </span>
              </>
            ) : (
              <span className="text-xs text-gray-400">Unlimited sessions</span>
            )}
            {priceCents > 0 && (
              <span className="text-xs text-gray-400">${(priceCents / 100).toFixed(2)}{periodLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {engagement.assigned_at && (
              <p className="text-[10px] text-gray-400">
                Started {new Date(engagement.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize shrink-0 ${statusColors[engagement.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {engagement.status}
        </span>
      </div>
    </div>
  )
}
