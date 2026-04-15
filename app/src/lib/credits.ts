import type { Meeting, AllocationPeriod, AllocationGrantMode, AllocationRefreshMode } from '../types'

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

// ────────────────────────────────────────────────────────────────────────
// Allocation model (org-configurable)
// ────────────────────────────────────────────────────────────────────────

export interface AllocationInputs {
  meetings: Meeting[]
  meetingCountPerGrant: number            // engagement's meeting_count
  allocationPeriod: AllocationPeriod      // engagement's allocation_period
  grantMode: AllocationGrantMode          // org setting
  refreshMode: AllocationRefreshMode      // org setting
  openedAt: string                        // mentee_offering.assigned_at (ISO)
  paidInvoiceDates: string[]              // list of ISO paid_at timestamps (only paid invoices)
  now?: Date                              // inject for tests
}

export interface AllocationResult {
  grantsCount: number           // how many allocation batches have been granted so far
  totalAllocated: number        // grantsCount * meetingCountPerGrant (null if unlimited)
  used: number
  reserved: number
  availableToBook: number | null // null = unlimited (meetingCountPerGrant <= 0)
  remaining: number | null       // credits remaining after completed (excludes reserved)
  nextGrantHint: string | null   // human-readable hint of when the next batch arrives
  usedMeetings: Meeting[]
  upcomingMeetings: Meeting[]
  /** When true, the engagement has no cap (meetingCountPerGrant <= 0). */
  unlimited: boolean
}

/**
 * Count whole cycles elapsed between `from` and `to` for the given period.
 *
 * A cycle boundary is anchored on the day/hour of `from`. For monthly, the
 * anchor is the day-of-month of `from`; we only tick over once `to` reaches
 * that same day in the next month. Weekly uses 7-day increments from `from`.
 * `per_cycle` is non-recurring (always 0 here — the initial grant is all
 * the mentee ever gets from cycle refresh; payment refresh is additive).
 */
export function countCyclesElapsed(from: Date, to: Date, period: AllocationPeriod): number {
  if (to.getTime() <= from.getTime()) return 0
  if (period === 'weekly') {
    return Math.floor((to.getTime() - from.getTime()) / (7 * 86400000))
  }
  if (period === 'monthly') {
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
    // If we haven't passed the anchor day-of-month yet this month, back off one
    if (to.getDate() < from.getDate()) months -= 1
    return Math.max(0, months)
  }
  // per_cycle: no recurring refresh
  return 0
}

/**
 * Compute the number of allocation grants for an engagement given the org's
 * grant/refresh settings, the opened-at timestamp, any paid invoices, and
 * the current time.
 *
 * Grant model:
 *   - grantMode='on_open'          → 1 grant immediately at openedAt
 *   - grantMode='on_first_payment' → 1 grant at the first paid invoice
 *   - refreshMode='by_cycle'       → +1 grant per full cycle elapsed since
 *                                    the anchor (openedAt or firstPaidAt)
 *   - refreshMode='by_payment'     → +1 grant per subsequent paid invoice
 *                                    (first payment counted only if it
 *                                    wasn't already used to seed the grant)
 *
 * Returns 0 if grantMode is 'on_first_payment' and nothing has been paid.
 */
export function countGrants(
  grantMode: AllocationGrantMode,
  refreshMode: AllocationRefreshMode,
  allocationPeriod: AllocationPeriod,
  openedAt: Date,
  paidInvoiceDates: Date[],
  now: Date,
): number {
  // Sort paid invoices oldest first so "first payment" is deterministic.
  const sortedPaid = [...paidInvoiceDates].sort((a, b) => a.getTime() - b.getTime())

  let grants = 0
  let anchor: Date | null = null

  if (grantMode === 'on_open') {
    grants = 1
    anchor = openedAt
  } else {
    // on_first_payment
    if (sortedPaid.length === 0) return 0
    grants = 1
    anchor = sortedPaid[0]
  }

  if (refreshMode === 'by_cycle') {
    if (anchor) {
      grants += countCyclesElapsed(anchor, now, allocationPeriod)
    }
  } else {
    // by_payment: each additional paid invoice adds one grant. If grant_mode
    // was on_first_payment we've already counted the first payment, so skip
    // it. If grant_mode was on_open, EVERY paid invoice is additive.
    if (grantMode === 'on_first_payment') {
      grants += Math.max(0, sortedPaid.length - 1)
    } else {
      grants += sortedPaid.length
    }
  }

  return grants
}

/**
 * Full allocation breakdown for the mentee UI: how many meetings have been
 * granted, used, reserved, and how many are available to book right now.
 */
export function computeAllocations(inputs: AllocationInputs): AllocationResult {
  const now = inputs.now ?? new Date()
  const openedAt = new Date(inputs.openedAt)
  const paidDates = inputs.paidInvoiceDates.map(s => new Date(s))

  const usedMeetings = inputs.meetings.filter(
    m => new Date(m.ends_at) <= now && m.status !== 'cancelled'
  )
  const upcomingMeetings = inputs.meetings.filter(
    m => new Date(m.ends_at) > now && m.status === 'scheduled'
  )
  const used = usedMeetings.length
  const reserved = upcomingMeetings.length

  const unlimited = !inputs.meetingCountPerGrant || inputs.meetingCountPerGrant <= 0
  if (unlimited) {
    return {
      grantsCount: 0,
      totalAllocated: 0,
      used,
      reserved,
      availableToBook: null,
      remaining: null,
      nextGrantHint: null,
      usedMeetings,
      upcomingMeetings,
      unlimited: true,
    }
  }

  const grantsCount = countGrants(
    inputs.grantMode,
    inputs.refreshMode,
    inputs.allocationPeriod,
    openedAt,
    paidDates,
    now,
  )
  const totalAllocated = grantsCount * inputs.meetingCountPerGrant
  const availableToBook = Math.max(0, totalAllocated - used - reserved)
  const remaining = Math.max(0, totalAllocated - used)

  // Human-readable hint for when the next grant will arrive.
  let nextGrantHint: string | null = null
  if (grantsCount === 0) {
    nextGrantHint = 'Credits will unlock once your first invoice is paid.'
  } else if (inputs.refreshMode === 'by_payment') {
    nextGrantHint = `Next ${inputs.meetingCountPerGrant} credits unlock when your next invoice is paid.`
  } else if (inputs.refreshMode === 'by_cycle' && inputs.allocationPeriod !== 'per_cycle') {
    // Compute the next cycle boundary from the anchor
    const sortedPaid = [...paidDates].sort((a, b) => a.getTime() - b.getTime())
    const anchor = inputs.grantMode === 'on_first_payment' && sortedPaid.length > 0
      ? sortedPaid[0]
      : openedAt
    const elapsed = countCyclesElapsed(anchor, now, inputs.allocationPeriod)
    const next = new Date(anchor)
    if (inputs.allocationPeriod === 'weekly') {
      next.setDate(next.getDate() + (elapsed + 1) * 7)
    } else if (inputs.allocationPeriod === 'monthly') {
      next.setMonth(next.getMonth() + (elapsed + 1))
    }
    nextGrantHint = `Next ${inputs.meetingCountPerGrant} credits arrive ${next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
  }

  return {
    grantsCount,
    totalAllocated,
    used,
    reserved,
    availableToBook,
    remaining,
    nextGrantHint,
    usedMeetings,
    upcomingMeetings,
    unlimited: false,
  }
}
