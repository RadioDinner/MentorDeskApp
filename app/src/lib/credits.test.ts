import { describe, it, expect } from 'vitest'
import { computeCredits, countCyclesElapsed, countGrants, computeAllocations } from './credits'
import type { Meeting } from '../types'

// Helpers
function makeMeeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: 'meeting-1',
    organization_id: 'org-1',
    mentor_id: 'mentor-1',
    mentee_id: 'mentee-1',
    mentee_offering_id: 'mo-1',
    engagement_session_id: null,
    title: null,
    description: null,
    starts_at: new Date(Date.now() - 3600_000).toISOString(),
    ends_at: new Date(Date.now() - 1800_000).toISOString(),
    status: 'completed',
    duration_minutes: 30,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    meeting_link: null,
    location: null,
    external_calendar_id: null,
    external_calendar_provider: null,
    external_calendar_event_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// Fixed timestamps for computeAllocations (which accepts injected `now`)
const TEST_NOW = new Date('2026-04-01T12:00:00Z')
const FIXED_FUTURE = '2026-04-02T12:00:00Z' // after TEST_NOW
const FIXED_PAST   = '2026-03-31T12:00:00Z' // before TEST_NOW

// Dynamic timestamps for computeCredits (uses real Date.now() internally)
const FUTURE = new Date(Date.now() + 86400_000).toISOString()
const PAST   = new Date(Date.now() - 86400_000).toISOString()

// ─────────────────────────────────────────────
// computeCredits
// ─────────────────────────────────────────────

describe('computeCredits', () => {
  it('counts used meetings (past + not cancelled)', () => {
    const meetings = [
      makeMeeting({ ends_at: PAST, status: 'completed' }),
      makeMeeting({ id: 'm2', ends_at: PAST, status: 'completed' }),
    ]
    const result = computeCredits(meetings, 10)
    expect(result.used).toBe(2)
  })

  it('does not count cancelled meetings as used', () => {
    const meetings = [
      makeMeeting({ ends_at: PAST, status: 'cancelled' }),
      makeMeeting({ id: 'm2', ends_at: PAST, status: 'completed' }),
    ]
    const result = computeCredits(meetings, 10)
    expect(result.used).toBe(1)
  })

  it('counts upcoming scheduled meetings as reserved', () => {
    const meetings = [
      makeMeeting({ id: 'm1', ends_at: FUTURE, status: 'scheduled' }),
      makeMeeting({ id: 'm2', ends_at: FUTURE, status: 'scheduled' }),
    ]
    const result = computeCredits(meetings, 10)
    expect(result.reserved).toBe(2)
  })

  it('does not count future cancelled meetings as reserved', () => {
    const meetings = [
      makeMeeting({ ends_at: FUTURE, status: 'cancelled' }),
    ]
    const result = computeCredits(meetings, 10)
    expect(result.reserved).toBe(0)
  })

  it('computes remaining correctly', () => {
    const meetings = [
      makeMeeting({ ends_at: PAST, status: 'completed' }),
    ]
    const result = computeCredits(meetings, 5)
    expect(result.remaining).toBe(4)
  })

  it('returns null remaining for unlimited (totalCredits = 0)', () => {
    const result = computeCredits([], 0)
    expect(result.remaining).toBeNull()
    expect(result.availableToBook).toBeNull()
  })

  it('clamps remaining to 0 when overspent', () => {
    const meetings = [
      makeMeeting({ id: 'm1', ends_at: PAST, status: 'completed' }),
      makeMeeting({ id: 'm2', ends_at: PAST, status: 'completed' }),
      makeMeeting({ id: 'm3', ends_at: PAST, status: 'completed' }),
    ]
    const result = computeCredits(meetings, 2)
    expect(result.remaining).toBe(0)
  })
})

// ─────────────────────────────────────────────
// countCyclesElapsed
// ─────────────────────────────────────────────

describe('countCyclesElapsed', () => {
  it('returns 0 if to <= from', () => {
    const d = new Date('2026-01-01')
    expect(countCyclesElapsed(d, d, 'weekly')).toBe(0)
    expect(countCyclesElapsed(d, new Date('2025-12-31'), 'weekly')).toBe(0)
  })

  it('counts weekly cycles', () => {
    const from = new Date('2026-01-01')
    expect(countCyclesElapsed(from, new Date('2026-01-07'), 'weekly')).toBe(0) // 6 days
    expect(countCyclesElapsed(from, new Date('2026-01-08'), 'weekly')).toBe(1) // exactly 7
    expect(countCyclesElapsed(from, new Date('2026-01-15'), 'weekly')).toBe(2) // 14 days
  })

  it('counts monthly cycles', () => {
    const from = new Date('2026-01-15')
    expect(countCyclesElapsed(from, new Date('2026-02-14'), 'monthly')).toBe(0) // not yet day 15
    expect(countCyclesElapsed(from, new Date('2026-02-15'), 'monthly')).toBe(1) // exactly 1 month
    expect(countCyclesElapsed(from, new Date('2026-03-15'), 'monthly')).toBe(2) // 2 months
  })

  it('returns 0 for per_cycle period', () => {
    const from = new Date('2026-01-01')
    const to = new Date('2026-12-31')
    expect(countCyclesElapsed(from, to, 'per_cycle')).toBe(0)
  })
})

