import { describe, it, expect } from 'vitest'
import {
  formatMoney,
  formatDollars,
  formatDate,
  formatDateShort,
  formatDateLong,
  formatTime,
  formatDateTime,
  formatWeekdayDate,
  parseDateOnly,
} from './format'

describe('formatMoney', () => {
  it('formats cents as USD by default', () => {
    expect(formatMoney(1000)).toBe('$10.00')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(9999)).toBe('$99.99')
    expect(formatMoney(100000)).toBe('$1,000.00')
  })

  it('formats negative cents', () => {
    expect(formatMoney(-500)).toBe('-$5.00')
  })

  it('respects currency parameter', () => {
    expect(formatMoney(1000, 'EUR')).toContain('10.00')
  })
})

describe('formatDollars', () => {
  it('formats whole dollar amounts', () => {
    expect(formatDollars(10)).toBe('$10.00')
    expect(formatDollars(1000)).toBe('$1,000.00')
    expect(formatDollars(0)).toBe('$0.00')
  })

  it('formats fractional dollars', () => {
    expect(formatDollars(10.5)).toBe('$10.50')
  })
})

describe('formatDateShort', () => {
  it('formats date string as "Mon DD"', () => {
    expect(formatDateShort('2026-01-15')).toBe('Jan 15')
    expect(formatDateShort('2026-12-31')).toBe('Dec 31')
  })

  it('accepts Date objects', () => {
    const d = new Date('2026-04-13T00:00:00')
    expect(formatDateShort(d)).toBe('Apr 13')
  })
})

describe('formatDate', () => {
  it('formats as "Mon DD, YYYY"', () => {
    expect(formatDate('2026-04-13')).toBe('Apr 13, 2026')
    expect(formatDate('2024-01-01')).toBe('Jan 1, 2024')
  })
})

describe('formatDateLong', () => {
  it('formats as "Month DD, YYYY"', () => {
    expect(formatDateLong('2026-04-13')).toBe('April 13, 2026')
    expect(formatDateLong('2024-01-01')).toBe('January 1, 2024')
  })
})

describe('parseDateOnly', () => {
  it('parses YYYY-MM-DD at local midnight', () => {
    const d = parseDateOnly('2026-04-13')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(3) // April = 3
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('does not lose a day due to UTC offset', () => {
    // UTC-N timezones would shift '2026-04-13' to Apr 12 if parsed as UTC.
    // parseDateOnly pins to local midnight, so date must stay Apr 13.
    const d = parseDateOnly('2026-04-13')
    expect(d.getDate()).toBe(13)
  })
})

describe('formatTime', () => {
  it('formats ISO datetime to time string', () => {
    // Create a date at 9:30 AM local time
    const d = new Date(2026, 3, 13, 9, 30, 0)
    const result = formatTime(d)
    expect(result).toBe('9:30 AM')
  })

  it('formats noon correctly', () => {
    const d = new Date(2026, 3, 13, 12, 0, 0)
    expect(formatTime(d)).toBe('12:00 PM')
  })
})

describe('formatDateTime', () => {
  it('combines date and time', () => {
    const d = new Date(2026, 3, 13, 9, 30, 0)
    const result = formatDateTime(d)
    expect(result).toContain('Apr 13, 2026')
    expect(result).toContain('9:30 AM')
  })
})

describe('formatWeekdayDate', () => {
  it('includes weekday abbreviation', () => {
    // April 13, 2026 is a Monday
    const result = formatWeekdayDate('2026-04-13')
    expect(result).toMatch(/^Mon, Apr 13$/)
  })
})
