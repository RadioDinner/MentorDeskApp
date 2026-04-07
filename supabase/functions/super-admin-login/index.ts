import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const jwtSecret = Deno.env.get('SUPER_ADMIN_JWT_SECRET')

  if (!jwtSecret) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing JWT secret' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'email and password are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // ── Rate limiting ───────────────────────────────────────────────────
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count } = await supabaseAdmin
      .from('super_admin_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .eq('success', false)
      .gte('attempted_at', windowStart)

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ error: 'Too many failed attempts. Try again later.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      )
    }

    // ── Verify credentials using pgcrypto in the database ──────────────
    const { data: verified, error: verifyError } = await supabaseAdmin.rpc(
      'verify_super_admin_password',
      { p_email: normalizedEmail, p_password: password }
    )

    if (verifyError || !verified) {
      await supabaseAdmin.from('super_admin_login_attempts').insert({
        email: normalizedEmail,
        success: false,
      })
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // ── Record successful login ─────────────────────────────────────────
    await supabaseAdmin.from('super_admin_login_attempts').insert({
      email: normalizedEmail,
      success: true,
    })

    // ── Sign custom super admin JWT ─────────────────────────────────────
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )

    const expiresAt = getNumericDate(8 * 60 * 60) // 8 hours
    const superAdminToken = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        sub: normalizedEmail,
        role: 'super_admin',
        iat: getNumericDate(0),
        exp: expiresAt,
      },
      key
    )

    // ── Also create a Supabase session (dual JWT) ───────────────────────
    // Use admin.generateLink to get a magic link, then exchange it.
    // This avoids needing to know the user's Supabase password.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })

    let supabaseSession = null
    if (!linkError && linkData) {
      // The generated link contains token_hash and type params.
      // We can use verifyOtp to exchange it for a session.
      const { data: otpData, error: otpError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      })

      if (!otpError && otpData?.session) {
        supabaseSession = {
          access_token: otpData.session.access_token,
          refresh_token: otpData.session.refresh_token,
          expires_at: otpData.session.expires_at,
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        super_admin_token: superAdminToken,
        supabase_session: supabaseSession,
        email: normalizedEmail,
        expires_at: new Date(expiresAt * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
