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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json()
    console.log('self-serve-signup body:', JSON.stringify(body))
    const { org_name, org_slug, plan, admin_email, admin_first_name, admin_last_name } = body

    // ── Validate inputs ─────────────────────────────────────────
    if (!org_name || !org_slug || !admin_email) {
      console.log('Validation failed: missing fields', { org_name, org_slug, admin_email })
      return new Response(
        JSON.stringify({ error: 'Organization name, URL, and email are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const cleanSlug = org_slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (cleanSlug.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Organization URL must be at least 2 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const email = admin_email.toLowerCase().trim()

    // ── Check slug not already taken by an existing org ──────────
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', cleanSlug)
      .single()

    if (existingOrg) {
      console.log('Slug taken by existing org:', cleanSlug)
      return new Response(
        JSON.stringify({ error: 'This organization URL is already taken.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    // ── Check no pending request with same slug or email ─────────
    const { data: pendingSlug } = await supabaseAdmin
      .from('pending_org_signups')
      .select('id')
      .eq('org_slug', cleanSlug)
      .eq('status', 'pending')
      .single()

    if (pendingSlug) {
      console.log('Pending signup exists for slug:', cleanSlug)
      return new Response(
        JSON.stringify({ error: 'A signup request for this URL is already pending review.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    const { data: pendingEmail } = await supabaseAdmin
      .from('pending_org_signups')
      .select('id')
      .eq('admin_email', email)
      .eq('status', 'pending')
      .single()

    if (pendingEmail) {
      console.log('Pending signup exists for email:', email)
      return new Response(
        JSON.stringify({ error: 'A signup request with this email is already pending review.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    // ── Save the request ────────────────────────────────────────
    const selectedPlan = ['free', 'starter', 'pro', 'enterprise'].includes(plan) ? plan : 'free'

    const { error: insertError } = await supabaseAdmin
      .from('pending_org_signups')
      .insert({
        org_name: org_name.trim(),
        org_slug: cleanSlug,
        plan: selectedPlan,
        admin_email: email,
        admin_first_name: (admin_first_name || '').trim(),
        admin_last_name: (admin_last_name || '').trim(),
      })

    if (insertError) {
      console.log('Insert error:', insertError.message)
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // ── Send confirmation email to the applicant ────────────────
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      const resendDomain = Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'
      const firstName = (admin_first_name || '').trim()
      const recipientName = firstName || 'there'

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `MentorDesk <noreply@${resendDomain}>`,
            to: [email],
            subject: `We received your signup request for ${org_name.trim()}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
                <!-- Header -->
                <div style="text-align: center; padding: 2rem 1rem 1.5rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px 12px 0 0;">
                  <h1 style="color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.02em;">MentorDesk</h1>
                  <p style="color: rgba(255,255,255,0.85); font-size: 0.82rem; margin: 0;">Your request is being reviewed</p>
                </div>

                <!-- Body -->
                <div style="padding: 2rem 1.5rem; background: #fff; border: 1px solid #f3f4f6; border-top: none;">
                  <p style="font-size: 1.05rem; margin: 0 0 0.75rem;">Hi ${recipientName},</p>
                  <p style="color: #374151; line-height: 1.6; margin: 0 0 1.25rem;">
                    Thank you for requesting to create <strong>${org_name.trim()}</strong> on MentorDesk. We've received your application and it's now under review.
                  </p>

                  <div style="background: #f8fafc; border-radius: 8px; padding: 1.25rem; margin: 0 0 1.5rem;">
                    <p style="font-size: 0.85rem; font-weight: 600; color: #374151; margin: 0 0 0.5rem;">Request details</p>
                    <table style="width: 100%; font-size: 0.85rem; color: #374151;">
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">Organization</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${org_name.trim()}</td></tr>
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">URL</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${cleanSlug}.mentordesk.app</td></tr>
                      <tr><td style="padding: 0.2rem 0; color: #6b7280;">Plan</td><td style="padding: 0.2rem 0; text-align: right; font-weight: 500;">${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}</td></tr>
                    </table>
                  </div>

                  <p style="color: #374151; line-height: 1.6; margin: 0 0 1.5rem;">
                    We'll email you once your organization is approved. This usually takes less than 24 hours.
                  </p>

                  <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0;" />

                  <p style="font-size: 0.82rem; color: #9ca3af; line-height: 1.5; margin: 0;">
                    If you didn't submit this request, you can safely ignore this email.
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
        // Non-blocking — signup still succeeded even if email fails
        console.error('Failed to send signup confirmation email:', (emailErr as Error).message)
      }
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
