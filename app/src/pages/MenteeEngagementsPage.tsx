import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import { Skeleton } from '../components/ui'
import type { Offering, MenteeOffering, Meeting } from '../types'

type Tab = 'engagements' | 'upcoming' | 'past'

interface MenteeEngagement extends MenteeOffering {
  offering?: Offering
}

interface MeetingWithContext extends Meeting {
  mentee_offering: {
    id: string
    offering: { id: string; name: string } | null
  } | null
  mentor: { id: string; first_name: string; last_name: string } | null
}

// Window (minutes before start) in which the "Join meeting" button activates.
const JOIN_WINDOW_MINUTES = 15

export default function MenteeEngagementsPage() {
  const { menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [engagements, setEngagements] = useState<MenteeEngagement[]>([])
  const [meetings, setMeetings] = useState<MeetingWithContext[]>([])
  const [tab, setTab] = useState<Tab>('engagements')
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
        // Engagements + meetings (with engagement + mentor joined) in parallel.
        const [engRes, meetingsRes] = await Promise.all([
          supabaseRestGet<MenteeOffering & { offering: Offering | null }>(
            'mentee_offerings',
            `select=*,offering:offerings(*)&mentee_id=eq.${menteeId}&status=in.(active,completed)&order=assigned_at.desc`,
            { label: 'mentee:engagements:list' },
          ),
          supabaseRestGet<MeetingWithContext>(
            'meetings',
            `select=*,mentee_offering:mentee_offerings(id,offering:offerings(id,name)),mentor:staff!meetings_mentor_id_fkey(id,first_name,last_name)` +
              `&mentee_id=eq.${menteeId}` +
              `&order=starts_at.asc`,
            { label: 'mentee:engagements:meetings' },
          ),
        ])
        if (engRes.error) { setError(engRes.error.message); return }
        if (meetingsRes.error) { setError(meetingsRes.error.message); return }

        const all = engRes.data ?? []
        setEngagements(all
          .filter(mo => mo.offering?.type === 'engagement')
          .map(mo => ({ ...mo, offering: mo.offering ?? undefined })))

        setMeetings(meetingsRes.data ?? [])
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

  const now = new Date()
  const upcomingMeetings = useMemo(
    () => meetings
      .filter(m => m.status !== 'cancelled' && new Date(m.ends_at).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetings],
  )
  const pastMeetings = useMemo(
    () => meetings
      .filter(m => new Date(m.ends_at).getTime() < now.getTime() || m.status === 'cancelled' || m.status === 'completed' || m.status === 'no_show')
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetings],
  )

  if (loading) return <Skeleton count={5} className="h-16 w-full" gap="gap-3" />
  if (error) return <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />

  const active = engagements.filter(e => e.status === 'active')
  const completed = engagements.filter(e => e.status === 'completed')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Engagements</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {active.length} active{completed.length > 0 ? `, ${completed.length} completed` : ''}
          {' · '}
          {upcomingMeetings.length} upcoming meeting{upcomingMeetings.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden w-fit">
        <TabButton label="Engagements" count={engagements.length} active={tab === 'engagements'} onClick={() => setTab('engagements')} />
        <TabButton label="Upcoming Meetings" count={upcomingMeetings.length} active={tab === 'upcoming'} onClick={() => setTab('upcoming')} divider />
        <TabButton label="Past Meetings" count={pastMeetings.length} active={tab === 'past'} onClick={() => setTab('past')} divider />
      </div>

      {/* Engagements tab */}
      {tab === 'engagements' && (
        active.length === 0 && completed.length === 0 ? (
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
        )
      )}

      {/* Upcoming meetings tab */}
      {tab === 'upcoming' && (
        upcomingMeetings.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No upcoming meetings.</p>
            <p className="text-xs text-gray-400 mt-1">Schedule a meeting from one of your active engagements.</p>
          </div>
        ) : (
          <MeetingsByDay meetings={upcomingMeetings} onViewEngagement={id => navigate(`/my-engagements/${id}`)} />
        )
      )}

      {/* Past meetings tab */}
      {tab === 'past' && (
        pastMeetings.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No past meetings yet.</p>
          </div>
        ) : (
          <PastMeetingsByMonth meetings={pastMeetings} onViewEngagement={id => navigate(`/my-engagements/${id}`)} />
        )
      )}
    </div>
  )
}

// ─────────── Tab button ───────────

