/**
 * IANA timezone dropdown. Uses Intl.supportedValuesOf when available (modern
 * browsers / Node 18+) with a curated fallback list for older runtimes.
 * Includes an explicit "Browser default" option that stores NULL in the DB.
 */

function getAllTimezones(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    if (typeof intl.supportedValuesOf === 'function') {
      return intl.supportedValuesOf('timeZone')
    }
  } catch {
    // ignore
  }
  return FALLBACK_TIMEZONES
}

// Fallback list of commonly-used IANA timezones for browsers lacking
// Intl.supportedValuesOf. Intentionally not exhaustive.
const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

interface Props {
  value: string | null
  onChange: (value: string | null) => void
  id?: string
  className?: string
  allowNull?: boolean // show "Browser default" option
}

export default function TimezoneSelect({ value, onChange, id, className, allowNull = true }: Props) {
  const timezones = getAllTimezones()
  const browserTz = getBrowserTimezone()

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className={
        className ??
        'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'
      }
    >
      {allowNull && (
        <option value="">Browser default ({browserTz})</option>
      )}
      {timezones.map(tz => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  )
}
