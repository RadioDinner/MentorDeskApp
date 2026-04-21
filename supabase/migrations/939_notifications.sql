-- In-app notifications. One row per (recipient, message).
-- Written by the automations edge function (when a send_notification
-- action fires), and ready for any other system that needs to surface
-- an in-app alert — journeys, meetings, tasks, billing reminders, etc.
--
-- Keyed by auth.users.id so the same recipient sees their notifications
-- regardless of which profile (staff/mentee) they're currently active
-- on. Dashboards filter by auth.uid() at render time.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  /** Optional in-app route the widget should navigate to when clicked. */
  link TEXT,
  /** Free-form category for grouping/filtering: 'automation', 'task',
   *  'meeting', 'system', 'billing', etc. */
  category TEXT NOT NULL DEFAULT 'system',
  /** Source automation, if any. Populated by the automations engine. */
  source_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_all
  ON notifications(recipient_user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications.
CREATE POLICY user_read_own_notifications ON notifications FOR SELECT
  USING (recipient_user_id = auth.uid());

-- Users can mark their own as read (or update anything else on their row).
CREATE POLICY user_update_own_notifications ON notifications FOR UPDATE
  USING (recipient_user_id = auth.uid());

-- Users can dismiss (delete) their own notifications.
CREATE POLICY user_delete_own_notifications ON notifications FOR DELETE
  USING (recipient_user_id = auth.uid());

-- Staff may insert notifications into their own org. (The edge function
-- uses the service role and bypasses RLS entirely, but staff-authored
-- "ping this mentee" workflows can use this path later.)
CREATE POLICY staff_insert_notifications ON notifications FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
