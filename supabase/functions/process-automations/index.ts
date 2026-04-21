// Supabase Edge Function: process-automations
//
// Invoked by the client (and eventually by DB webhooks / cron) when a
// trigger-worthy event occurs. Finds matching enabled automations for the
// org, runs each action in order, and writes one automation_runs row per
// automation fired.
//
// REQUEST BODY
// ------------
// Two invocation modes:
//
// (1) Trigger-based (default):
// {
//   "organization_id": "<uuid>",
//   "trigger_type":    "lesson_completed" | "course_completed" | ...,
//   "trigger_payload": {                    // shape varies by trigger
//     "mentee_id": "<uuid>",
//     "course_id": "<uuid>?",
//     "lesson_id": "<uuid>?",
//     "lesson_index": 3?,
//     "offering_id": "<uuid>?",
//     "meeting_id": "<uuid>?"
//   }
// }
//
// (2) Direct invocation (e.g. from a journey decision-task completion):
// {
//   "organization_id": "<uuid>",
//   "automation_id":   "<uuid>",
//   "trigger_payload": { "mentee_id": "<uuid>?" }
// }
// Runs ONLY that automation, regardless of its trigger_type. Useful when
// the caller already decided which automation should fire.
//
// SETUP
// -----
//   supabase functions deploy process-automations
// Client invokes via supabase.functions.invoke('process-automations', { body })
// using the user's anon session — the function verifies the JWT and uses
// the service role internally to bypass RLS when scanning all owners'
// automations.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface TriggerPayload {
  mentee_id?: string
  course_id?: string
  lesson_id?: string
  lesson_index?: number
  offering_id?: string
  meeting_id?: string
}

interface ActionResult {
  action_index: number
  action_type: string
  status: 'success' | 'failed' | 'skipped'
  detail?: string
}

interface Automation {
  id: string
  organization_id: string
  owner_id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  actions: Record<string, unknown>[]
}

interface DynamicCtx {
  mentee_first_name?: string
  mentee_last_name?: string
  mentee_email?: string
  mentee_phone?: string
  mentor_first_name?: string
  mentor_last_name?: string
  mentor_email?: string
  mentor_phone?: string
}

/** Replace {token} occurrences with matching values from ctx. Unknown or
 *  empty tokens collapse to an empty string. Mirrors the client-side
 *  replaceDynamicFields so authors see consistent behavior. */
function substituteDynamicFields(s: string | null | undefined, ctx: DynamicCtx): string {
  if (!s) return ''
  return s.replace(
    /\{(mentee_first_name|mentee_last_name|mentee_email|mentee_phone|mentor_first_name|mentor_last_name|mentor_email|mentor_phone)\}/g,
    (_m, key: string) => (ctx[key as keyof DynamicCtx] ?? ''),
  )
}

/** Build the personalization context for a given automation fire. Loads
 *  the mentee (if any) and their currently-active mentor so tokens
 *  referencing either one resolve at delivery time. Silent-failing — if
 *  the lookup errors, we just return whatever we have. */