function TabButton({
  label, count, active, onClick, divider,
}: { label: string; count: number; active: boolean; onClick: () => void; divider?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium transition-colors ${divider ? 'border-l border-gray-200' : ''} ${
        active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[10px] tabular-nums text-gray-400">{count}</span>
    </button>
  )
}

// ─────────── Upcoming meetings grouped by day ───────────

function MeetingsByDay({ meetings, onViewEngagement }: { meetings: MeetingWithContext[]; onViewEngagement: (id: string) => void }) {
  const byDay = useMemo(() => {
    const groups: Record<string, MeetingWithContext[]> = {}
    for (const m of meetings) {
      const d = new Date(m.starts_at)
      const key = formatDateKey(d)
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [meetings])
  const dayKeys = Object.keys(byDay).sort()

  const todayKey = formatDateKey(new Date())
  const tomorrowKey = formatDateKey(new Date(Date.now() + 86400000))

  return (
    <div className="space-y-5">
      {dayKeys.map(key => {
        const d = new Date(key + 'T00:00:00')
        let label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        if (key === todayKey) label = `Today · ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        else if (key === tomorrowKey) label = `Tomorrow · ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        return (
          <div key={key}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h3>
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {byDay[key].map(m => (
                <MeetingRow key={m.id} meeting={m} onViewEngagement={onViewEngagement} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────── Past meetings grouped by month ───────────

function PastMeetingsByMonth({ meetings, onViewEngagement }: { meetings: MeetingWithContext[]; onViewEngagement: (id: string) => void }) {
  const byMonth = useMemo(() => {
    const groups: Record<string, MeetingWithContext[]> = {}
    for (const m of meetings) {
      const d = new Date(m.starts_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [meetings])
  const monthKeys = Object.keys(byMonth).sort().reverse()

  return (
    <div className="space-y-5">
      {monthKeys.map(key => {
        const [y, mo] = key.split('-').map(Number)
        const label = new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        return (
          <div key={key}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h3>
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {byMonth[key].map(m => (
                <MeetingRow key={m.id} meeting={m} past onViewEngagement={onViewEngagement} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────── Meeting row ───────────

function MeetingRow({
  meeting,
  past,
  onViewEngagement,
}: {
  meeting: MeetingWithContext
  past?: boolean
  onViewEngagement: (id: string) => void
}) {
  const start = new Date(meeting.starts_at)
  const end = new Date(meeting.ends_at)
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const engagementName = meeting.mentee_offering?.offering?.name ?? 'Engagement'
  const mentorName = meeting.mentor
    ? `${meeting.mentor.first_name} ${meeting.mentor.last_name}`
    : 'Your mentor'

  // Join window: from (start - 15min) to end
  const now = Date.now()
  const withinJoinWindow =
    now >= start.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000 && now <= end.getTime()
  const canJoin = withinJoinWindow && !!meeting.meeting_link && meeting.status !== 'cancelled'

  // Status color for past meetings
  const pastStatusColors: Record<string, string> = {
    completed: 'bg-green-50 text-green-600',
    cancelled: 'bg-gray-100 text-gray-400',
    no_show: 'bg-red-50 text-red-600',
    scheduled: 'bg-blue-50 text-blue-600',
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-14 shrink-0 text-center">
        <p className={`text-sm font-semibold tabular-nums leading-none ${past ? 'text-gray-500' : 'text-gray-900'}`}>
          {startTime}
        </p>
        <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{meeting.duration_minutes}min</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${past ? 'text-gray-700' : 'text-gray-900'}`}>
          {meeting.title || `Session with ${mentorName}`}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {engagementName} · {mentorName} · {startTime}–{endTime}
        </p>
      </div>
      {past ? (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 capitalize ${pastStatusColors[meeting.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {meeting.status}
        </span>
      ) : canJoin ? (
        <a
          href={meeting.meeting_link!}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-brand bg-brand text-white hover:bg-brand-hover transition-colors"
        >
          Join meeting
        </a>
      ) : withinJoinWindow ? (
        <button
          disabled
          title="Meeting link not yet available"
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
        >
          No link yet
        </button>
      ) : (
        <button
          disabled
          title={`Available ${JOIN_WINDOW_MINUTES} minutes before start`}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
        >
          Join meeting
        </button>
      )}
      <button
        onClick={e => { e.stopPropagation(); onViewEngagement(meeting.mentee_offering?.id ?? '') }}
        disabled={!meeting.mentee_offering?.id}
        className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-30"
      >
        View →
      </button>
    </div>
  )
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─────────── Engagement row (unchanged) ───────────

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
