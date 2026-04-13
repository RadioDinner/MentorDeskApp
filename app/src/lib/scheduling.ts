import type { AvailabilitySchedule, Meeting } from '../types'

export interface TimeSlot {
  start: string // HH:MM
  end: string   // HH:MM
}

/**
 * Convert a stored UTC timestamp to local wall-clock YYYY-MM-DD + minutes.
 * Meetings are stored as TIMESTAMPTZ (UTC), but mentor availability is in
 * wall-clock HH:MM, so we must convert before comparing.
 */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Compute available time slots for a mentor on a given date.
 *
 * Takes the mentor's recurring availability blocks for that day of week,
 * then subtracts any existing booked meetings (non-cancelled) that overlap.
 *
 * Future: will also subtract external calendar blocks (Google, Outlook).
 */
export function getAvailableSlots(
  date: string,
  availability: AvailabilitySchedule[],
  existingMeetings: Meeting[],
): TimeSlot[] {
  const dayOfWeek = new Date(date + 'T00:00:00').getDay()
  const dayBlocks = availability.filter(a => a.day_of_week === dayOfWeek && a.is_active)

  if (dayBlocks.length === 0) return []

  // Get meetings on this date that are not cancelled.
  // Compare in the viewer's LOCAL timezone: convert each meeting's UTC
  // starts_at to a Date, then derive a local YYYY-MM-DD key.
  const meetingsOnDate = existingMeetings.filter(m => {
    if (m.status === 'cancelled') return false
    const meetingStart = new Date(m.starts_at)
    return localDateKey(meetingStart) === date
  })

  // For each availability block, subtract booked meeting times
  const slots: TimeSlot[] = []

  for (const block of dayBlocks) {
    const blockStart = timeToMinutes(block.start_time)
    const blockEnd = timeToMinutes(block.end_time)

    // Collect booked intervals within this block
    const bookedIntervals: { start: number; end: number }[] = []
    for (const m of meetingsOnDate) {
      const mStart = localMinutes(new Date(m.starts_at))
      const mEnd = localMinutes(new Date(m.ends_at))
      // Only include if it overlaps with this block
      if (mStart < blockEnd && mEnd > blockStart) {
        bookedIntervals.push({
          start: Math.max(mStart, blockStart),
          end: Math.min(mEnd, blockEnd),
        })
      }
    }

    // Sort booked intervals by start time
    bookedIntervals.sort((a, b) => a.start - b.start)

    // Compute free slots by subtracting booked intervals
    let cursor = blockStart
    for (const booked of bookedIntervals) {
      if (cursor < booked.start) {
        slots.push({
          start: minutesToTime(cursor),
          end: minutesToTime(booked.start),
        })
      }
      cursor = Math.max(cursor, booked.end)
    }
    // Remaining time after last booking
    if (cursor < blockEnd) {
      slots.push({
        start: minutesToTime(cursor),
        end: minutesToTime(blockEnd),
      })
    }
  }

  return slots
}

/**
 * Generate fixed-length bookable blocks within a mentor's available slots
 * on a given date. Blocks are stepped by `stepMinutes` (default 30), so a
 * 60-minute block with a 30-minute step over a 9:00-11:00 window yields
 * 9:00-10:00, 9:30-10:30, and 10:00-11:00.
 */
export function generateBookableBlocks(
  date: string,
  durationMinutes: number,
  availability: AvailabilitySchedule[],
  existingMeetings: Meeting[],
  stepMinutes: number = 30,
): TimeSlot[] {
  if (!durationMinutes || durationMinutes <= 0) return []
  const freeSlots = getAvailableSlots(date, availability, existingMeetings)
  const blocks: TimeSlot[] = []
  for (const slot of freeSlots) {
    const slotStart = timeToMinutes(slot.start)
    const slotEnd = timeToMinutes(slot.end)
    for (let t = slotStart; t + durationMinutes <= slotEnd; t += stepMinutes) {
      blocks.push({
        start: minutesToTime(t),
        end: minutesToTime(t + durationMinutes),
      })
    }
  }
  return blocks
}

/**
 * Check if a proposed meeting time conflicts with existing meetings.
 * `date` is the wall-clock local date (YYYY-MM-DD), `startTime`/`endTime`
 * are wall-clock HH:MM. Meetings are stored in UTC, so we parse them to
 * Date and compare in the viewer's local timezone.
 */
export function hasConflict(
  date: string,
  startTime: string,
  endTime: string,
  existingMeetings: Meeting[],
): boolean {
  const propStart = timeToMinutes(startTime)
  const propEnd = timeToMinutes(endTime)

  return existingMeetings.some(m => {
    if (m.status === 'cancelled') return false
    const mStartDate = new Date(m.starts_at)
    if (localDateKey(mStartDate) !== date) return false
    const mEndDate = new Date(m.ends_at)
    const mStart = localMinutes(mStartDate)
    const mEnd = localMinutes(mEndDate)
    return propStart < mEnd && propEnd > mStart
  })
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}
