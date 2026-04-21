/**
 * Catalog of in-app notification events users can turn on/off per channel.
 *
 * Each entry names the event, explains who it's for, sets sensible defaults,
 * and is grouped so the preferences UI can render clean sections.
 *
 * To add a new event: append an entry here, then call notifyUser(eventKey)
 * from wherever that event actually happens in the codebase.
 */

export type NotificationChannel = 'inApp' | 'email' | 'sms'

export type ChannelPrefs = {
  inApp: boolean
  email: boolean
  sms: boolean
}

/** Internal role buckets used only to decide which events to SHOW in
 *  each user's preferences UI. Staff (non-mentoring) roles see the mentor
 *  set since they commonly shadow mentors. */
export type NotificationAudience = 'mentee' | 'mentor' | 'both'

export interface NotificationEventDef {
  key: string
  label: string
  description: string
  group: string
  audience: NotificationAudience
  defaults: ChannelPrefs
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  // ── Mentor-facing: something the mentee did ────────────────────────
  {
    key: 'meeting_scheduled_by_mentee',
    label: 'Mentee scheduled a meeting',
    description: 'A mentee books a new meeting on your calendar.',
    group: 'Meeting changes',
    audience: 'mentor',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'meeting_cancelled_by_mentee',
    label: 'Mentee cancelled a meeting',
    description: 'A mentee cancels a previously booked meeting.',
    group: 'Meeting changes',
    audience: 'mentor',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'lesson_completed_by_mentee',
    label: 'Mentee completed a lesson',
    description: 'Fires every time one of your mentees finishes a lesson.',
    group: 'Mentee progress',
    audience: 'mentor',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'course_completed_by_mentee',
    label: 'Mentee completed a course',
    description: 'A mentee finishes every lesson in a course.',
    group: 'Mentee progress',
    audience: 'mentor',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'habit_checkin_by_mentee',
    label: "Mentee completed today's habit",
    description: 'A mentee checks off every step of a habit for the day.',
    group: 'Mentee progress',
    audience: 'mentor',
    defaults: { inApp: true, email: false, sms: false },
  },

  // ── Mentee-facing: something the mentor / system did ───────────────
  {
    key: 'course_assigned',
    label: 'Assigned a new course',
    description: 'Your mentor or admin assigns you a new course.',
    group: 'Assignments',
    audience: 'mentee',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'meeting_scheduled_by_mentor',
    label: 'Mentor scheduled a meeting',
    description: 'Your mentor books a new meeting with you.',
    group: 'Meeting changes',
    audience: 'mentee',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'meeting_cancelled_by_mentor',
    label: 'Mentor cancelled a meeting',
    description: 'Your mentor cancels a previously booked meeting.',
    group: 'Meeting changes',
    audience: 'mentee',
    defaults: { inApp: true, email: false, sms: false },
  },
  {
    key: 'lesson_progress_reset',
    label: 'Mentor reset your progress',
    description: 'Your mentor resets progress on one of your courses or lessons.',
    group: 'Assignments',
    audience: 'mentee',
    defaults: { inApp: true, email: false, sms: false },
  },
]

const EVENT_MAP: Record<string, NotificationEventDef> = Object.fromEntries(
  NOTIFICATION_EVENTS.map(e => [e.key, e]),
)

export function getNotificationEvent(key: string): NotificationEventDef | undefined {
  return EVENT_MAP[key]
}

/** Resolve effective channel prefs for a user + event by overlaying the
 *  user's stored prefs (if any) on the event's defaults. Lets us add new
 *  events without forcing a migration of stored user preferences. */
export function resolveChannels(
  eventKey: string,
  stored: Partial<ChannelPrefs> | undefined,
): ChannelPrefs {
  const ev = EVENT_MAP[eventKey]
  const defaults: ChannelPrefs = ev?.defaults ?? { inApp: true, email: false, sms: false }
  if (!stored) return defaults
  return {
    inApp: stored.inApp ?? defaults.inApp,
    email: stored.email ?? defaults.email,
    sms: stored.sms ?? defaults.sms,
  }
}

/** Filter the event catalog by audience so the prefs UI only surfaces
 *  events the user can actually receive. */
export function eventsForRole(role: 'mentor' | 'assistant_mentor' | 'admin' | 'staff' | 'mentee' | 'course_creator' | 'operations' | string): NotificationEventDef[] {
  const mentee = role === 'mentee'
  return NOTIFICATION_EVENTS.filter(ev => {
    if (ev.audience === 'both') return true
    if (mentee)  return ev.audience === 'mentee'
    return ev.audience === 'mentor'
  })
}
