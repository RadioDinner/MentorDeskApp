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
  _label = 'Supabase call',
): Promise<{ data: T; error: { message: string } | null }> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<{ data: T; error: { message: string } }>(resolve => {
    timer = setTimeout(() => {
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
 * Direct REST API call bypassing the Supabase JS SDK.
 * Use when SDK calls hang but raw fetch works.
 */
export async function supabaseRestCall(
  table: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
  filters?: string, // e.g. "id=eq.some-uuid"
): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: { message: 'Supabase env vars not configured' } }
  }
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token ?? supabaseAnonKey
    const url = filters
      ? `${supabaseUrl}/rest/v1/${table}?${filters}`
      : `${supabaseUrl}/rest/v1/${table}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      const errBody = await resp.text()
      let msg = `HTTP ${resp.status}`
      try { msg = JSON.parse(errBody).message || msg } catch { msg = errBody.slice(0, 200) || msg }
      return { data: null, error: { message: msg } }
    }

    if (method === 'POST') {
      const rows = await resp.json()
      return { data: rows, error: null }
    }
    return { data: null, error: null }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError'
      ? 'Request timed out after 15s'
      : (e as Error).message || 'Network error'
    return { data: null, error: { message: msg } }
  }
}

/**
 * Raw REST GET against Supabase PostgREST, bypassing the JS SDK entirely.
 *
 * WHY THIS EXISTS:
 *   The @supabase/supabase-js client wraps fetch but also owns a stateful
 *   auth mutex and realtime subscription machinery. Under a few known
 *   scenarios (auth lock contention, stale connections after tab sleep,
 *   cold-start races) SDK queries hang indefinitely with no error. This
 *   helper uses raw `fetch` with an AbortController timeout so page loads
 *   always fail fast and can be retried cleanly.
 *
 * Usage:
 *   const { data, error } = await supabaseRestGet<Offering>(
 *     'offerings',
 *     `organization_id=eq.${orgId}&type=eq.engagement&order=name.asc`
 *   )
 *
 * Pass `Prefer: count=exact` via `countExact: true` to get a row count.
 */
export async function supabaseRestGet<T = unknown>(
  table: string,
  params: string = '',
  opts: {
    timeoutMs?: number
    label?: string
    /** Add a Range header for server-side pagination (0-indexed, inclusive). */
    range?: { from: number; to: number }
    /** Add Prefer: count=exact and return the total row count from Content-Range. */
    countExact?: boolean
  } = {},
): Promise<{ data: T[] | null; error: { message: string } | null; count: number | null }> {
  const { timeoutMs = 12000, range, countExact } = opts
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: { message: 'Supabase env vars not configured' }, count: null }
  }
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token ?? supabaseAnonKey
    const url = `${supabaseUrl}/rest/v1/${table}${params ? '?' + params : ''}`

    const headers: Record<string, string> = {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }
    if (range) {
      headers['Range-Unit'] = 'items'
      headers['Range'] = `${range.from}-${range.to}`
    }
    if (countExact) {
      headers['Prefer'] = 'count=exact'
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const body = await resp.text()
      let msg = `HTTP ${resp.status}`
      try { msg = JSON.parse(body).message || msg } catch { msg = body.slice(0, 200) || msg }
      return { data: null, error: { message: msg }, count: null }
    }

    // Parse total row count from Content-Range header (when countExact requested)
    let count: number | null = null
    if (countExact) {
      const cr = resp.headers.get('Content-Range')
      if (cr) {
        const slash = cr.lastIndexOf('/')
        if (slash >= 0 && cr.slice(slash + 1) !== '*') {
          const n = parseInt(cr.slice(slash + 1), 10)
          if (!isNaN(n)) count = n
        }
      }
    }

    const rows = (await resp.json()) as T[]
    return { data: rows, error: null, count }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError'
      ? `Request timed out after ${timeoutMs / 1000}s. Supabase may be unreachable or your connection is unstable.`
      : (e as Error).message || 'Network error'
    return { data: null, error: { message: msg }, count: null }
  }
}

/**
 * Lightweight warm-up ping to wake the Supabase project from cold start.
 * Uses the raw REST endpoint (bypassing the SDK) so it can't hang on the
 * auth mutex. Fire-and-forget — don't await in the critical path.
 */
export function warmUpSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  fetch(`${supabaseUrl}/rest/v1/organizations?select=id&limit=1`, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    signal: controller.signal,
  })
    .then(() => { clearTimeout(timer) })
    .catch(() => { clearTimeout(timer) /* best effort */ })
}

/**
 * Quick connectivity test: attempt a simple read + write to verify
 * the Supabase connection works for both operations.
 */
export async function testSupabaseConnectivity(orgId: string) {
  const projectUrl = supabaseUrl ?? 'NOT SET'
  // Show just the project ID, not the full key
  const projectId = projectUrl.replace('https://', '').replace('.supabase.co', '')
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

  // Test 4: Check if lessons table exists (read)
  try {
    const start = performance.now()
    const { error } = await Promise.race([
      supabase.from('lessons').select('id').limit(1),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), 8000)
      ),
    ])
    const elapsed = Math.round(performance.now() - start)
    results.lessons_read = error ? `FAIL (${error.message}) ${elapsed}ms` : `OK ${elapsed}ms`
  } catch (e) {
    results.lessons_read = `ERROR: ${(e as Error).message}`
  }

  // Test 5: Write to lessons table via SDK
  try {
    const start = performance.now()
    const { data, error } = await Promise.race([
      supabase.from('lessons').insert({
        offering_id: '00000000-0000-0000-0000-000000000000',
        organization_id: orgId,
        title: '__test__',
        order_index: 9999,
      }).select('id'),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), 8000)
      ),
    ])
    const elapsed = Math.round(performance.now() - start)
    if (error) {
      // Foreign key violation is expected (fake offering_id) — that's actually good, it means the write reached the DB
      results.lessons_write = error.message.includes('foreign key') || error.message.includes('violates')
        ? `OK (FK rejected as expected) ${elapsed}ms`
        : `FAIL (${error.message}) ${elapsed}ms`
    } else {
      results.lessons_write = `OK ${elapsed}ms`
      if (data?.[0]?.id) {
        await supabase.from('lessons').delete().eq('id', data[0].id)
      }
    }
  } catch (e) {
    results.lessons_write = `ERROR: ${(e as Error).message}`
  }

  // Test 6: Write to lessons via raw fetch
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      results.lessons_write_fetch = 'SKIP (no env vars)'
    } else {
      const start = performance.now()
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token ?? supabaseAnonKey
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const resp = await fetch(`${supabaseUrl}/rest/v1/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          offering_id: '00000000-0000-0000-0000-000000000000',
          organization_id: orgId,
          title: '__test_fetch__',
          order_index: 9998,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const elapsed = Math.round(performance.now() - start)
      const body = await resp.text()

      if (resp.ok) {
        results.lessons_write_fetch = `OK (${resp.status}) ${elapsed}ms`
        try {
          const rows = JSON.parse(body)
          if (rows?.[0]?.id) await supabase.from('lessons').delete().eq('id', rows[0].id)
        } catch { /* ignore */ }
      } else {
        const isFk = body.includes('foreign key') || body.includes('violates')
        results.lessons_write_fetch = isFk
          ? `OK (FK rejected as expected, ${resp.status}) ${elapsed}ms`
          : `FAIL (${resp.status}: ${body.slice(0, 120)}) ${elapsed}ms`
      }
    }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'TIMEOUT (8s)' : (e as Error).message
    results.lessons_write_fetch = `ERROR: ${msg}`
  }

  return results
}
