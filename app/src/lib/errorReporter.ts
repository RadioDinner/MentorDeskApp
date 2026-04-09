import { supabase } from './supabase'

interface ErrorReport {
  error_message: string
  error_stack?: string
  error_code?: string
  page?: string
  component?: string
  action?: string
  metadata?: Record<string, unknown>
}

/**
 * Report an error to the error_reports table for platform monitoring.
 * Designed to never throw — silently logs to console on failure.
 */
export async function reportError(report: ErrorReport) {
  try {
    // Get current user/org context
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id ?? null

    // Try to get org_id from the current page context
    let orgId: string | null = null
    try {
      if (userId) {
        const { data } = await supabase
          .from('staff')
          .select('organization_id')
          .eq('user_id', userId)
          .limit(1)
          .single()
        orgId = data?.organization_id ?? null
      }
    } catch {
      // Ignore — org lookup is best-effort
    }

    const { error } = await supabase.from('error_reports').insert({
      organization_id: orgId,
      user_id: userId,
      error_message: report.error_message,
      error_stack: report.error_stack ?? null,
      error_code: report.error_code ?? null,
      page: report.page ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      component: report.component ?? null,
      action: report.action ?? null,
      metadata: report.metadata ?? null,
      status: 'new',
    })

    if (error) {
      console.warn('[reportError] Failed to save error report:', error.message)
    } else {
      console.log('[reportError] Error report saved')
    }
  } catch (err) {
    // Never throw from the error reporter
    console.warn('[reportError] Exception while reporting:', err)
  }
}

/**
 * Extract a Postgres error code from a Supabase error message.
 * e.g. "duplicate key value violates unique constraint" → "23505"
 */
export function extractErrorCode(message: string): string | undefined {
  if (message.includes('duplicate key') || message.includes('unique constraint')) return '23505'
  if (message.includes('foreign key')) return '23503'
  if (message.includes('not-null') || message.includes('not null') || message.includes('null value')) return '23502'
  if (message.includes('check constraint')) return '23514'
  if (message.includes('permission denied') || message.includes('row-level security')) return '42501'
  return undefined
}

/**
 * Helper to report a Supabase error with context.
 */
export function reportSupabaseError(
  error: { message: string; code?: string },
  context: { component?: string; action?: string; metadata?: Record<string, unknown> },
) {
  reportError({
    error_message: error.message,
    error_code: error.code ?? extractErrorCode(error.message),
    component: context.component,
    action: context.action,
    metadata: context.metadata,
  })
}
