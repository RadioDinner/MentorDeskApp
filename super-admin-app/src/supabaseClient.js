import { createClient } from '@supabase/supabase-js'
import { getSupabaseAccessToken, getSupabaseRefreshToken } from './superAdminClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Set the Supabase session from stored tokens (after super admin login).
 * Call this on app load if tokens exist in sessionStorage.
 */
export async function restoreSupabaseSession() {
  const accessToken = getSupabaseAccessToken()
  const refreshToken = getSupabaseRefreshToken()
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    return !error
  }
  return false
}
