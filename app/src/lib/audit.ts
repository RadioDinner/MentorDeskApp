import { supabase } from './supabase'

export type EntityType =
  | 'staff'
  | 'mentee'
  | 'offering'
  | 'assignment'
  | 'organization'

export interface AuditEntry {
  organization_id: string
  actor_id: string
  action: string
  entity_type: EntityType
  entity_id?: string
  details?: Record<string, unknown>
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
    })
  } catch (err) {
    console.error('[audit] Failed to log:', err)
  }
}
