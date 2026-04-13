import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import type { Meeting } from '../types'

type ViewMode = 'list' | 'calendar'

interface MeetingWithMentee extends Meeting {
  mentee: { id: string; first_name: string; last_name: string; email: string } | null
}

export default function MentorMeetingsPage() {
  const { profile } = useAuth()
  const [meetings, setMeetings] = useState<MeetingWithMentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('mentordesk_mentor_meetings_view') as ViewMode) || 'list'
  )

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return }
    const mentorId = profile.id

    async function loadMeetings() {
      setLoading(true)
      setError(null)
      try {
        // Use ISO timestamp for "now" — PostgREST accepts timestamps directly.
        const nowIso = new Date().toISOString()
        const res = await supabaseRestGet<MeetingWithMentee>(
          'meetings',
          `select=*,mentee:mentees(id,first_name,last_name,email)` +
            `&mentor_id=eq.${mentorId}` +
            `&status=neq.cancelled` +
            `&ends_at=gte.${nowIso}` +
            `&order=starts_at.asc`,
          { label: 'mentor:meetings' },
        )
        if (res.error) { setError(res.error.message); return }
        setMeetings(res.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[MentorMeetingsPage] loadMeetings error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadMeetings
    loadMeetings()
  }, [profile?.id])

  function toggleView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('mentordesk_mentor_meetings_view', mode)
  }

  // Group meetings by local date (YYYY-MM-DD)
  const meetingsByDay = useMemo(() => {
    const groups: Record<string, MeetingWithMentee[]> = {}
    for (const m of meetings) {
      const d = new Date(m.starts_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [meetings])

  const sortedDayKeys = useMemo(() => Object.keys(meetingsByDay).sort(), [meetingsByDay])

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meetings.length} upcoming meeting{meetings.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => toggleView('list')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            List
          </button>
          <button
            onClick={() => toggleView('calendar')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
              viewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Calendar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : meetings.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No upcoming meetings.</p>
          <p className="text-xs text-gray-400 mt-1">Meetings your mentees schedule will appear here.</p>
        </div>
      ) : viewMode === 'list' ? (
        <ListView dayKeys={sortedDayKeys} meetingsByDay={meetingsByDay} />
      ) : (
        <CalendarView meetings={meetings} />
      )}
    </div>
  )
}

// ── List View (grouped by day) ──

function ListView({
  dayKeys,
  meetingsByDay,
}: {
  dayKeys: string[]
  meetingsByDay: Record<string, MeetingWithMentee[]>
}) {
  return (
    <div className="space-y-6">
      {dayKeys.map(dayKey => {
        const dayMeetings = meetingsByDay[dayKey]
        const dayDate = new Date(dayKey + 'T00:00:00')
        const todayKey = formatLocalDateKey(new Date())
        const tomorrowKey = formatLocalDateKey(new Date(Date.now() + 86400000))
        let label = dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        if (dayKey === todayKey) label = `Today · ${dayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        else if (dayKey === tomorrowKey) label = `Tomorrow · ${dayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`

        return (
          <div key={dayKey}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h3>
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {dayMeetings.map(m => (
                <MeetingRow key={m.id} meeting={m} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MeetingRow({ meeting }: { meeting: MeetingWithMentee }) {
  const start = new Date(meeting.starts_at)
  const end = new Date(meeting.ends_at)
  const timeStr = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  const menteeName = meeting.mentee
    ? `${meeting.mentee.first_name} ${meeting.mentee.last_name}`
    : 'Unknown mentee'

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-14 shrink-0 text-center">
        <p className="text-sm font-semibold text-gray-900 tabular-nums leading-none">
          {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
        <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{meeting.duration_minutes}min</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {meeting.title || `Session with ${menteeName}`}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {menteeName} · {timeStr}
        </p>
      </div>
      <button
        disabled
        title="Integration coming soon"
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
      >
        Join meeting
      </button>
    </div>
  )
}

// ── Calendar View ──

function CalendarView({ meetings }: { meetings: MeetingWithMentee[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // First day of month, and how many leading blanks we need for the grid
  const firstDayOfMonth = new Date(year, month, 1)
  const startWeekday = firstDayOfMonth.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build 6x7 grid cells
  const cells: { dateKey: string | null; date: Date | null }[] = []
  for (let i = 0; i < startWeekday; i++) cells.push({ dateKey: null, date: null })
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    cells.push({ dateKey: formatLocalDateKey(d), date: d })
  }
  while (cells.length % 7 !== 0) cells.push({ dateKey: null, date: null })

  const meetingsByDay = useMemo(() => {
    const groups: Record<string, MeetingWithMentee[]> = {}
    for (const m of meetings) {
      const key = formatLocalDateKey(new Date(m.starts_at))
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [meetings])

  const todayKey = formatLocalDateKey(new Date())

  return (
    <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Prev
        </button>
        <h3 className="text-sm font-semibold text-gray-900">{monthLabel}</h3>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 bg-gray-50/50 border-b border-gray-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="px-2 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isToday = cell.dateKey === todayKey
          const dayMeetings = cell.dateKey ? meetingsByDay[cell.dateKey] ?? [] : []
          return (
            <div
              key={i}
              className={`min-h-24 border-r border-b border-gray-100 p-1.5 ${
                cell.date ? '' : 'bg-gray-50/30'
              }`}
            >
              {cell.date && (
                <>
                  <p className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-brand' : 'text-gray-600'}`}>
                    {cell.date.getDate()}
                  </p>
                  <div className="space-y-0.5">
                    {dayMeetings.slice(0, 3).map(m => (
                      <div
                        key={m.id}
                        title={`${m.title || 'Meeting'} · ${m.mentee ? `${m.mentee.first_name} ${m.mentee.last_name}` : ''}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-brand-light text-brand font-medium truncate"
                      >
                        {new Date(m.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {' '}
                        {m.mentee ? m.mentee.first_name : ''}
                      </div>
                    ))}
                    {dayMeetings.length > 3 && (
                      <p className="text-[9px] text-gray-400 px-1.5">+{dayMeetings.length - 3} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
