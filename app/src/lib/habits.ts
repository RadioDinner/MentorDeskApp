import type { HabitDurationMode, MenteeHabit, MenteeHabitStatus, MenteeHabitStepLog } from '../types'

// ── Date helpers ─────────────────────────────────────────────────────────

/** YYYY-MM-DD for the local calendar day (stable for the mentee's own timezone). */
export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add `n` days to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
export function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + n)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Days from `aISO` to `bISO` (positive if b >= a). */
export function diffDays(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number)
  const [by, bm, bd] = bISO.split('-').map(Number)
  const a = new Date(ay, (am ?? 1) - 1, ad ?? 1).getTime()
  const b = new Date(by, (bm ?? 1) - 1, bd ?? 1).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

// ── Duration helpers ─────────────────────────────────────────────────────

export interface DurationFields {
  duration_mode: HabitDurationMode
  duration_days: number | null
  goal_successful_days: number | null
}

/** Human-readable summary of a habit/mentee_habit's duration configuration. */
export function durationSummary(d: DurationFields): string {
  switch (d.duration_mode) {
    case 'fixed_days':
      return `${d.duration_days ?? 0} day${d.duration_days === 1 ? '' : 's'}`
    case 'goal_x_of_y':
      return `${d.goal_successful_days ?? 0} of ${d.duration_days ?? 0} days`
    case 'until_x_successful':
      return `until ${d.goal_successful_days ?? 0} successful day${d.goal_successful_days === 1 ? '' : 's'}`
  }
}

/**
 * Compute the end_date for a newly assigned mentee_habit.
 * Returns null for `until_x_successful` (open-ended).
 */
export function computeEndDate(startISO: string, d: DurationFields): string | null {
  if (d.duration_mode === 'until_x_successful') return null
  const days = d.duration_days ?? 0
  // end_date is inclusive; a 30-day habit starting today ends on start + 29 days.
  return addDaysISO(startISO, Math.max(0, days - 1))
}

// ── Day success / progress helpers ───────────────────────────────────────

/**
 * Given a set of step logs and a step count, returns the set of YYYY-MM-DD
 * dates for which ALL steps are logged (i.e., successful days).
 */
export function successfulDatesFromLogs(
  logs: Pick<MenteeHabitStepLog, 'log_date' | 'mentee_habit_step_id'>[],
  stepCount: number,
): Set<string> {
  if (stepCount === 0) return new Set()
  const byDate: Record<string, Set<string>> = {}
  for (const l of logs) {
    if (!byDate[l.log_date]) byDate[l.log_date] = new Set()
    byDate[l.log_date].add(l.mentee_habit_step_id)
  }
  const out = new Set<string>()
  for (const [date, set] of Object.entries(byDate)) {
    if (set.size >= stepCount) out.add(date)
  }
  return out
}

/** Successful day count as an integer. */
export function successfulDayCount(
  logs: Pick<MenteeHabitStepLog, 'log_date' | 'mentee_habit_step_id'>[],
  stepCount: number,
): number {
  return successfulDatesFromLogs(logs, stepCount).size
}

/**
 * Decide what the mentee_habit status should be given the latest progress.
 * Returns one of: 'active' | 'completed' | 'abandoned'.
 *
 *   fixed_days          → completed when today > end_date
 *   goal_x_of_y         → completed when successful days >= goal (regardless of remaining),
 *                         abandoned when today > end_date and goal unmet
 *   until_x_successful  → completed when successful days >= goal
 */
export function computeStatus(
  mh: Pick<MenteeHabit,
    'duration_mode_snapshot' | 'duration_days_snapshot' | 'goal_successful_days_snapshot' | 'start_date' | 'end_date'>,
  successfulDays: number,
  todayStr: string = todayISO(),
): MenteeHabitStatus {
  const { duration_mode_snapshot: mode, goal_successful_days_snapshot: goal, end_date } = mh
  if (mode === 'fixed_days') {
    if (end_date && todayStr > end_date) return 'completed'
    return 'active'
  }
  if (mode === 'goal_x_of_y') {
    if (goal !== null && successfulDays >= goal) return 'completed'
    if (end_date && todayStr > end_date) return 'abandoned'
    return 'active'
  }
  // until_x_successful
  if (goal !== null && successfulDays >= goal) return 'completed'
  return 'active'
}

