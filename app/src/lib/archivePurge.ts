import { supabase } from './supabase'
import type { ArchiveSettings } from '../types'

/**
 * Purge archived staff and mentees that have exceeded the auto-delete threshold.
 * Called on app init after profile loads. Safe to call multiple times — it's a no-op
 * if auto_delete_enabled is false or no records have expired.
 */
export async function purgeExpiredArchives(organizationId: string) {
  // Fetch the org's archive settings
  const { data: orgData } = await supabase
    .from('organizations')
    .select('archive_settings')
    .eq('id', organizationId)
    .single()

  if (!orgData) return

  const settings = orgData.archive_settings as ArchiveSettings | null
  if (!settings?.auto_delete_enabled) return

  // Calculate the cutoff date
  const cutoff = new Date()
  switch (settings.auto_delete_unit) {
    case 'days':
      cutoff.setDate(cutoff.getDate() - settings.auto_delete_value)
      break
    case 'months':
      cutoff.setMonth(cutoff.getMonth() - settings.auto_delete_value)
      break
    case 'years':
      cutoff.setFullYear(cutoff.getFullYear() - settings.auto_delete_value)
      break
  }

  const cutoffISO = cutoff.toISOString()

  // Delete expired archived staff and mentees in parallel
  await Promise.all([
    supabase
      .from('staff')
      .delete()
      .eq('organization_id', organizationId)
      .not('archived_at', 'is', null)
      .lt('archived_at', cutoffISO),
    supabase
      .from('mentees')
      .delete()
      .eq('organization_id', organizationId)
      .not('archived_at', 'is', null)
      .lt('archived_at', cutoffISO),
  ])
}
