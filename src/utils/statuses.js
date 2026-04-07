export const DEFAULT_STATUSES = [
  'Lead',
  'Deciding',
  'Discovery Call Scheduled',
  'Waiting List',
  'JumpStart Your Freedom',
  '4x Mentoring',
  '2x Mentoring',
  '1x Mentoring',
  'Graduate',
]

export const DEFAULT_STATUS_COLORS = {
  'Lead':                     { bg: '#fdf4ff', color: '#c026d3' },
  'Deciding':                 { bg: '#fff7ed', color: '#ea580c' },
  'Discovery Call Scheduled': { bg: '#f0fdfa', color: '#0d9488' },
  'Waiting List':             { bg: '#f1f5f9', color: '#64748b' },
  'JumpStart Your Freedom':   { bg: '#eff6ff', color: '#3b82f6' },
  '4x Mentoring':             { bg: '#fef3c7', color: '#d97706' },
  '2x Mentoring':             { bg: '#fef3c7', color: '#d97706' },
  '1x Mentoring':             { bg: '#f0fdf4', color: '#16a34a' },
  'Graduate':                 { bg: '#f5f3ff', color: '#7c3aed' },
}

// A small palette for dynamically-added statuses that have no assigned color
const DYNAMIC_COLORS = [
  { bg: '#fef9c3', color: '#ca8a04' },
  { bg: '#dbeafe', color: '#2563eb' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#e0e7ff', color: '#4338ca' },
  { bg: '#fff1f2', color: '#be123c' },
  { bg: '#f3e8ff', color: '#7e22ce' },
]

export function getStatusColor(status, index = 0) {
  if (DEFAULT_STATUS_COLORS[status]) return DEFAULT_STATUS_COLORS[status]
  const i = index < 0 ? 0 : index
  return DYNAMIC_COLORS[i % DYNAMIC_COLORS.length]
}

export function parseStatuses(value) {
  if (!value) return DEFAULT_STATUSES
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
    return DEFAULT_STATUSES
  } catch {
    return DEFAULT_STATUSES
  }
}
