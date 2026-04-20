import { supabase } from './supabase'
import type { AutomationTriggerType } from '../types'

/** Payload shape for a trigger fire. Fields are all optional because which
 *  ones apply depends on the trigger type. */
export interface TriggerPayload {
  mentee_id?: string
  course_id?: string
  lesson_id?: string
  lesson_index?: number
  offering_id?: string
  meeting_id?: string
}

/** Invokes the process-automations edge function. Fire-and-forget from the
 *  caller's POV — we swallow errors so the primary user action (e.g.
 *  completing a lesson) is never blocked by an automation problem. */
export async function fireAutomationTrigger(
  organizationId: string,
  triggerType: AutomationTriggerType,
  payload: TriggerPayload,
): Promise<void> {
  try {
    await supabase.functions.invoke('process-automations', {
      body: {
        organization_id: organizationId,
        trigger_type: triggerType,
        trigger_payload: payload,
      },
    })
  } catch {
    // Swallow: automations are best-effort side-effects, never block the
    // user's primary action. Runs table records success/failure for
    // matched automations; unreachable edge function is logged server-
    // side by Supabase.
  }
}