// ─────────────────────────────────────────────
// countGrants
// ─────────────────────────────────────────────

describe('countGrants', () => {
  const openedAt = new Date('2026-01-01')
  const now = new Date('2026-04-01')

  it('on_open gives 1 grant immediately', () => {
    expect(countGrants('on_open', 'by_cycle', 'per_cycle', openedAt, [], now)).toBe(1)
  })

  it('on_first_payment gives 0 with no payments', () => {
    expect(countGrants('on_first_payment', 'by_cycle', 'weekly', openedAt, [], now)).toBe(0)
  })

  it('on_first_payment + no refresh gives 1 grant after first payment', () => {
    const paid = [new Date('2026-01-15')]
    expect(countGrants('on_first_payment', 'by_cycle', 'per_cycle', openedAt, paid, now)).toBe(1)
  })

  it('on_open + by_payment counts each payment additively', () => {
    const paid = [
      new Date('2026-01-15'),
      new Date('2026-02-15'),
      new Date('2026-03-15'),
    ]
    // 1 grant on open + 3 payments = 4 grants
    expect(countGrants('on_open', 'by_payment', 'per_cycle', openedAt, paid, now)).toBe(4)
  })

  it('on_first_payment + by_payment: first payment seeds grant, rest add', () => {
    const paid = [
      new Date('2026-01-15'),
      new Date('2026-02-15'),
    ]
    // 1 (on first payment) + 1 (second payment) = 2
    expect(countGrants('on_first_payment', 'by_payment', 'per_cycle', openedAt, paid, now)).toBe(2)
  })

  it('on_open + by_cycle weekly counts elapsed weeks', () => {
    const open = new Date('2026-01-01')
    const n = new Date('2026-01-22') // 21 days = 3 weeks elapsed
    // 1 + 3 = 4
    expect(countGrants('on_open', 'by_cycle', 'weekly', open, [], n)).toBe(4)
  })
})

// ─────────────────────────────────────────────
// computeAllocations — smoke tests
// ─────────────────────────────────────────────

describe('computeAllocations', () => {
  const baseInputs = {
    meetings: [],
    meetingCountPerGrant: 4,
    allocationPeriod: 'per_cycle' as const,
    grantMode: 'on_open' as const,
    refreshMode: 'by_cycle' as const,
    openedAt: '2026-01-01T00:00:00Z',
    paidInvoiceDates: [],
    now: TEST_NOW,
  }

  it('returns unlimited when meetingCountPerGrant is 0', () => {
    const result = computeAllocations({ ...baseInputs, meetingCountPerGrant: 0 })
    expect(result.unlimited).toBe(true)
    expect(result.availableToBook).toBeNull()
    expect(result.remaining).toBeNull()
  })

  it('computes total allocated correctly', () => {
    const result = computeAllocations(baseInputs)
    expect(result.grantsCount).toBe(1)
    expect(result.totalAllocated).toBe(4)
    expect(result.availableToBook).toBe(4)
  })

  it('reduces availableToBook by used + reserved', () => {
    const meetings = [
      makeMeeting({ id: 'm1', ends_at: FIXED_PAST, status: 'completed' }),
      makeMeeting({ id: 'm2', ends_at: FIXED_FUTURE, status: 'scheduled' }),
    ]
    const result = computeAllocations({ ...baseInputs, meetings })
    // 4 total - 1 used - 1 reserved = 2
    expect(result.availableToBook).toBe(2)
    expect(result.used).toBe(1)
    expect(result.reserved).toBe(1)
  })

  it('clamps availableToBook to 0', () => {
    const meetings = Array.from({ length: 6 }, (_, i) =>
      makeMeeting({ id: `m${i}`, ends_at: FIXED_PAST, status: 'completed' })
    )
    const result = computeAllocations({ ...baseInputs, meetings })
    expect(result.availableToBook).toBe(0)
  })

  it('returns nextGrantHint for unpaid first-payment grant', () => {
    const result = computeAllocations({
      ...baseInputs,
      grantMode: 'on_first_payment',
    })
    expect(result.nextGrantHint).toMatch(/invoice is paid/i)
    expect(result.grantsCount).toBe(0)
  })
})
