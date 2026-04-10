import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { computeCredits } from '../lib/credits'
import type { MenteeOffering, Offering, EngagementSession, Meeting, AvailabilitySchedule } from '../types'

interface MentorInfo { id: string; first_name: string; last_name: string }

export default function MenteeEngagementDetailPage() {
  const { id } = useParams<{ id: string }>() // mentee_offering id
  const { menteeProfile, profile } = useAuth()
  const navigate = useNavigate()

  const [mo, setMo] = useState<(MenteeOffering & { offering: Offering }) | null>(null)
  const [sessions, setSessions] = useState<EngagementSession[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [mentor, setMentor] = useState<MentorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Scheduling state
  const [showScheduler, setShowScheduler] = useState(false)
  const [availability, setAvailability] = useState<AvailabilitySchedule[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStart, setSelectedStart] = useState('')
  const [selectedEnd, setSelectedEnd] = useState('')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const menteeId = menteeProfile?.id
  const orgId = menteeProfile?.organization_id ?? profile?.organization_id

  useEffect(() => {
    if (!id || !menteeId) { setLoading(false); return }
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch mentee_offering with offering details
        const { data: moData, error: moErr } = await supabase
          .from('mentee_offerings')
          .select('*, offering:offerings(*)')
          .eq('id', id!)
          .eq('mentee_id', menteeId!)
          .single()

        if (moErr || !moData) { setError('Engagement not found.'); return }
        const engagement = moData as MenteeOffering & { offering: Offering }
        if (engagement.offering?.type !== 'engagement') { setError('This is not an engagement.'); return }
        setMo(engagement)

        // Fetch sessions, meetings, and mentor info in parallel
        const [sessionsRes, meetingsRes, pairingRes] = await Promise.all([
          supabase
            .from('engagement_sessions')
            .select('*')
            .eq('mentee_offering_id', id!)
            .order('session_date', { ascending: false }),
          supabase
            .from('meetings')
            .select('*')
            .eq('mentee_offering_id', id!)
            .order('starts_at', { ascending: false }),
          supabase
            .from('pairings')
            .select('mentor_id, mentor:staff!pairings_mentor_id_fkey(id, first_name, last_name)')
            .eq('mentee_id', menteeId!)
            .in('status', ['active', 'paused'])
            .limit(1),
        ])

        setSessions((sessionsRes.data ?? []) as EngagementSession[])
        setMeetings((meetingsRes.data ?? []) as Meeting[])

        if (pairingRes.data?.[0]?.mentor) {
          const m = pairingRes.data[0].mentor as unknown as MentorInfo
          setMentor(m)

          // Fetch mentor availability for scheduling
          const { data: availData } = await supabase
            .from('availability_schedules')
            .select('*')
            .eq('staff_id', m.id)
            .eq('is_active', true)
            .order('day_of_week')
            .order('start_time')
          setAvailability((availData ?? []) as AvailabilitySchedule[])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, menteeId])

  async function scheduleMeeting() {
    if (!selectedDate || !selectedStart || !selectedEnd || !mentor || !mo || !menteeId || !orgId) return
    setScheduling(true)
    setMsg(null)

    try {
      const startsAt = `${selectedDate}T${selectedStart}:00`
      const endsAt = `${selectedDate}T${selectedEnd}:00`
      const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime()
      const durationMinutes = Math.round(durationMs / 60000)

      // Create engagement_session record (auto-deduct credit)
      // Create the meeting — credits are consumed when the meeting ends, not at booking
      const { data: meetingData, error: meetingErr } = await supabase
        .from('meetings')
        .insert({
          organization_id: orgId,
          mentee_offering_id: mo.id,
          mentee_id: menteeId,
          mentor_id: mentor.id,
          title: meetingTitle.trim() || `Session with ${mentor.first_name}`,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: durationMinutes,
          status: 'scheduled',
        })
        .select()
        .single()

      if (meetingErr) { setMsg({ type: 'error', text: meetingErr.message }); return }

      setMeetings(prev => [meetingData as Meeting, ...prev])
      setShowScheduler(false)
      setSelectedDate('')
      setSelectedStart('')
      setSelectedEnd('')
      setMeetingTitle('')
      setMsg({ type: 'success', text: 'Meeting scheduled!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Failed to schedule' })
    } finally {
      setScheduling(false)
    }
  }

  function formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  function getAvailableBlocksForDate(date: string): AvailabilitySchedule[] {
    if (!date) return []
    const dayOfWeek = new Date(date + 'T00:00:00').getDay()
    return availability.filter(a => a.day_of_week === dayOfWeek)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error || !mo) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => navigate('/my-engagements')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4">&larr; Back to My Engagements</button>
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'Engagement not found.'}
        </div>
      </div>
    )
  }

  const offering = mo.offering
  const totalCredits = mo.meeting_count ?? offering?.meeting_count ?? 0
  const credits = computeCredits(meetings, totalCredits)
  const isCompleted = mo.status === 'completed'
  const period = mo.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/month' : period === 'weekly' ? '/week' : '/cycle'

  const upcomingMeetings = credits.upcomingMeetings
  const pastMeetings = meetings.filter(m => new Date(m.ends_at) <= new Date() || m.status === 'cancelled')

  // Generate next 14 days for date picker
  const dateOptions: string[] = []
  const now = new Date()
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getTime() + i * 86400000)
    dateOptions.push(d.toISOString().slice(0, 10))
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/my-engagements')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3">&larr; Back to My Engagements</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{offering?.name ?? 'Engagement'}</h1>
            {mentor && <p className="text-sm text-gray-500 mt-0.5">Mentor: {mentor.first_name} {mentor.last_name}</p>}
          </div>
          <span className={`text-[10px] font-medium px-2 py-1 rounded ${
            isCompleted ? 'bg-green-100 text-green-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {isCompleted ? 'Completed' : 'Active'}
          </span>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${
          msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
          {msg.text}
        </div>
      )}

      {/* Credits summary */}
      <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
        <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Session Credits</h2>
        {totalCredits > 0 ? (
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{totalCredits}</p>
              <p className="text-xs text-gray-500 mt-0.5">Allocated{periodLabel}</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">{credits.used} used</span>
                <span className={`text-sm font-semibold ${(credits.remaining ?? 0) <= 1 && !isCompleted ? 'text-amber-600' : 'text-gray-900'}`}>
                  {credits.remaining} remaining
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : (credits.remaining ?? 0) <= 1 ? 'bg-amber-400' : 'bg-brand'}`}
                  style={{ width: `${totalCredits > 0 ? Math.round((credits.used / totalCredits) * 100) : 0}%` }}
                />
              </div>
              {credits.reserved > 0 && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {credits.reserved} upcoming meeting{credits.reserved !== 1 ? 's' : ''} scheduled
                  {credits.availableToBook !== null && credits.availableToBook > 0 && (
                    <> · {credits.availableToBook} credit{credits.availableToBook !== 1 ? 's' : ''} available to book</>
                  )}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Unlimited sessions — {credits.used} completed so far</p>
        )}
      </div>

      {/* Schedule a meeting */}
      {!isCompleted && ((credits.availableToBook !== null ? credits.availableToBook > 0 : true) || totalCredits === 0) && mentor && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Schedule a Meeting</h2>
            {!showScheduler && (
              <button
                onClick={() => setShowScheduler(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition-colors"
              >
                + Schedule
              </button>
            )}
          </div>

          {showScheduler ? (
            <div className="space-y-3">
              {/* Date selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <select
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedStart(''); setSelectedEnd('') }}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">Select a date...</option>
                  {dateOptions.map(d => {
                    const date = new Date(d + 'T00:00:00')
                    const blocks = getAvailableBlocksForDate(d)
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                    return (
                      <option key={d} value={d} disabled={blocks.length === 0}>
                        {dayName}{blocks.length === 0 ? ' (not available)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Available blocks for selected date */}
              {selectedDate && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Available times</label>
                  {(() => {
                    const blocks = getAvailableBlocksForDate(selectedDate)
                    if (blocks.length === 0) {
                      return <p className="text-xs text-gray-400">No availability on this date.</p>
                    }
                    return (
                      <div className="space-y-2">
                        {blocks.map(block => (
                          <div key={block.id} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-32 shrink-0">
                              {formatTime(block.start_time)} – {formatTime(block.end_time)}
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                min={block.start_time.slice(0, 5)}
                                max={block.end_time.slice(0, 5)}
                                value={selectedStart}
                                onChange={e => setSelectedStart(e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-brand"
                              />
                              <span className="text-xs text-gray-400">to</span>
                              <input
                                type="time"
                                min={selectedStart || block.start_time.slice(0, 5)}
                                max={block.end_time.slice(0, 5)}
                                value={selectedEnd}
                                onChange={e => setSelectedEnd(e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-brand"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Title */}
              {selectedStart && selectedEnd && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Meeting title (optional)</label>
                  <input
                    type="text"
                    value={meetingTitle}
                    onChange={e => setMeetingTitle(e.target.value)}
                    placeholder={`Session with ${mentor.first_name}`}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={scheduleMeeting}
                  disabled={scheduling || !selectedDate || !selectedStart || !selectedEnd}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {scheduling ? 'Scheduling...' : 'Confirm & Book'}
                </button>
                <button
                  onClick={() => setShowScheduler(false)}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <p className="text-xs text-gray-400">No upcoming meetings. Click Schedule to book a session with your mentor.</p>
          ) : null}
        </div>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Upcoming Meetings</h2>
          <div className="space-y-2">
            {upcomingMeetings.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-brand-light/30 border border-brand/10">
                <div className="w-10 text-center shrink-0">
                  <p className="text-lg font-bold text-brand tabular-nums">{new Date(m.starts_at).getDate()}</p>
                  <p className="text-[10px] text-brand/70 uppercase">{new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short' })}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.title || 'Meeting'}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(m.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {' – '}
                    {new Date(m.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {' · '}{m.duration_minutes}min
                  </p>
                </div>
                {m.meeting_link && (
                  <a href={m.meeting_link} target="_blank" rel="noreferrer" className="text-xs text-brand hover:text-brand-hover transition-colors shrink-0">
                    Join
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session history */}
      <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
        <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
          Session History ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className="text-xs text-gray-400">No sessions recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs text-gray-600 tabular-nums w-24 shrink-0">
                  {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="text-xs text-gray-500 flex-1 truncate">{s.notes || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past meetings */}
      {pastMeetings.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Past Meetings</h2>
          <div className="space-y-1">
            {pastMeetings.map(m => {
              const statusColors: Record<string, string> = {
                completed: 'bg-green-50 text-green-600',
                cancelled: 'bg-gray-100 text-gray-400',
                no_show: 'bg-red-50 text-red-600',
                scheduled: 'bg-blue-50 text-blue-600',
              }
              return (
                <div key={m.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs text-gray-600 tabular-nums w-24 shrink-0">
                    {new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{m.title || 'Meeting'}</span>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded capitalize ${statusColors[m.status] ?? ''}`}>
                    {m.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