async function buildDynamicCtx(admin: ReturnType<typeof createClient>, payload: TriggerPayload): Promise<DynamicCtx> {
  const ctx: DynamicCtx = {}
  if (!payload.mentee_id) return ctx
  try {
    const { data: mentee } = await admin
      .from('mentees')
      .select('first_name, last_name, email, phone')
      .eq('id', payload.mentee_id)
      .maybeSingle()
    if (mentee) {
      ctx.mentee_first_name = mentee.first_name as string | undefined
      ctx.mentee_last_name  = mentee.last_name as string | undefined
      ctx.mentee_email      = mentee.email as string | undefined
      ctx.mentee_phone      = (mentee.phone as string | null | undefined) ?? undefined
    }
    const { data: pairing } = await admin
      .from('pairings')
      .select('mentor:staff!pairings_mentor_id_fkey(first_name, last_name, email, phone)')
      .eq('mentee_id', payload.mentee_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    const m = pairing?.mentor as unknown as { first_name?: string; last_name?: string; email?: string; phone?: string | null } | null
    if (m) {
      ctx.mentor_first_name = m.first_name ?? undefined
      ctx.mentor_last_name  = m.last_name ?? undefined
      ctx.mentor_email      = m.email ?? undefined
      ctx.mentor_phone      = m.phone ?? undefined
    }
  } catch {
    // Best-effort only.
  }
  return ctx
}

function matchesTrigger(a: Automation, payload: TriggerPayload): boolean {
  const cfg = a.trigger_config ?? {}
  // Course-scoped triggers: if the automation specifies a course_id,
  // the event must be for that course.
  if (cfg.course_id && payload.course_id && cfg.course_id !== payload.course_id) return false
  // Lesson-reached: if lesson_id set, match exactly; otherwise if
  // lesson_index set, match by ordinal.
  if (a.trigger_type === 'lesson_reached') {
    if (cfg.lesson_id && payload.lesson_id && cfg.lesson_id !== payload.lesson_id) return false
    if (cfg.lesson_index != null && payload.lesson_index != null && cfg.lesson_index !== payload.lesson_index) return false
  }
  // Meeting-scoped triggers: if offering_id is set on config, match on payload.
  if (cfg.offering_id && payload.offering_id && cfg.offering_id !== payload.offering_id) return false
  return true
}

async function runAction(
  admin: ReturnType<typeof createClient>,
  automation: Automation,
  action: Record<string, unknown>,
  payload: TriggerPayload,
  ctx: DynamicCtx,
  index: number,
): Promise<ActionResult> {
  const type = String(action.type ?? '')
  try {
    if (type === 'create_task') {
      // Resolve assignee. 'owner' = automation.owner_id; 'mentor_of_mentee'
      // requires a pairing lookup. Default back to owner if no active
      // pairing — a task with no assignee is useless.
      let mentorStaffId: string = automation.owner_id
      if (action.assignee === 'mentor_of_mentee' && payload.mentee_id) {
        const { data: pairing } = await admin
          .from('pairings')
          .select('mentor_id')
          .eq('mentee_id', payload.mentee_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        if (pairing?.mentor_id) mentorStaffId = pairing.mentor_id as string
      }
      const dueOffset = Number(action.due_days_offset ?? 0)
      const dueDate = dueOffset > 0
        ? new Date(Date.now() + dueOffset * 86_400_000).toISOString().slice(0, 10)
        : null
      const { error } = await admin.from('mentor_tasks').insert({
        organization_id: automation.organization_id,
        mentor_id: mentorStaffId,
        mentee_id: payload.mentee_id ?? null,
        title: substituteDynamicFields(String(action.title ?? 'Automation task'), ctx) || 'Automation task',
        notes: substituteDynamicFields(action.body as string | null | undefined, ctx) || null,
        priority: action.urgency === 'urgent' ? 'urgent' : 'normal',
        due_date: dueDate,
        source: 'automation',
        source_automation_id: automation.id,
      })
      if (error) return { action_index: index, action_type: type, status: 'failed', detail: error.message }
      return { action_index: index, action_type: type, status: 'success' }
    }

    if (type === 'send_email') {
      // Email delivery backend is not configured yet. Skip with a reason
      // so automation authors see that it ran but was parked.
      return { action_index: index, action_type: type, status: 'skipped', detail: 'Email delivery not configured' }
    }

    if (type === 'send_notification') {
      // Resolve recipient auth.users.id based on action.to:
      //   'owner'  → the staff owner of the automation
      //   'mentee' → the mentee of the triggering event
      let recipientUserId: string | null = null
      if (action.to === 'mentee') {
        if (!payload.mentee_id) {
          return { action_index: index, action_type: type, status: 'skipped', detail: 'No mentee in trigger payload' }
        }
        const { data: m } = await admin.from('mentees').select('user_id').eq('id', payload.mentee_id).maybeSingle()
        recipientUserId = (m?.user_id as string | null) ?? null
        if (!recipientUserId) {
          return { action_index: index, action_type: type, status: 'skipped', detail: 'Mentee has no linked user account' }
        }
      } else {
        // default → 'owner'
        const { data: s } = await admin.from('staff').select('user_id').eq('id', automation.owner_id).maybeSingle()
        recipientUserId = (s?.user_id as string | null) ?? null
        if (!recipientUserId) {
          return { action_index: index, action_type: type, status: 'skipped', detail: 'Automation owner has no linked user account' }
        }
      }

      const { error } = await admin.from('notifications').insert({
        organization_id: automation.organization_id,
        recipient_user_id: recipientUserId,
        title: substituteDynamicFields(String(action.title ?? 'Notification'), ctx) || 'Notification',
        body: substituteDynamicFields(action.body as string | null | undefined, ctx) || null,
        category: 'automation',
        source_automation_id: automation.id,
      })
      if (error) return { action_index: index, action_type: type, status: 'failed', detail: error.message }
      return { action_index: index, action_type: type, status: 'success' }
    }

    return { action_index: index, action_type: type, status: 'failed', detail: `Unknown action type: ${type}` }
  } catch (err) {
    return { action_index: index, action_type: type, status: 'failed', detail: (err as Error).message }
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      },
    })
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  try {
    const body = await req.json()
    const organizationId: string = body.organization_id
    const automationId: string | undefined = body.automation_id
    const triggerType: string | undefined = body.trigger_type
    const payload: TriggerPayload = body.trigger_payload ?? {}
    if (!organizationId || (!automationId && !triggerType)) {
      return new Response(JSON.stringify({ error: 'organization_id plus automation_id or trigger_type required' }), { status: 400, headers: cors })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    let matched: Automation[]
    if (automationId) {
      // Direct invocation: run exactly this automation if enabled and in-org.
      const { data, error } = await admin
        .from('automations')
        .select('id, organization_id, owner_id, name, trigger_type, trigger_config, actions')
        .eq('id', automationId)
        .eq('organization_id', organizationId)
        .eq('enabled', true)
        .maybeSingle()
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })
      matched = data ? [data as Automation] : []
    } else {
      // Trigger-based: load by (org, trigger_type) and filter by trigger_config.
      const { data, error } = await admin
        .from('automations')
        .select('id, organization_id, owner_id, name, trigger_type, trigger_config, actions')
        .eq('organization_id', organizationId)
        .eq('trigger_type', triggerType!)
        .eq('enabled', true)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })
      matched = (data ?? []).filter(a => matchesTrigger(a as Automation, payload))
    }
    const summaries: { automation_id: string; status: string; action_count: number }[] = []

    // Build personalization context once per fire (automations in a batch
    // share the same trigger payload and thus the same mentee/mentor).
    const dynamicCtx = await buildDynamicCtx(admin, payload)

    for (const a of matched as Automation[]) {
      const startedAt = new Date().toISOString()
      const results: ActionResult[] = []
      for (let i = 0; i < a.actions.length; i++) {
        results.push(await runAction(admin, a, a.actions[i], payload, dynamicCtx, i))
      }
      const anySuccess = results.some(r => r.status === 'success')
      const anyFailed = results.some(r => r.status === 'failed')
      const status = anyFailed && anySuccess ? 'partial'
        : anyFailed ? 'failed'
        : anySuccess ? 'success'
        : 'skipped'

      await admin.from('automation_runs').insert({
        organization_id: a.organization_id,
        automation_id: a.id,
        mentee_id: payload.mentee_id ?? null,
        trigger_payload: payload,
        status,
        action_results: results,
        finished_at: new Date().toISOString(),
        started_at: startedAt,
      })
      summaries.push({ automation_id: a.id, status, action_count: results.length })
    }

    return new Response(JSON.stringify({ matched: matched.length, runs: summaries }), { status: 200, headers: cors })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: cors })
  }
})
