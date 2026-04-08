import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[MentorDesk] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth calls will fail.')
}

// Fall back to a structurally valid placeholder so createClient doesn't
// throw on module load when env vars haven't been configured yet.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key'
)

/**
 * Race a Supabase query against a timeout.
 * Returns { data, error } — on timeout, error is set.
 */
export async function withTimeout<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
  ms = 15000,
  label = 'Supabase call',
): Promise<{ data: T; error: { message: string } | null }> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<{ data: T; error: { message: string } }>(resolve => {
    timer = setTimeout(() => {
      console.error(`[withTimeout] ${label} timed out after ${ms}ms`)
      resolve({ data: null as T, error: { message: `Request timed out after ${ms / 1000}s. Your Supabase project may be paused or unreachable.` } })
    }, ms)
  })
  try {
    const result = await Promise.race([promise, timeout])
    return result
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Quick connectivity test: attempt a simple read + write to verify
 * the Supabase connection works for both operations.
 */
export async function testSupabaseConnectivity(orgId: string) {
  console.log('[SupabaseTest] Starting connectivity test...')
  const results: Record<string, string> = {}

  // Test 1: Read
  try {
    const start = performance.now()
    const { error } = await Promise.race([
      supabase.from('organizations').select('id').eq('id', orgId).single(),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), 8000)
      ),
    ])
    const elapsed = Math.round(performance.now() - start)
    results.read = error ? `FAIL (${error.message}) ${elapsed}ms` : `OK ${elapsed}ms`
  } catch (e) {
    results.read = `ERROR: ${(e as Error).message}`
  }

  // Test 2: Write (insert + delete in audit_log, which is low-risk)
  try {
    const start = performance.now()
    const { data, error } = await Promise.race([
      supabase.from('audit_log').insert({
        organization_id: orgId,
        action: 'connectivity_test',
        entity_type: 'organization',
        details: { test: true },
      }).select('id'),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), 8000)
      ),
    ])
    const elapsed = Math.round(performance.now() - start)
    if (error) {
      results.write = `FAIL (${error.message}) ${elapsed}ms`
    } else {
      results.write = `OK ${elapsed}ms`
      // Clean up test row
      if (data?.[0]?.id) {
        await supabase.from('audit_log').delete().eq('id', data[0].id)
      }
    }
  } catch (e) {
    results.write = `ERROR: ${(e as Error).message}`
  }

  console.log('[SupabaseTest] Results:', results)
  return results
}
