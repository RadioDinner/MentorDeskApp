import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '!1'
}

async function verifySuperAdmin(
  token: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<boolean> {
  const jwtSecret = Deno.env.get('SUPER_ADMIN_JWT_SECRET')
  if (jwtSecret) {
    try {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
      )
      const payload = await verify(token, key) as { role?: string }
      if (payload.role === 'super_admin') return true
    } catch { /* fall through */ }
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return false

  const { data: roles } = await supabaseAdmin
    .from('user_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin')
  return !!(roles && roles.length > 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    if (!(await verifySuperAdmin(token, supabaseAdmin))) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: super_admin required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const body = await req.json()
    const { request_id, action, reviewer_note, plan_override, license_limits } = body
    console.log('approve-org-signup called:', JSON.stringify({ request_id, action, plan_override }))

    if (!request_id || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'request_id and action (approve|reject) are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // ── Load the pending request ────────────────────────────────
    const { data: request, error: reqError } = await supabaseAdmin
      .from('pending_org_signups')
      .select('*')
      .eq('id', request_id)
      .eq('status', 'pending')
      .single()

    if (reqError || !request) {
      console.log('Pending request not found:', reqError?.message)
      return new Response(
        JSON.stringify({ error: 'Pending request not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // ── Reject ──────────────────────────────────────────────────
    if (action === 'reject') {
      await supabaseAdmin
        .from('pending_org_signups')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewer_note: reviewer_note || null })
        .eq('id', request_id)

      console.log('Request rejected:', request_id)

      // Send rejection email
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      if (resendApiKey) {
        const resendDomain = Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'
        const firstName = (request.admin_first_name || '').trim()
        const recipientName = firstName || 'there'
        const noteHtml = reviewer_note
          ? `<div style="background: #f8fafc; border-radius: 8px; padding: 1rem 1.25rem; margin: 0 0 1.5rem; border-left: 3px solid #6366f1;">
              <p style="font-size: 0.82rem; font-weight: 600; color: #374151; margin: 0 0 0.35rem;">Message from our team</p>
              <p style="font-size: 0.88rem; color: #374151; margin: 0; line-height: 1.6;">${reviewer_note}</p>
            </div>`
          : ''

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `MentorDesk <noreply@${resendDomain}>`,
              to: [request.admin_email],
              subject: `Update on your MentorDesk signup request`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
                  <div style="text-align: center; padding: 2rem 1rem 1.5rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px 12px 0 0;">
                    <h1 style="color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.02em;">MentorDesk</h1>
                    <p style="color: rgba(255,255,255,0.85); font-size: 0.82rem; margin: 0;">Signup request update</p>
                  </div>
                  <div style="padding: 2rem 1.5rem; background: #fff; border: 1px solid #f3f4f6; border-top: none;">
                    <p style="font-size: 1.05rem; margin: 0 0 0.75rem;">Hi ${recipientName},</p>
                    <p style="color: #374151; line-height: 1.6; margin: 0 0 1.25rem;">
                      Thank you for your interest in MentorDesk. After reviewing your request to create <strong>${request.org_name}</strong>, we're unable to approve it at this time.
                    </p>
                    ${noteHtml}
                    <p style="color: #374151; line-height: 1.6; margin: 0 0 1.5rem;">
                      If you have questions or would like to discuss this further, simply reply to this email.
                    </p>
                    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0;" />
                    <p style="font-size: 0.82rem; color: #9ca3af; line-height: 1.5; margin: 0;">
                      You're welcome to submit a new request at any time.
                    </p>
                  </div>
                  <div style="text-align: center; padding: 1rem; background: #f9fafb; border-radius: 0 0 12px 12px; border: 1px solid #f3f4f6; border-top: none;">
                    <p style="font-size: 0.75rem; color: #9ca3af; margin: 0;">MentorDesk</p>
                  </div>
                </div>
              `,
            }),
          })
          console.log('Rejection email sent to:', request.admin_email)
        } catch (emailErr) {
          console.error('Failed to send rejection email:', (emailErr as Error).message)
        }
      }

      return new Response(
        JSON.stringify({ success: true, action: 'rejected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Approve: create or reuse the org ────────────────────────
    // Check if org already exists (from a previous partial approval attempt)
    let org = null
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('slug', request.org_slug)
      .single()

    if (existingOrg) {
      console.log('Reusing existing org:', existingOrg.id, existingOrg.slug)
      org = existingOrg
    } else {
      const finalPlan = plan_override || request.plan || 'free'
      const planDef = PLAN_DEFAULTS[finalPlan] || PLAN_DEFAULTS.free

      // Use provided license_limits or fall back to plan defaults
      const finalLimits = (license_limits && typeof license_limits === 'object')
        ? license_limits
        : planDef.limits

      const insertData: any = {
        name: request.org_name,
        slug: request.org_slug,
        plan: finalPlan,
        feature_flags: planDef.features,
        license_limits: finalLimits,
      }
      console.log('Creating org with plan:', finalPlan, 'features:', JSON.stringify(planDef.features), 'limits:', JSON.stringify(finalLimits))

      const { data: newOrg, error: orgError } = await supabaseAdmin
        .from('organizations')
        .insert(insertData)
        .select()
        .single()

      if (orgError) {
        console.log('Failed to create org:', orgError.message)
        return new Response(
          JSON.stringify({ error: `Failed to create organization: ${orgError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      console.log('Created new org:', newOrg.id, newOrg.slug)
      org = newOrg
    }

    // ── Seed default settings (skip if already seeded) ──────────
    const { data: existingSettings } = await supabaseAdmin
      .from('settings')
      .select('id')
      .eq('organization_id', org.id)
      .limit(1)

    if (!existingSettings || existingSettings.length === 0) {
      const settingsRows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        organization_id: org.id, key, value,
      }))
      settingsRows.push({ organization_id: org.id, key: 'company_name', value: request.org_name })
      const { error: settingsError } = await supabaseAdmin.from('settings').insert(settingsRows)
      if (settingsError) {
        console.log('Settings seed warning:', settingsError.message)
      } else {
        console.log('Settings seeded for org:', org.id)
      }
    } else {
      console.log('Settings already exist for org:', org.id)
    }

    // ── Create or find admin user ───────────────────────────────
    let userId: string | null = null
    let isNewUser = true

    // First check if user already exists
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = listData?.users?.find(
      (u: any) => u.email?.toLowerCase() === request.admin_email.toLowerCase()
    )

    if (existingUser) {
      console.log('User already exists:', existingUser.id)
      userId = existingUser.id
      isNewUser = false
    } else {
      // Create new user
      const tempPassword = generateTempPassword()
      console.log('Creating user with email:', request.admin_email, 'org_id:', org.id)

      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: request.admin_email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: request.admin_first_name || '',
          last_name: request.admin_last_name || '',
          role: 'admin',
          organization_id: org.id,
        },
      })

      if (createError) {
        console.log('createUser failed:', JSON.stringify(createError))
        console.log('createUser error message:', createError.message)
        return new Response(
          JSON.stringify({ error: `Failed to create admin user: ${createError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = userData.user.id
      console.log('Created new user:', userId)
    }

    // ── Assign admin role (idempotent) ──────────────────────────
    const { error: roleError } = await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role: 'admin', organization_id: org.id },
      { onConflict: 'user_id,role,organization_id' }
    )
    if (roleError) {
      console.log('Role upsert error:', roleError.message)
    } else {
      console.log('Admin role assigned for user:', userId)
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      { id: userId, organization_id: org.id, active_role: 'admin' },
      { onConflict: 'id' }
    )
    if (profileError) {
      console.log('Profile upsert error:', profileError.message)
    } else {
      console.log('Profile set for user:', userId)
    }

    // ── Send password reset so they can set their own password ──
    if (isNewUser) {
      const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: request.admin_email,
        options: { redirectTo: `https://app.mentordesk.app/set-password` },
      })
      if (resetError) {
        console.log('Password reset link error:', resetError.message)
      } else {
        console.log('Password reset link generated for:', request.admin_email)
      }
    }

    // ── Mark request as approved ────────────────────────────────
    await supabaseAdmin
      .from('pending_org_signups')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer_note: reviewer_note || null })
      .eq('id', request_id)

    console.log('Signup approved successfully:', request_id)

    // ── Send approval email to the new admin ────────────────────
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      const resendDomain = Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'
      const firstName = (request.admin_first_name || '').trim()
      const recipientName = firstName || 'there'
      const loginUrl = 'https://app.mentordesk.app/login'
      const planLabel = (request.plan || 'free').charAt(0).toUpperCase() + (request.plan || 'free').slice(1)

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `MentorDesk <noreply@${resendDomain}>`,
            to: [request.admin_email],
            subject: `Your organization "${request.org_name}" has been approved!`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
                <!-- Header -->
                <div style="text-align: center; padding: 2rem 1rem 1.5rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px 12px 0 0;">
                  <h1 style="color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.02em;">MentorDesk</h1>
                  <p style="color: rgba(255,255,255,0.85); font-size: 0.82rem; margin: 0;">You're approved!</p>
                </div>

                <!-- Body -->
                <div style="padding: 2rem 1.5rem; background: #fff; border: 1px solid #f3f4f6; border-top: none;">
                  <p style="font-size: 1.05rem; margin: 0 0 0.75rem;">Hi ${recipientName},</p>
                  <p style="color: #374151; line-height: 1.6; margin: 0 0 1.25rem;">
                    Great news — <strong>${request.org_name}</strong> has been approved and is ready to go on MentorDesk!
                  </p>

                  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1rem 1.25rem; margin: 0 0 1.5rem;">
                    <p style="font-size: 0.9rem; font-weight: 600; color: #166534; margin: 0 0 0.25rem;">&#10003; Organization created</p>
                    <p style="font-size: 0.82rem; color: #15803d; margin: 0;">Your admin account is set up and ready to use.</p>
                  </div>

                  <div style="background: #f8fafc; border-radius: 8px; padding: 1.25rem; margin: 0 0 1.5rem;">
                    <p style="font-size: 0.85rem; font-weight: 600; color: #374151; margin: 0 0 0.5rem;">Your organization</p>
                    <table style="width: 100%; font-size: 0.85rem; color: #374151;">
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">Name</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${request.org_name}</td></tr>
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">URL</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${request.org_slug}.mentordesk.app</td></tr>
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">Plan</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${planLabel}</td></tr>
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">Admin email</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${request.admin_email}</td></tr>
                    </table>
                  </div>

                  <p style="color: #374151; line-height: 1.6; margin: 0 0 1.25rem;">
                    ${isNewUser
                      ? 'We\'ve sent you a separate email with a link to set your password. Once that\'s done, you can log in and start configuring your organization.'
                      : 'Since you already have a MentorDesk account, you can log in right away with your existing credentials.'}
                  </p>

                  <div style="text-align: center; margin: 1.5rem 0 2rem;">
                    <a href="${loginUrl}" style="display: inline-block; padding: 0.85rem 2rem; background: #6366f1; color: #fff; font-weight: 600; font-size: 0.95rem; border-radius: 8px; text-decoration: none;">
                      Go to MentorDesk
                    </a>
                  </div>

                  <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0;" />

                  <p style="font-size: 0.82rem; color: #9ca3af; line-height: 1.5; margin: 0;">
                    If you have any questions, reply to this email and we'll help you get started.
                  </p>
                </div>

                <!-- Footer -->
                <div style="text-align: center; padding: 1rem; background: #f9fafb; border-radius: 0 0 12px 12px; border: 1px solid #f3f4f6; border-top: none;">
                  <p style="font-size: 0.75rem; color: #9ca3af; margin: 0;">MentorDesk</p>
                </div>
              </div>
            `,
          }),
        })
      } catch (emailErr) {
        console.error('Failed to send approval email:', (emailErr as Error).message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: 'approved',
        organization: { id: org.id, name: org.name, slug: org.slug },
        admin_email: request.admin_email,
        is_new_user: isNewUser,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.log('Unexpected error:', (err as Error).message)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
