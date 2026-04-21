import { supabase } from './supabase'
import { resolveChannels } from './notificationEvents'

/** Dispatch a notification event to a specific user (by auth.users.id).
 *
 * Reads that user's stored channel preferences for `eventKey` (falling
 * back to the event's catalog defaults), then writes to whichever
 * channels are enabled:
 *
 *   inApp → inserts a row in `notifications` (works today, shows up in
 *           the topbar bell).
 *   email → stubbed (no SMTP yet).
 *   sms   → stubbed (no SMS provider yet).
 *
 * Fire-and-forget — this never throws. Primary user actions (completing
 * a lesson, booking a meeting, …) are never blocked by notification
 * delivery problems. */
export interface NotifyArgs {
  recipientUserId: string
  organizationId: string
  eventKey: string
  title: string
  body?: string | null
  /** Optional in-app route to navigate to when the notification is clicked. */
  link?: string | null
  /** Broad category for the widget's colored dot: 'meeting', 'task',
   *  'automation', 'billing', 'system'. Defaults to 'system'. */
  category?: string
}

export async function notifyUser(args: NotifyArgs): Promise<void> {
  const { recipientUserId, organizationId, eventKey, title, body, link, category } = args
  try {
    // Self-exclusion: when a user holds multiple profiles linked to the
    // same auth user (e.g. admin with test mentor / mentee accounts via
    // the profile "My Accounts" feature), an event triggered while
    // active on one profile shouldn't land in their own bell from the
    // other profile. Nobody wants to notify themselves.
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id === recipientUserId) return

    // Load the recipient's per-event channel prefs.
    const { data: prefsRow } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', recipientUserId)
      .maybeSingle()

    const allPrefs = (prefsRow?.preferences as { notifications?: Record<string, Partial<{ inApp: boolean; email: boolean; sms: boolean }>> } | undefined)?.notifications
    const channels = resolveChannels(eventKey, allPrefs?.[eventKey])

    if (channels.inApp) {
      await supabase.from('notifications').insert({
        organization_id: organizationId,
        recipient_user_id: recipientUserId,
        title,
        body: body ?? null,
        link: link ?? null,
        category: category ?? 'system',
      })
    }

    // Email and SMS channels intentionally stubbed — the prefs are stored
    // and honored once delivery infra (SMTP + SMS provider) is wired up.
  } catch {
    // Swallow — notifications are best-effort side-effects.
  }
}
