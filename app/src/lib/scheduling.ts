import type { AvailabilitySchedule, Meeting } from '../types'

export interface TimeSlot {
  start: string // HH:MM
  end: string   // HH:MM
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

  // Get meetings on this date that are not cancelled
  const meetingsOnDate = existingMeetings.filter(m => {
    if (m.status === 'cancelled') return false
    const meetingDate = m.starts_at.slice(0, 10)
    return meetingDate === date
  })

  // For each availability block, subtract booked meeting times
  const slots: TimeSlot[] = []

  for (const block of dayBlocks) {
    const blockStart = timeToMinutes(block.start_time)
    const blockEnd = timeToMinutes(block.end_time)

    // Collect booked intervals within this block
    const bookedIntervals: { start: number; end: number }[] = []
    for (const m of meetingsOnDate) {
      const mStart = timeToMinutes(m.starts_at.slice(11, 16))
      const mEnd = timeToMinutes(m.ends_at.slice(11, 16))
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
 * Check if a proposed meeting time conflicts with existing meetings.
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
    if (m.starts_at.slice(0, 10) !== date) return false
    const mStart = timeToMinutes(m.starts_at.slice(11, 16))
    const mEnd = timeToMinutes(m.ends_at.slice(11, 16))
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
