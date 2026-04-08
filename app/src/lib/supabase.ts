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
  const projectUrl = supabaseUrl ?? 'NOT SET'
  // Show just the project ID, not the full key
  const projectId = projectUrl.replace('https://', '').replace('.supabase.co', '')
  console.log('[SupabaseTest] Starting connectivity test...')
  console.log('[SupabaseTest] Project URL:', projectUrl)
  console.log('[SupabaseTest] Project ID:', projectId)
  const results: Record<string, string> = { project: projectId }

  // Test 1: Read (via Supabase JS client)
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

  // Test 2: Write via Supabase JS client
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
      results.write_sdk = `FAIL (${error.message}) ${elapsed}ms`
    } else {
      results.write_sdk = `OK ${elapsed}ms`
      if (data?.[0]?.id) {
        await supabase.from('audit_log').delete().eq('id', data[0].id)
      }
    }
  } catch (e) {
    results.write_sdk = `ERROR: ${(e as Error).message}`
  }

  // Test 3: Write via raw fetch (bypass Supabase JS client)
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      results.write_fetch = 'SKIP (no env vars)'
    } else {
      const start = performance.now()
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token ?? supabaseAnonKey
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const resp = await fetch(`${supabaseUrl}/rest/v1/audit_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          organization_id: orgId,
          action: 'connectivity_test_fetch',
          entity_type: 'organization',
          details: { test: true },
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const elapsed = Math.round(performance.now() - start)

      if (resp.ok) {
        results.write_fetch = `OK (${resp.status}) ${elapsed}ms`
        // Clean up
        try {
          const rows = await resp.json()
          if (rows?.[0]?.id) {
            await supabase.from('audit_log').delete().eq('id', rows[0].id)
          }
        } catch { /* ignore cleanup errors */ }
      } else {
        const body = await resp.text()
        results.write_fetch = `FAIL (${resp.status}: ${body.slice(0, 100)}) ${elapsed}ms`
      }
    }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'TIMEOUT (8s)' : (e as Error).message
    results.write_fetch = `ERROR: ${msg}`
  }

  // Test 4: Check if lessons table exists
  try {
    const start = performance.now()
    const { error } = await Promise.race([
      supabase.from('lessons').select('id').limit(1),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), 8000)
      ),
    ])
    const elapsed = Math.round(performance.now() - start)
    results.lessons_table = error ? `FAIL (${error.message}) ${elapsed}ms` : `OK ${elapsed}ms`
  } catch (e) {
    results.lessons_table = `ERROR: ${(e as Error).message}`
  }

  console.log('[SupabaseTest] Results:', results)
  return results
}
