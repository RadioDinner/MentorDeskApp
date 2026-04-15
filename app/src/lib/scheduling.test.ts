import { describe, it, expect } from 'vitest'
import { formatTimeDisplay, hasConflict, getAvailableSlots } from './scheduling'
import type { AvailabilitySchedule, Meeting } from '../types'

// ─────────────────────────────────────────────
// formatTimeDisplay
// ─────────────────────────────────────────────

describe('formatTimeDisplay', () => {
  it('formats midnight as 12:00 AM', () => {
    expect(formatTimeDisplay('00:00')).toBe('12:00 AM')
  })

  it('formats noon as 12:00 PM', () => {
    expect(formatTimeDisplay('12:00')).toBe('12:00 PM')
  })

  it('formats morning times', () => {
    expect(formatTimeDisplay('09:00')).toBe('9:00 AM')
    expect(formatTimeDisplay('09:30')).toBe('9:30 AM')
  })

  it('formats afternoon times', () => {
    expect(formatTimeDisplay('13:00')).toBe('1:00 PM')
    expect(formatTimeDisplay('17:45')).toBe('5:45 PM')
  })

  it('formats 11:59 PM correctly', () => {
    expect(formatTimeDisplay('23:59')).toBe('11:59 PM')
  })
})

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeSchedule(overrides: Partial<AvailabilitySchedule>): AvailabilitySchedule {
  return {
    id: 'sched-1',
    organization_id: 'org-1',
    staff_id: 'staff-1',
    day_of_week: 1, // Monday
    start_time: '09:00',
    end_time: '17:00',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

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
    starts_at: '2026-04-13T09:00:00',
    ends_at: '2026-04-13T10:00:00',
    status: 'scheduled',
    duration_minutes: 60,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    meeting_link: null,
    location: null,
    external_calendar_id: null,
    external_calendar_provider: null,
    external_calendar_event_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────
// hasConflict
// Note: uses local timezone for date comparison.
// All timestamps below are written as local (no Z suffix) so they
// remain consistent regardless of test environment timezone.
// ─────────────────────────────────────────────

describe('hasConflict', () => {
  const date = '2026-04-13' // A Monday

  it('returns false with no meetings', () => {
    expect(hasConflict(date, '09:00', '10:00', [])).toBe(false)
  })

  it('returns false for cancelled meetings', () => {
    const meeting = makeMeeting({ status: 'cancelled' })
    expect(hasConflict(date, '09:00', '10:00', [meeting])).toBe(false)
  })

  it('returns false when meeting is on a different date', () => {
    // Meeting on April 14 (starts_at has local date April 14)
    const meeting = makeMeeting({ starts_at: '2026-04-14T09:00:00', ends_at: '2026-04-14T10:00:00' })
    expect(hasConflict(date, '09:00', '10:00', [meeting])).toBe(false)
  })

  it('detects exact overlap', () => {
    const meeting = makeMeeting({ starts_at: '2026-04-13T09:00:00', ends_at: '2026-04-13T10:00:00' })
    expect(hasConflict(date, '09:00', '10:00', [meeting])).toBe(true)
  })

  it('detects partial overlap — proposed starts during meeting', () => {
    // Meeting: 09:00-10:00. Proposed: 09:30-10:30
    const meeting = makeMeeting({ starts_at: '2026-04-13T09:00:00', ends_at: '2026-04-13T10:00:00' })
    expect(hasConflict(date, '09:30', '10:30', [meeting])).toBe(true)
  })

  it('detects partial overlap — proposed ends during meeting', () => {
    // Meeting: 10:00-11:00. Proposed: 09:30-10:30
    const meeting = makeMeeting({ starts_at: '2026-04-13T10:00:00', ends_at: '2026-04-13T11:00:00' })
    expect(hasConflict(date, '09:30', '10:30', [meeting])).toBe(true)
  })

  it('returns false for adjacent meetings (no overlap)', () => {
    // Meeting: 09:00-10:00. Proposed: 10:00-11:00 — adjacent, not overlapping
    const meeting = makeMeeting({ starts_at: '2026-04-13T09:00:00', ends_at: '2026-04-13T10:00:00' })
    expect(hasConflict(date, '10:00', '11:00', [meeting])).toBe(false)
  })
})

// ─────────────────────────────────────────────
// getAvailableSlots
// ─────────────────────────────────────────────

describe('getAvailableSlots', () => {
  // April 13, 2026 is a Monday (day_of_week = 1)
  const date = '2026-04-13'

  it('returns empty when no availability blocks for the day', () => {
    const schedule = [makeSchedule({ day_of_week: 2 })] // Tuesday
    expect(getAvailableSlots(date, schedule, [])).toEqual([])
  })

  it('returns empty when availability block is inactive', () => {
    const schedule = [makeSchedule({ is_active: false })]
    expect(getAvailableSlots(date, schedule, [])).toEqual([])
  })

  it('returns full block when no meetings booked', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '11:00' })]
    const slots = getAvailableSlots(date, schedule, [])
    expect(slots).toEqual([{ start: '09:00', end: '11:00' }])
  })

  it('subtracts a meeting from the middle of the block', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '11:00' })]
    const meeting = makeMeeting({
      starts_at: '2026-04-13T10:00:00',
      ends_at: '2026-04-13T10:30:00',
    })
    const slots = getAvailableSlots(date, schedule, [meeting])
    expect(slots).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '10:30', end: '11:00' },
    ])
  })

  it('subtracts a meeting at the start', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '11:00' })]
    const meeting = makeMeeting({
      starts_at: '2026-04-13T09:00:00',
      ends_at: '2026-04-13T10:00:00',
    })
    const slots = getAvailableSlots(date, schedule, [meeting])
    expect(slots).toEqual([{ start: '10:00', end: '11:00' }])
  })

  it('subtracts a meeting at the end', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '11:00' })]
    const meeting = makeMeeting({
      starts_at: '2026-04-13T10:30:00',
      ends_at: '2026-04-13T11:00:00',
    })
    const slots = getAvailableSlots(date, schedule, [meeting])
    expect(slots).toEqual([{ start: '09:00', end: '10:30' }])
  })

  it('returns empty when meeting fills entire block', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '10:00' })]
    const meeting = makeMeeting({
      starts_at: '2026-04-13T09:00:00',
      ends_at: '2026-04-13T10:00:00',
    })
    const slots = getAvailableSlots(date, schedule, [meeting])
    expect(slots).toEqual([])
  })

  it('ignores cancelled meetings', () => {
    const schedule = [makeSchedule({ start_time: '09:00', end_time: '11:00' })]
    const meeting = makeMeeting({
      starts_at: '2026-04-13T09:00:00',
      ends_at: '2026-04-13T10:00:00',
      status: 'cancelled',
    })
    const slots = getAvailableSlots(date, schedule, [meeting])
    expect(slots).toEqual([{ start: '09:00', end: '11:00' }])
  })
})
