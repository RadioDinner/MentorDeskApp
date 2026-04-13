/**
 * Shared formatters used across the app.
 *
 * Before this module existed, currency and date formatting was duplicated
 * (with minor drifts) in InvoicingPage, PayrollPage, InvoicePrintPage,
 * MenteeBillingPage, AuditLogPage, and several components. Centralizing
 * here so tweaks (locale, currency default, date style) happen in one place.
 */

/**
 * Format a cents integer as a currency string. Matches the previous
 * inline implementations: `Intl.NumberFormat('en-US', { style: 'currency' })`.
 *
 * @param cents    Amount in minor units (cents).
 * @param currency ISO currency code. Defaults to USD.
 */
export function formatMoney(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

/**
 * Format a whole-dollar amount as currency. Use for pre-divided values
 * (e.g. payroll `estimatedPay` which is already in dollars). Equivalent
 * to the previous `money(n)` helper in PayrollPage.
 */
export function formatDollars(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

type DateInput = string | number | Date

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input
  return new Date(input)
}

/**
 * Short date: "Apr 13" (no year). Used in list rows and timeline markers.
 */
export function formatDateShort(input: DateInput): string {
  return toDate(input).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Standard date: "Apr 13, 2026". Used in detail views and tables.
 */
export function formatDate(input: DateInput): string {
  return toDate(input).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Long date: "April 13, 2026". Used in headers and invoice PDFs.
 */
export function formatDateLong(input: DateInput): string {
  return toDate(input).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Time only: "9:30 AM". Used in meeting lists.
 */
export function formatTime(input: DateInput): string {
  return toDate(input).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Full date + time: "Apr 13, 2026, 9:30 AM".
 */
export function formatDateTime(input: DateInput): string {
  return `${formatDate(input)}, ${formatTime(input)}`
}

/**
 * Weekday + date: "Mon, Apr 13". Used in scheduler day pickers.
 */
export function formatWeekdayDate(input: DateInput): string {
  return toDate(input).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Parse a date-only string ("YYYY-MM-DD") as local time to avoid the
 * classic "1 day earlier" bug from UTC interpretation. Returns a Date
 * at local midnight.
 */
export function parseDateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`)
}
