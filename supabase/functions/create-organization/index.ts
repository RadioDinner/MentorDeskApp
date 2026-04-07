import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Verify the caller is a super_admin.
 * Accepts either a custom super admin JWT or a Supabase auth token.
 */
async function verifySuperAdmin(
  token: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: boolean; error?: string }> {
  // 1. Try custom super admin JWT first
  const jwtSecret = Deno.env.get('SUPER_ADMIN_JWT_SECRET')
  if (jwtSecret) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )
      const payload = await verify(token, key) as { role?: string }
      if (payload.role === 'super_admin') {
        return { ok: true }
      }
    } catch {
      // Not a valid custom JWT — fall through to Supabase auth
    }
  }

  // 2. Fall back to Supabase auth token
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return { ok: false, error: 'Invalid token' }
  }

  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')

  if (!roles || roles.length === 0) {
    return { ok: false, error: 'Forbidden: super_admin role required' }
  }

  return { ok: true }
}

// Plan-based feature flags and license limits
const PLAN_DEFAULTS: Record<string, { limits: Record<string, number>; features: Record<string, boolean> }> = {
  free: {
    limits: { mentors: 2, mentees: 5, staff: 2, assistant_mentors: 2, offerings: 1 },
    features: { billing: false, invoicing: false, payroll: false, reports: false, courses: false, arrangements: true, integrations: false },
  },
  starter: {
    limits: { mentors: 10, mentees: 25, staff: 5, assistant_mentors: 10, offerings: 5 },
    features: { billing: true, invoicing: true, payroll: false, reports: true, courses: true, arrangements: true, integrations: false },
  },
  pro: {
    limits: { mentors: 50, mentees: 100, staff: 20, assistant_mentors: 50, offerings: -1 },
    features: { billing: true, invoicing: true, payroll: true, reports: true, courses: true, arrangements: true, integrations: true },
  },
  enterprise: {
    limits: { mentors: -1, mentees: -1, staff: -1, assistant_mentors: -1, offerings: -1 },
    features: { billing: true, invoicing: true, payroll: true, reports: true, courses: true, arrangements: true, integrations: true },
  },
}

// Default branding settings seeded for every new organization
const DEFAULT_SETTINGS: Record<string, string> = {
  primary_color: '#6366f1',
  secondary_color: '#8b5cf6',
  highlight_color: '#f59e0b',
  currency: 'USD',
  default_country: '',
  lock_country: 'false',
  invoice_processing: 'manual',
  mentee_can_edit_status: 'false',
  mentor_pay_percentage_enabled: 'true',
  mentor_pay_monthly_enabled: 'true',
  mentor_pay_per_meeting_enabled: 'true',
  mentor_pay_hourly_enabled: 'true',
  signup_policy: 'closed',
  invoice_prefix: 'INV-',
  invoice_default_notes: '',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the caller is a super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const authResult = await verifySuperAdmin(token, supabaseAdmin)

    if (!authResult.ok) {
      const status = authResult.error === 'Invalid token' ? 401 : 403
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
      )
    }

    const body = await req.json()
    const { name, slug, plan, admin_email, admin_first_name, admin_last_name } = body

    if (!name || !slug) {
      return new Response(
        JSON.stringify({ error: 'name and slug are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Create the organization with plan-based defaults
    const finalPlan = plan || 'free'
    const planDef = PLAN_DEFAULTS[finalPlan] || PLAN_DEFAULTS.free

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        plan: finalPlan,
        feature_flags: planDef.features,
        license_limits: planDef.limits,
      })
      .select()
      .single()
    console.log('Created org with plan:', finalPlan, 'features:', JSON.stringify(planDef.features))

    if (orgError) {
      return new Response(
        JSON.stringify({ error: `Failed to create organization: ${orgError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Seed default settings for the new org
    const settingsRows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
      organization_id: org.id,
      key,
      value,
    }))
    // Also set company_name to the org name
    settingsRows.push({ organization_id: org.id, key: 'company_name', value: name })

    const { error: settingsError } = await supabaseAdmin
      .from('settings')
      .insert(settingsRows)

    if (settingsError) {
      console.log('settings seed warning:', settingsError.message)
    }

    // Optionally create the first admin user for this org
    let adminResult = null
    if (admin_email) {
      const { data: inviteRes, error: inviteErr } = await supabaseAdmin.functions.invoke(
        'invite-user',
        {
          body: {
            email: admin_email,
            role: 'admin',
            organization_id: org.id,
            first_name: admin_first_name || '',
            last_name: admin_last_name || '',
          },
        }
      )

      adminResult = inviteErr
        ? { error: inviteErr.message }
        : inviteRes
    }

    return new Response(
      JSON.stringify({
        success: true,
        organization: org,
        admin_invite: adminResult,
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
