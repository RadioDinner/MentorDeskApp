import type { Meeting } from '../types'

/**
 * Compute engagement credit usage from meetings.
 *
 * Credits are consumed when a meeting's end time has passed and
 * the meeting is not cancelled.
 *
 * A future scheduled meeting "reserves" a credit but doesn't
 * consume it until its end time passes.
 */
export function computeCredits(meetings: Meeting[], totalCredits: number) {
  const now = new Date()

  // Used: meetings whose end time has passed and not cancelled
  const usedMeetings = meetings.filter(
    m => new Date(m.ends_at) <= now && m.status !== 'cancelled'
  )

  // Upcoming: future meetings that are still scheduled (not cancelled)
  const upcomingMeetings = meetings.filter(
    m => new Date(m.ends_at) > now && m.status === 'scheduled'
  )

  const used = usedMeetings.length
  const reserved = upcomingMeetings.length
  const remaining = totalCredits > 0 ? Math.max(0, totalCredits - used) : null // null = unlimited
  const availableToBook = totalCredits > 0 ? Math.max(0, totalCredits - used - reserved) : null

  return {
    used,
    reserved,
    remaining,       // credits left after completed meetings
    availableToBook, // credits available for new bookings (factors in future reservations)
    usedMeetings,
    upcomingMeetings,
    totalCredits,
  }
}
