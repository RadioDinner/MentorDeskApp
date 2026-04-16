import { supabase } from './supabase'

export type EntityType =
  | 'staff'
  | 'mentee'
  | 'offering'
  | 'pairing'
  | 'organization'
  | 'mentee_offering'
  | 'invoice'
  | 'engagement_session'
  | 'habit'
  | 'mentee_habit'
  | 'canvas'
  | 'journey_flow'
  | 'mentee_journey'

export interface AuditEntry {
  organization_id: string
  actor_id: string
  action: string
  entity_type: EntityType
  entity_id?: string
  details?: Record<string, unknown>
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
}

export async function logAudit(entry: AuditEntry) {
  try {
    await supabase.from('audit_log').insert({
      organization_id: entry.organization_id,
      actor_id: entry.actor_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      details: entry.details ?? null,
      old_values: entry.old_values ?? null,
      new_values: entry.new_values ?? null,
    })
  } catch {
    // audit logging is best-effort
  }
}

/**
 * Revert a change by applying old_values back to the entity.
 * Returns { success, error }.
 */
export async function revertAuditEntry(entry: {
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
}): Promise<{ success: boolean; error?: string }> {
  if (!entry.entity_id || !entry.old_values) {
    return { success: false, error: 'No data to revert' }
  }

  const table = entry.entity_type === 'pairing' ? 'pairings'
    : entry.entity_type === 'organization' ? 'organizations'
    : entry.entity_type === 'offering' ? 'offerings'
    : entry.entity_type === 'mentee' ? 'mentees'
    : 'staff'

  try {
    const { error } = await supabase
      .from(table)
      .update(entry.old_values)
      .eq('id', entry.entity_id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Failed to revert' }
  }
}
