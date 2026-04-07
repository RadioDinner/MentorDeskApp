import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_resend_key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
    const { organization_id, changes } = body
    // changes: { plan?, license_limits?, discount_percent?, discount_note? }

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'organization_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // ── Load organization ───────────────────────────────────────
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('name, slug, plan')
      .eq('id', organization_id)
      .single()

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // ── Find org admin(s) to email ──────────────────────────────
    const { data: adminRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('role', 'admin')

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_admins_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get admin emails
    const adminEmails: string[] = []
    for (const role of adminRoles) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(role.user_id)
      if (user?.email) adminEmails.push(user.email)
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_admin_emails' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Build change summary rows ───────────────────────────────
    const changeRows: string[] = []

    if (changes.plan) {
      const planLabel = changes.plan.charAt(0).toUpperCase() + changes.plan.slice(1)
      changeRows.push(`<tr><td style="padding: 0.35rem 0; color: #6b7280;">Plan</td><td style="padding: 0.35rem 0; text-align: right; font-weight: 500;">${planLabel}</td></tr>`)
    }

    if (changes.discount_percent !== undefined) {
      changeRows.push(`<tr><td style="padding: 0.35rem 0; color: #6b7280;">Discount</td><td style="padding: 0.35rem 0; text-align: right; font-weight: 500;">${changes.discount_percent}%${changes.discount_note ? ` (${changes.discount_note})` : ''}</td></tr>`)
    }

    if (changes.license_limits) {
      const ll = changes.license_limits
      const limitParts: string[] = []
      if (ll.mentors !== undefined) limitParts.push(`Mentors: ${ll.mentors === -1 ? 'Unlimited' : ll.mentors}`)
      if (ll.mentees !== undefined) limitParts.push(`Mentees: ${ll.mentees === -1 ? 'Unlimited' : ll.mentees}`)
      if (ll.staff !== undefined) limitParts.push(`Staff: ${ll.staff === -1 ? 'Unlimited' : ll.staff}`)
      if (ll.assistant_mentors !== undefined) limitParts.push(`Asst. Mentors: ${ll.assistant_mentors === -1 ? 'Unlimited' : ll.assistant_mentors}`)
      if (ll.offerings !== undefined) limitParts.push(`Offerings: ${ll.offerings === -1 ? 'Unlimited' : ll.offerings}`)
      if (limitParts.length > 0) {
        changeRows.push(`<tr><td style="padding: 0.35rem 0; color: #6b7280;">License limits</td><td style="padding: 0.35rem 0; text-align: right; font-weight: 500;">${limitParts.join(', ')}</td></tr>`)
      }
    }

    if (changeRows.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_changes' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Load org branding ───────────────────────────────────────
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .eq('organization_id', organization_id)
      .in('key', ['company_name', 'primary_color', 'company_logo', 'reply_to_email', 'reply_to_name'])

    const getSetting = (k: string) => settings?.find((s: any) => s.key === k)?.value || ''
    const companyName = getSetting('company_name') || org.name
    const primaryColor = getSetting('primary_color') || '#6366f1'
    const logoUrl = getSetting('company_logo')
    const replyToEmail = getSetting('reply_to_email')
    const replyToName = getSetting('reply_to_name') || companyName

    const resendDomain = Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'

    // ── Send email to all org admins ────────────────────────────
    const emailPromises = adminEmails.map((adminEmail) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `MentorDesk <noreply@${resendDomain}>`,
          ...(replyToEmail ? { reply_to: `${replyToName} <${replyToEmail}>` } : {}),
          to: [adminEmail],
          subject: `Pricing update for ${companyName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
              <!-- Header -->
              <div style="text-align: center; padding: 2rem 1rem 1.5rem; background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd); border-radius: 12px 12px 0 0;">
                ${logoUrl
                  ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 48px; margin: 0 auto 0.75rem;" />`
                  : `<h1 style="color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.02em;">${companyName}</h1>`
                }
                <p style="color: rgba(255,255,255,0.85); font-size: 0.82rem; margin: 0;">Pricing update</p>
              </div>

              <!-- Body -->
              <div style="padding: 2rem 1.5rem; background: #fff; border: 1px solid #f3f4f6; border-top: none;">
                <p style="font-size: 1.05rem; margin: 0 0 0.75rem;">Hi there,</p>
                <p style="color: #374151; line-height: 1.6; margin: 0 0 1.25rem;">
                  Your organization's pricing or plan details have been updated on MentorDesk. Here's a summary of the changes:
                </p>

                <div style="background: #f8fafc; border-radius: 8px; padding: 1.25rem; margin: 0 0 1.5rem;">
                  <p style="font-size: 0.85rem; font-weight: 600; color: #374151; margin: 0 0 0.5rem;">What changed</p>
                  <table style="width: 100%; font-size: 0.85rem; color: #374151;">
                    ${changeRows.join('\n                    ')}
                  </table>
                </div>

                <p style="color: #374151; line-height: 1.6; margin: 0 0 1.5rem;">
                  These changes are effective immediately. If you have any questions about your updated plan, don't hesitate to reach out.
                </p>

                <div style="text-align: center; margin: 1.5rem 0 2rem;">
                  <a href="https://app.mentordesk.app/settings" style="display: inline-block; padding: 0.85rem 2rem; background: ${primaryColor}; color: #fff; font-weight: 600; font-size: 0.95rem; border-radius: 8px; text-decoration: none;">
                    View Your Account
                  </a>
                </div>

                <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0;" />

                <p style="font-size: 0.82rem; color: #9ca3af; line-height: 1.5; margin: 0;">
                  This is an automated notification from MentorDesk.
                  ${replyToEmail ? ` Questions? Just reply to this email.` : ''}
                </p>
              </div>

              <!-- Footer -->
              <div style="text-align: center; padding: 1rem; background: #f9fafb; border-radius: 0 0 12px 12px; border: 1px solid #f3f4f6; border-top: none;">
                <p style="font-size: 0.75rem; color: #9ca3af; margin: 0;">${companyName} &middot; Powered by MentorDesk</p>
              </div>
            </div>
          `,
        }),
      })
    )

    await Promise.all(emailPromises)

    return new Response(
      JSON.stringify({ success: true, emails_sent: adminEmails.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
