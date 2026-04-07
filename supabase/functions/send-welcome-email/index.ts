import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, first_name, organization_id, reset_link, role } = await req.json()

    if (!email || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'email and organization_id are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      // Silently skip — the recovery link from Supabase Auth still works as a fallback
      console.log('RESEND_API_KEY not set, skipping branded welcome email')
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_resend_key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Load org settings for branding and reply-to
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', organization_id)
      .in('key', ['company_name', 'company_tagline', 'primary_color', 'company_logo', 'reply_to_email', 'reply_to_name'])

    const getSetting = (k: string) => settings?.find((s: any) => s.key === k)?.value || ''
    const companyName = getSetting('company_name') || 'MentorDesk'
    const tagline = getSetting('company_tagline')
    const primaryColor = getSetting('primary_color') || '#6366f1'
    const logoUrl = getSetting('company_logo')
    const replyToEmail = getSetting('reply_to_email')
    const replyToName = getSetting('reply_to_name') || companyName

    const recipientName = first_name || 'there'
    const roleName = role === 'mentor' ? 'mentor' : role === 'staff' ? 'staff member' : role === 'assistantmentor' ? 'assistant mentor' : 'mentee'

    const resendDomain = Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} <noreply@${resendDomain}>`,
        ...(replyToEmail ? { reply_to: `${replyToName} <${replyToEmail}>` } : {}),
        to: [email],
        subject: `Welcome to ${companyName} — Set Up Your Account`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
            <!-- Header -->
            <div style="text-align: center; padding: 2rem 1rem 1.5rem; background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd); border-radius: 12px 12px 0 0;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 48px; margin: 0 auto 0.75rem;" />`
                : `<h1 style="color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.02em;">${companyName}</h1>`
              }
              ${tagline ? `<p style="color: rgba(255,255,255,0.85); font-size: 0.82rem; margin: 0;">${tagline}</p>` : ''}
            </div>

            <!-- Body -->
            <div style="padding: 2rem 1.5rem; background: #fff; border: 1px solid #f3f4f6; border-top: none;">
              <p style="font-size: 1.05rem; margin: 0 0 0.75rem;">Hi ${recipientName},</p>
              <p style="color: #374151; line-height: 1.6; margin: 0 0 1.5rem;">
                You've been added as a <strong>${roleName}</strong> at <strong>${companyName}</strong>. To get started, set up your password by clicking the button below.
              </p>

              ${reset_link ? `
              <div style="text-align: center; margin: 1.5rem 0 2rem;">
                <a href="${reset_link}" style="display: inline-block; padding: 0.85rem 2rem; background: ${primaryColor}; color: #fff; font-weight: 600; font-size: 0.95rem; border-radius: 8px; text-decoration: none;">
                  Set My Password
                </a>
              </div>
              <p style="font-size: 0.82rem; color: #9ca3af; text-align: center;">This link will expire in 24 hours.</p>
              ` : `
              <p style="color: #374151; line-height: 1.6;">
                Your administrator will provide you with login instructions shortly.
              </p>
              `}

              <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0;" />

              <p style="font-size: 0.82rem; color: #9ca3af; line-height: 1.5; margin: 0;">
                If you didn't expect this email, you can safely ignore it.
                ${replyToEmail ? `Questions? Just reply to this email and we'll help you out.` : ''}
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

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      console.error('Resend error:', errBody)
      return new Response(
        JSON.stringify({ error: 'Failed to send welcome email' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
