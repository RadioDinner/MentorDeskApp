import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { computeCredits } from '../lib/credits'
import { generateBookableBlocks, hasConflict, formatTimeDisplay } from '../lib/scheduling'
import type { MenteeOffering, Offering, EngagementSession, Meeting, AvailabilitySchedule } from '../types'

interface MentorInfo { id: string; first_name: string; last_name: string }

export default function MenteeEngagementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { menteeProfile, profile } = useAuth()
  const navigate = useNavigate()

  const [mo, setMo] = useState<(MenteeOffering & { offering: Offering }) | null>(null)
  const [sessions, setSessions] = useState<EngagementSession[]>([])
  const [myMeetings, setMyMeetings] = useState<Meeting[]>([])
  const [mentorAllMeetings, setMentorAllMeetings] = useState<Meeting[]>([])
  const [mentor, setMentor] = useState<MentorInfo | null>(null)
  const [showAllDays, setShowAllDays] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Scheduling
  const [showScheduler, setShowScheduler] = useState(false)
  const [availability, setAvailability] = useState<AvailabilitySchedule[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStart, setSelectedStart] = useState('')
  const [selectedEnd, setSelectedEnd] = useState('')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)

  const menteeId = menteeProfile?.id
  const orgId = menteeProfile?.organization_id ?? profile?.organization_id

  useEffect(() => {
    if (!id || !menteeId) { setLoading(false); return }
    async function fetchData() {
      setLoading(true)
      try {
        const { data: moData, error: moErr } = await supabase
          .from('mentee_offerings').select('*, offering:offerings(*)').eq('id', id!).eq('mentee_id', menteeId!).single()
        if (moErr || !moData) { setError('Engagement not found.'); return }
        const engagement = moData as MenteeOffering & { offering: Offering }
        if (engagement.offering?.type !== 'engagement') { setError('This is not an engagement.'); return }
        setMo(engagement)

        // Load org setting: show all days vs. only available days in scheduler
        if (engagement.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('show_all_days_in_scheduler')
            .eq('id', engagement.organization_id)
            .single()
          if (orgData && typeof (orgData as { show_all_days_in_scheduler?: boolean }).show_all_days_in_scheduler === 'boolean') {
            setShowAllDays((orgData as { show_all_days_in_scheduler: boolean }).show_all_days_in_scheduler)
          }
        }

        // Fetch sessions + meetings for this engagement
        const [sessionsRes, meetingsRes] = await Promise.all([
          supabase.from('engagement_sessions').select('*').eq('mentee_offering_id', id!).order('session_date', { ascending: false }),
          supabase.from('meetings').select('*').eq('mentee_offering_id', id!).order('starts_at', { ascending: false }),
        ])
        setSessions((sessionsRes.data ?? []) as EngagementSession[])
        setMyMeetings((meetingsRes.data ?? []) as Meeting[])

        // Find mentor: try pairings first, then fall back to assigned_by staff
        let mentorFound: MentorInfo | null = null

        const { data: pairingData } = await supabase
          .from('pairings')
          .select('mentor_id, mentor:staff!pairings_mentor_id_fkey(id, first_name, last_name)')
          .eq('mentee_id', menteeId!)
          .in('status', ['active', 'paused'])
          .limit(1)

        if (pairingData?.[0]?.mentor) {
          mentorFound = pairingData[0].mentor as unknown as MentorInfo
        } else if (engagement.assigned_by) {
          // Fallback: look up the staff member who assigned this engagement
          const { data: staffData } = await supabase
            .from('staff')
            .select('id, first_name, last_name')
            .eq('id', engagement.assigned_by)
            .single()
          if (staffData) mentorFound = staffData as MentorInfo
        }

        if (!mentorFound) {
          // Last resort: find any mentor in the org
          const { data: anyMentor } = await supabase
            .from('staff')
            .select('id, first_name, last_name')
            .eq('organization_id', engagement.organization_id)
            .in('role', ['mentor', 'assistant_mentor'])
            .limit(1)
          if (anyMentor?.[0]) mentorFound = anyMentor[0] as MentorInfo
        }

        if (mentorFound) {
          setMentor(mentorFound)

          // Fetch mentor availability AND all their meetings (for conflict detection)
          const [availRes, allMentorMeetingsRes] = await Promise.all([
            supabase.from('availability_schedules').select('*')
              .eq('staff_id', mentorFound.id).eq('is_active', true)
              .order('day_of_week').order('start_time'),
            supabase.from('meetings').select('*')
              .eq('mentor_id', mentorFound.id)
              .neq('status', 'cancelled')
              .order('starts_at'),
          ])
          setAvailability((availRes.data ?? []) as AvailabilitySchedule[])
          setMentorAllMeetings((allMentorMeetingsRes.data ?? []) as Meeting[])
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, menteeId])

  // When date changes, clear time selections and conflicts
  function handleDateChange(date: string) {
    setSelectedDate(date)
    setSelectedStart('')
    setSelectedEnd('')
    setConflictError(null)
  }

  // Pick a pre-computed time block
  function pickBlock(start: string, end: string) {
    setSelectedStart(start)
    setSelectedEnd(end)
    setConflictError(null)
    if (selectedDate && hasConflict(selectedDate, start, end, mentorAllMeetings)) {
      setConflictError('This time was just booked. Please choose another block.')
    }
  }

  async function scheduleMeeting() {
    if (!selectedDate || !selectedStart || !selectedEnd || !mentor || !mo || !menteeId || !orgId) return
    if (conflictError) return

    // Double-check conflict right before booking
    if (hasConflict(selectedDate, selectedStart, selectedEnd, mentorAllMeetings)) {
      setConflictError('This time was just booked. Please choose another time.')
      return
    }

    setScheduling(true)
    setMsg(null)
    try {
      const startsAt = `${selectedDate}T${selectedStart}:00`
      const endsAt = `${selectedDate}T${selectedEnd}:00`
      const durationMinutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)

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

      const newMeeting = meetingData as Meeting
      setMyMeetings(prev => [newMeeting, ...prev])
      setMentorAllMeetings(prev => [...prev, newMeeting]) // Add to conflict list
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

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error || !mo) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => navigate('/my-engagements')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">&larr; Back to My Engagements</button>
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">{error || 'Engagement not found.'}</div>
      </div>
    )
  }

  const offering = mo.offering
  const totalCredits = mo.meeting_count ?? offering?.meeting_count ?? 0
  const credits = computeCredits(myMeetings, totalCredits)
  const isCompleted = mo.status === 'completed'
  const period = mo.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/month' : period === 'weekly' ? '/week' : '/cycle'

  const upcomingMeetings = credits.upcomingMeetings
  const pastMeetings = myMeetings.filter(m => new Date(m.ends_at) <= new Date() || m.status === 'cancelled')
  const canSchedule = !isCompleted && mentor && (credits.availableToBook === null || credits.availableToBook > 0 || totalCredits === 0)

  // Meeting duration from offering (defaults to 60 minutes).
  const meetingDurationMinutes = offering?.default_meeting_duration_minutes ?? 60

  // Bookable blocks for the selected date, stepped in 30-minute increments.
  const bookableBlocks = selectedDate
    ? generateBookableBlocks(selectedDate, meetingDurationMinutes, availability, mentorAllMeetings, 30)
    : []

  // Date options: next 14 days. When showAllDays is off, filter to only
  // dates where the mentor has at least one bookable block of the required
  // length (not just any raw availability).
  const allDateOptions: string[] = []
  const now = new Date()
  for (let i = 1; i <= 14; i++) allDateOptions.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10))
  const dateOptions = showAllDays
    ? allDateOptions
    : allDateOptions.filter(d => generateBookableBlocks(d, meetingDurationMinutes, availability, mentorAllMeetings, 30).length > 0)

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
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-rose-50 text-rose-700'}`}>
            {isCompleted ? 'Completed' : 'Active'}
          </span>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>{msg.text}
        </div>
      )}

      {/* Credits */}
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
                <span className="text-sm text-gray-600">{credits.used} completed</span>
                <span className={`text-sm font-semibold ${(credits.remaining ?? 0) <= 1 && !isCompleted ? 'text-amber-600' : 'text-gray-900'}`}>
                  {credits.remaining} remaining
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : (credits.remaining ?? 0) <= 1 ? 'bg-amber-400' : 'bg-brand'}`}
                  style={{ width: `${totalCredits > 0 ? Math.round((credits.used / totalCredits) * 100) : 0}%` }} />
              </div>
              {credits.reserved > 0 && (
                <p className="text-xs text-blue-600 mt-1.5">{credits.reserved} upcoming meeting{credits.reserved !== 1 ? 's' : ''} scheduled</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Unlimited sessions — {credits.used} completed</p>
        )}
      </div>

      {/* Schedule a meeting */}
      {canSchedule && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Schedule a Meeting</h2>
            {!showScheduler && (
              <button onClick={() => setShowScheduler(true)} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-hover transition-colors">
                + Schedule
              </button>
            )}
          </div>

          {showScheduler && (
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Choose a date</label>
                <select value={selectedDate} onChange={e => handleDateChange(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                  <option value="">Select a date...</option>
                  {dateOptions.map(d => {
                    const date = new Date(d + 'T00:00:00')
                    const dayBlocks = generateBookableBlocks(d, meetingDurationMinutes, availability, mentorAllMeetings, 30)
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                    return (
                      <option key={d} value={d} disabled={showAllDays && dayBlocks.length === 0}>
                        {dayName}{showAllDays && dayBlocks.length === 0 ? ' — no availability' : ''}
                      </option>
                    )
                  })}
                </select>
                {!showAllDays && dateOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">No availability in the next 14 days on your mentor's schedule.</p>
                )}
              </div>

              {/* Bookable time blocks */}
              {selectedDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Available {meetingDurationMinutes}-minute blocks
                  </label>
                  {bookableBlocks.length === 0 ? (
                    <p className="text-sm text-gray-400">No openings on this date.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bookableBlocks.map((block, i) => {
                        const isSelected = selectedStart === block.start && selectedEnd === block.end
                        return (
                          <button
                            key={`${block.start}-${block.end}-${i}`}
                            type="button"
                            onClick={() => pickBlock(block.start, block.end)}
                            className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                              isSelected
                                ? 'bg-brand border-brand text-white'
                                : 'bg-white border-gray-300 text-gray-700 hover:border-brand hover:bg-brand-light/30'
                            }`}>
                            {formatTimeDisplay(block.start)} – {formatTimeDisplay(block.end)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Conflict error */}
              {conflictError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {conflictError}
                </div>
              )}

              {/* Title */}
              {selectedStart && selectedEnd && !conflictError && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Meeting title (optional)</label>
                  <input type="text" value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)}
                    placeholder={`Session with ${mentor?.first_name ?? 'your mentor'}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button onClick={scheduleMeeting}
                  disabled={scheduling || !selectedDate || !selectedStart || !selectedEnd || !!conflictError}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {scheduling ? 'Scheduling...' : 'Confirm & Book'}
                </button>
                <button onClick={() => { setShowScheduler(false); setConflictError(null) }}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showScheduler && upcomingMeetings.length === 0 && (
            <p className="text-sm text-gray-400">No upcoming meetings. Click Schedule to book a session with your mentor.</p>
          )}
        </div>
      )}

      {!mentor && !loading && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <p className="text-sm text-gray-500">No mentor assigned. Contact your organization to set up scheduling.</p>
        </div>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Upcoming Meetings</h2>
          <div className="space-y-2">
            {upcomingMeetings.map(m => (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-brand-light/30 border border-brand/10">
                <div className="w-12 text-center shrink-0">
                  <p className="text-xl font-bold text-brand tabular-nums leading-none">{new Date(m.starts_at).getDate()}</p>
                  <p className="text-[10px] text-brand/70 uppercase mt-0.5">{new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short' })}</p>
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
                  <a href={m.meeting_link} target="_blank" rel="noreferrer" className="text-sm text-brand hover:text-brand-hover transition-colors shrink-0">Join</a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session history */}
      <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
        <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Session History ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <span className="text-sm text-gray-600 tabular-nums w-28 shrink-0">{new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="text-sm text-gray-500 flex-1 truncate">{s.notes || '—'}</span>
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
                completed: 'bg-green-50 text-green-600', cancelled: 'bg-gray-100 text-gray-400',
                no_show: 'bg-red-50 text-red-600', scheduled: 'bg-blue-50 text-blue-600',
              }
              return (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <span className="text-sm text-gray-600 tabular-nums w-28 shrink-0">{new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{m.title || 'Meeting'}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[m.status] ?? ''}`}>{m.status}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
