import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { computeAllocations } from '../lib/credits'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { generateBookableBlocks, hasConflict, formatTimeDisplay } from '../lib/scheduling'
import { notifyUser } from '../lib/notify'
import { Modal } from '../components/ui'
import type { MenteeOffering, Offering, EngagementSession, Meeting, AvailabilitySchedule, AllocationGrantMode, AllocationRefreshMode, CancellationPolicy } from '../types'
import { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'

interface MentorInfo { id: string; first_name: string; last_name: string; user_id?: string | null }

export default function MenteeEngagementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { menteeProfile, profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mo, setMo] = useState<(MenteeOffering & { offering: Offering }) | null>(null)
  const [sessions, setSessions] = useState<EngagementSession[]>([])
  const [myMeetings, setMyMeetings] = useState<Meeting[]>([])
  const [mentorAllMeetings, setMentorAllMeetings] = useState<Meeting[]>([])
  const [mentor, setMentor] = useState<MentorInfo | null>(null)
  const [showAllDays, setShowAllDays] = useState(true)
  const [maxDaysAhead, setMaxDaysAhead] = useState(14)
  const [grantMode, setGrantMode] = useState<AllocationGrantMode>('on_open')
  const [refreshMode, setRefreshMode] = useState<AllocationRefreshMode>('by_cycle')
  const [paidInvoiceDates, setPaidInvoiceDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Scheduling
  const [showScheduler, setShowScheduler] = useState(false)
  const [availability, setAvailability] = useState<AvailabilitySchedule[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStart, setSelectedStart] = useState('')
  const [selectedEnd, setSelectedEnd] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [orgCancelPolicy, setOrgCancelPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

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

        // Load org settings: scheduler visibility + allocation modes + max days ahead
        if (engagement.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('show_all_days_in_scheduler, allocation_grant_mode, allocation_refresh_mode, scheduler_max_days_ahead, default_cancellation_policy')
            .eq('id', engagement.organization_id)
            .single()
          if (orgData) {
            const o = orgData as {
              show_all_days_in_scheduler?: boolean
              allocation_grant_mode?: AllocationGrantMode
              allocation_refresh_mode?: AllocationRefreshMode
              scheduler_max_days_ahead?: number
              default_cancellation_policy?: CancellationPolicy
            }
            if (typeof o.show_all_days_in_scheduler === 'boolean') setShowAllDays(o.show_all_days_in_scheduler)
            if (o.allocation_grant_mode) setGrantMode(o.allocation_grant_mode)
            if (o.allocation_refresh_mode) setRefreshMode(o.allocation_refresh_mode)
            if (typeof o.scheduler_max_days_ahead === 'number' && o.scheduler_max_days_ahead > 0) {
              setMaxDaysAhead(o.scheduler_max_days_ahead)
            }
            if (o.default_cancellation_policy) setOrgCancelPolicy(o.default_cancellation_policy)
          }
        }

        // Fetch sessions + meetings + paid invoices for this engagement
        const [sessionsRes, meetingsRes, invoicesRes] = await Promise.all([
          supabase.from('engagement_sessions').select('*').eq('mentee_offering_id', id!).order('session_date', { ascending: false }),
          supabase.from('meetings').select('*').eq('mentee_offering_id', id!).order('starts_at', { ascending: false }),
          supabase.from('invoices').select('paid_at').eq('mentee_offering_id', id!).eq('status', 'paid').not('paid_at', 'is', null),
        ])
        setSessions((sessionsRes.data ?? []) as EngagementSession[])
        setMyMeetings((meetingsRes.data ?? []) as Meeting[])
        setPaidInvoiceDates(((invoicesRes.data ?? []) as { paid_at: string }[]).map(r => r.paid_at))

        // Find mentor: try pairings first, then fall back to assigned_by staff
        let mentorFound: MentorInfo | null = null

        const { data: pairingData } = await supabase
          .from('pairings')
          .select('mentor_id, mentor:staff!pairings_mentor_id_fkey(id, first_name, last_name, user_id)')
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
            .select('id, first_name, last_name, user_id')
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
    try {
      // Construct Date objects from the user's local wall-clock selection.
      // selectedDate is YYYY-MM-DD; selectedStart / selectedEnd are HH:MM.
      // Using `new Date(y, m, d, h, min)` creates the timestamp in the user's
      // local timezone; `.toISOString()` then encodes it correctly as UTC so
      // the TIMESTAMPTZ column stores the right moment. Using a naive string
      // like `${date}T${start}:00` would make Postgres assume UTC and shift
      // the displayed time by the user's UTC offset.
      const [year, monthNum, dayNum] = selectedDate.split('-').map(Number)
      const [startH, startM] = selectedStart.split(':').map(Number)
      const [endH, endM] = selectedEnd.split(':').map(Number)
      const startsAtDate = new Date(year, monthNum - 1, dayNum, startH, startM, 0, 0)
      const endsAtDate = new Date(year, monthNum - 1, dayNum, endH, endM, 0, 0)
      const startsAt = startsAtDate.toISOString()
      const endsAt = endsAtDate.toISOString()
      const durationMinutes = Math.round((endsAtDate.getTime() - startsAtDate.getTime()) / 60000)

      const { data: meetingData, error: meetingErr } = await supabase
        .from('meetings')
        .insert({
          organization_id: orgId,
          mentee_offering_id: mo.id,
          mentee_id: menteeId,
          mentor_id: mentor.id,
          title: `Session with ${mentor.first_name}`,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: durationMinutes,
          status: 'scheduled',
        })
        .select()
        .single()

      if (meetingErr) { toast.error(meetingErr.message); return }

      const newMeeting = meetingData as Meeting
      setMyMeetings(prev => [newMeeting, ...prev])
      setMentorAllMeetings(prev => [...prev, newMeeting]) // Add to conflict list
      setShowScheduler(false)
      setSelectedDate('')
      setSelectedStart('')
      setSelectedEnd('')
      toast.success('Meeting scheduled!')

      // Notify the mentor per their prefs.
      if (mentor.user_id && menteeProfile) {
        const menteeName = `${menteeProfile.first_name} ${menteeProfile.last_name}`
        const when = startsAtDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        notifyUser({
          recipientUserId: mentor.user_id,
          organizationId: orgId,
          eventKey: 'meeting_scheduled_by_mentee',
          title: `${menteeName} scheduled a meeting`,
          body: when,
          link: '/meetings',
          category: 'meeting',
        })
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to schedule')
    } finally {
      setScheduling(false)
    }
  }

  function getEffectivePolicy(): CancellationPolicy {
    const off = mo?.offering
    if (!off || off.use_org_default_cancellation || !off.cancellation_policy) return orgCancelPolicy
    return off.cancellation_policy
  }

  function isWithinCancelWindow(m: Meeting): boolean {
    const policy = getEffectivePolicy()
    const windowMs = policy.cancel_window_unit === 'days'
      ? policy.cancel_window_value * 86400000
      : policy.cancel_window_value * 3600000
    return new Date(m.starts_at).getTime() - Date.now() >= windowMs
  }

  async function handleCancelMeeting() {
    if (!cancelTarget || !menteeId) return
    setCancelling(true)
    try {
      const { error: updateErr } = await supabase.from('meetings').update({
        status: 'cancelled' as const,
        cancelled_at: new Date().toISOString(),
        cancelled_by: menteeId,
        cancellation_reason: cancelReason.trim() || null,
      }).eq('id', cancelTarget.id)
      if (updateErr) { toast.error(updateErr.message); return }
      setMyMeetings(prev => prev.map(m => m.id === cancelTarget.id ? { ...m, status: 'cancelled' as const, cancelled_at: new Date().toISOString() } : m))
      toast.success('Meeting cancelled.')

      // Notify the mentor per their prefs.
      if (mentor?.user_id && menteeProfile && orgId) {
        const menteeName = `${menteeProfile.first_name} ${menteeProfile.last_name}`
        const when = new Date(cancelTarget.starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        notifyUser({
          recipientUserId: mentor.user_id,
          organizationId: orgId,
          eventKey: 'meeting_cancelled_by_mentee',
          title: `${menteeName} cancelled a meeting`,
          body: `${when}${cancelReason.trim() ? ` — "${cancelReason.trim()}"` : ''}`,
          link: '/meetings',
          category: 'meeting',
        })
      }

      setCancelTarget(null)
      setCancelReason('')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to cancel meeting')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <Skeleton count={5} className="h-16 w-full" gap="gap-3" />

  if (error || !mo) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => navigate('/my-engagements')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">&larr; Back to My Engagements</button>
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">{error || 'Engagement not found.'}</div>
      </div>
    )
  }

  const offering = mo.offering
  const meetingCountPerGrant = mo.meeting_count ?? offering?.meeting_count ?? 0
  const isCompleted = mo.status === 'completed'
  const period = mo.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/month' : period === 'weekly' ? '/week' : '/cycle'

  const allocation = computeAllocations({
    meetings: myMeetings,
    meetingCountPerGrant,
    allocationPeriod: period,
    grantMode,
    refreshMode,
    openedAt: mo.assigned_at,
    paidInvoiceDates,
  })

  // Sort chronologically (soonest first) for the Upcoming Meetings section.
  const upcomingMeetings = [...allocation.upcomingMeetings].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
  const pastMeetings = myMeetings.filter(m => new Date(m.ends_at) <= new Date() || m.status === 'cancelled')
  const canSchedule = !isCompleted && mentor && (allocation.unlimited || (allocation.availableToBook ?? 0) > 0)

  // Meeting duration from offering (defaults to 60 minutes).
  const meetingDurationMinutes = offering?.default_meeting_duration_minutes ?? 60

  // Bookable blocks for the selected date, stepped in 30-minute increments.
  const bookableBlocks = selectedDate
    ? generateBookableBlocks(selectedDate, meetingDurationMinutes, availability, mentorAllMeetings, 30)
    : []

  // Date options: next N days where N is the org setting scheduler_max_days_ahead.
  // When showAllDays is off, filter to only dates where the mentor has at
  // least one bookable block of the required length (not just any raw
  // availability).
  const allDateOptions: string[] = []
  const now = new Date()
  for (let i = 1; i <= maxDaysAhead; i++) {
    allDateOptions.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10))
  }
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

      {/* Credits */}
      <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
        <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Session Credits</h2>
        {allocation.unlimited ? (
          <p className="text-sm text-gray-500">Unlimited sessions — {allocation.used} completed</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{allocation.totalAllocated}</p>
                <p className="text-xs text-gray-500 mt-0.5">Granted so far</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">{allocation.used} completed · {allocation.reserved} scheduled</span>
                  <span className={`text-sm font-semibold ${(allocation.availableToBook ?? 0) === 0 && !isCompleted ? 'text-amber-600' : 'text-gray-900'}`}>
                    {allocation.availableToBook ?? 0} available
                  </span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                  {/* Completed (brand solid) */}
                  <div
                    className={`h-full transition-all ${isCompleted ? 'bg-green-400' : 'bg-brand'}`}
                    style={{ width: `${allocation.totalAllocated > 0 ? (allocation.used / allocation.totalAllocated) * 100 : 0}%` }}
                  />
                  {/* Reserved (brand translucent) */}
                  <div
                    className="h-full bg-brand/40 transition-all"
                    style={{ width: `${allocation.totalAllocated > 0 ? (allocation.reserved / allocation.totalAllocated) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Legend + next-grant hint */}
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand" />Completed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand/40" />Scheduled</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-gray-100 border border-gray-200" />Available</span>
              </div>
              <span className="text-gray-400">{meetingCountPerGrant} credits{periodLabel}</span>
            </div>

            {allocation.nextGrantHint && (
              <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
                {allocation.nextGrantHint}
              </p>
            )}

            {/* Blocked states */}
            {!isCompleted && allocation.totalAllocated === 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                No credits available yet. Your first batch unlocks once your first invoice is paid.
              </div>
            )}
            {!isCompleted && allocation.totalAllocated > 0 && (allocation.availableToBook ?? 0) === 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                You've used all of your currently-granted credits.
                {' '}
                {allocation.nextGrantHint ?? 'Wait for your next allocation to schedule more meetings.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule a meeting */}
      {canSchedule && (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Schedule a Meeting</h2>
            {!showScheduler && (
              <Button onClick={() => setShowScheduler(true)}>+ Schedule</Button>
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

              <div className="flex items-center gap-3 pt-1">
                <Button onClick={scheduleMeeting}
                  disabled={scheduling || !selectedDate || !selectedStart || !selectedEnd || !!conflictError}>
                  {scheduling ? 'Scheduling...' : 'Confirm & Book'}
                </Button>
                <Button variant="ghost" onClick={() => { setShowScheduler(false); setConflictError(null) }}>
                  Cancel
                </Button>
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
                {m.status === 'scheduled' && (
                  <button
                    onClick={() => setCancelTarget(m)}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    Cancel
                  </button>
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

      {/* Cancel meeting confirmation modal */}
      <Modal
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason('') }}
        title="Cancel Meeting"
        subtitle={cancelTarget ? `${new Date(cancelTarget.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date(cancelTarget.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : undefined}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => { setCancelTarget(null); setCancelReason('') }}>Keep Meeting</Button>
          <Button variant="danger" onClick={handleCancelMeeting} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel Meeting'}
          </Button>
        </>}
      >
        {cancelTarget && (() => {
          const withinWindow = isWithinCancelWindow(cancelTarget)
          const outcome = withinWindow
            ? getEffectivePolicy().cancelled_in_window
            : getEffectivePolicy().cancelled_outside_window
          return (
            <div className="space-y-4">
              {outcome === 'keep_credit' ? (
                <div className="flex items-start gap-2.5 rounded-md bg-green-50 border border-green-200 px-3 py-2.5">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-sm text-green-700">Your meeting credit will be returned and you can reschedule.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <p className="text-sm text-amber-700">{withinWindow ? 'This meeting credit will not be re-allocated.' : 'This is a late cancellation. Your meeting credit will not be re-allocated.'}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Let your mentor know why you're cancelling..."
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition resize-none"
                />
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
