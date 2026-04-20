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
    // Swallow: automations are best-effort side-effects.
  }
}

/** Fire a specific automation by id, bypassing trigger matching. Used when
 *  the caller already knows which automation should run (e.g. a journey
 *  decision node with a pinned automationId). Awaits completion so the
 *  caller can sequence a "fire then advance" workflow. */
export async function fireAutomationById(
  organizationId: string,
  automationId: string,
  payload: TriggerPayload,
): Promise<void> {
  try {
    await supabase.functions.invoke('process-automations', {
      body: {
        organization_id: organizationId,
        automation_id: automationId,
        trigger_payload: payload,
      },
    })
  } catch {
    // Swallow: automations are best-effort side-effects.
  }
}
