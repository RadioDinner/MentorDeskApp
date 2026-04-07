/**
 * Super Admin authentication client.
 * Manages the custom super admin JWT and Supabase session tokens.
 */

const LOGIN_URL = import.meta.env.VITE_SUPER_ADMIN_FUNCTION_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const SA_TOKEN_KEY = 'sa_token'
const SA_TOKEN_EXPIRY_KEY = 'sa_token_expiry'
const SB_ACCESS_KEY = 'sa_sb_access'
const SB_REFRESH_KEY = 'sa_sb_refresh'

/**
 * Attempt super admin login via the edge function.
 * Returns { success, error? }
 */
export async function superAdminLogin(email, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    return { success: false, error: data.error || 'Login failed' }
  }

  // Store custom super admin JWT
  sessionStorage.setItem(SA_TOKEN_KEY, data.super_admin_token)
  sessionStorage.setItem(SA_TOKEN_EXPIRY_KEY, data.expires_at)

  // Store Supabase session tokens (for data queries via RLS)
  if (data.supabase_session) {
    sessionStorage.setItem(SB_ACCESS_KEY, data.supabase_session.access_token)
    sessionStorage.setItem(SB_REFRESH_KEY, data.supabase_session.refresh_token)
  }

  return { success: true, email: data.email }
}

/** Get the stored super admin JWT (for edge function calls). */
export function getSuperAdminToken() {
  const token = sessionStorage.getItem(SA_TOKEN_KEY)
  const expiry = sessionStorage.getItem(SA_TOKEN_EXPIRY_KEY)
  if (!token || !expiry) return null
  if (new Date(expiry) <= new Date()) {
    superAdminLogout()
    return null
  }
  return token
}

/** Get the Supabase access token (for data queries). */
export function getSupabaseAccessToken() {
  return sessionStorage.getItem(SB_ACCESS_KEY)
}

/** Get the Supabase refresh token. */
export function getSupabaseRefreshToken() {
  return sessionStorage.getItem(SB_REFRESH_KEY)
}

/** Check if super admin is currently authenticated. */
export function isSuperAdminAuthenticated() {
  return getSuperAdminToken() !== null
}

/** Clear all stored tokens. */
export function superAdminLogout() {
  sessionStorage.removeItem(SA_TOKEN_KEY)
  sessionStorage.removeItem(SA_TOKEN_EXPIRY_KEY)
  sessionStorage.removeItem(SB_ACCESS_KEY)
  sessionStorage.removeItem(SB_REFRESH_KEY)
}

/**
 * Fetch wrapper that injects the super admin JWT as Authorization header.
 * Use this for calls to edge functions that require super admin auth.
 */
export async function fetchWithSuperAdminAuth(url, options = {}) {
  const token = getSuperAdminToken()
  if (!token) throw new Error('Not authenticated as super admin')

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}
