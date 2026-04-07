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
    const { invoice_id } = await req.json()

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'invoice_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Load the invoice with mentee and offering details
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, mentee:mentees(first_name, last_name, email), offering:offerings(name)')
      .eq('id', invoice_id)
      .single()

    if (invError || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!invoice.mentee?.email) {
      return new Response(
        JSON.stringify({ error: 'Mentee does not have an email address' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Load org settings for branding and email
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', invoice.organization_id)
      .in('key', ['company_name', 'currency', 'reply_to_email', 'reply_to_name'])

    const getSetting = (k: string) => settings?.find((s: any) => s.key === k)?.value || ''
    const companyName = getSetting('company_name') || 'MentorDesk'
    const currency = getSetting('currency') || 'USD'
    const replyToEmail = getSetting('reply_to_email')
    const replyToName = getSetting('reply_to_name') || companyName

    const menteeName = `${invoice.mentee.first_name} ${invoice.mentee.last_name}`
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(invoice.amount || 0)
    const description = invoice.offering?.name || invoice.description || 'Invoice charge'
    const dueDate = invoice.due_date

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service is not configured. Please set the RESEND_API_KEY environment variable in your Supabase project settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Send email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} <noreply@${Deno.env.get('RESEND_DOMAIN') || 'mentordesk.app'}>`,
        ...(replyToEmail ? { reply_to: `${replyToName} <${replyToEmail}>` } : {}),
        to: [invoice.mentee.email],
        subject: `Invoice ${invoice.invoice_number || ''} from ${companyName} — ${amount} due ${dueDate}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
            <h2 style="margin-bottom: 0.25rem;">Invoice from ${companyName}</h2>
            <p style="color: #6b7280; margin-top: 0.25rem;">Hi ${invoice.mentee.first_name},</p>
            <p style="color: #374151;">You have a new invoice. Here are the details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 1.5rem 0;">
              <tr>
                <td style="padding: 0.5rem 0; color: #6b7280; font-size: 0.875rem;">Invoice #</td>
                <td style="padding: 0.5rem 0; font-weight: 600; text-align: right;">${invoice.invoice_number || '—'}</td>
              </tr>
              <tr>
                <td style="padding: 0.5rem 0; color: #6b7280; font-size: 0.875rem;">Description</td>
                <td style="padding: 0.5rem 0; font-weight: 600; text-align: right;">${description}</td>
              </tr>
              <tr>
                <td style="padding: 0.5rem 0; color: #6b7280; font-size: 0.875rem;">Amount</td>
                <td style="padding: 0.5rem 0; font-weight: 700; text-align: right; font-size: 1.1rem;">${amount}</td>
              </tr>
              <tr>
                <td style="padding: 0.5rem 0; color: #6b7280; font-size: 0.875rem;">Due Date</td>
                <td style="padding: 0.5rem 0; font-weight: 600; text-align: right;">${dueDate}</td>
              </tr>
            </table>
            ${invoice.notes ? `<p style="color: #6b7280; font-size: 0.875rem; background: #f9fafb; padding: 0.75rem; border-radius: 6px; border: 1px solid #f3f4f6;">${invoice.notes}</p>` : ''}
            <p style="color: #6b7280; font-size: 0.82rem; margin-top: 2rem;">— ${companyName}</p>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      console.error('Resend error:', errBody)
      return new Response(
        JSON.stringify({ error: 'Failed to send email. Please check your email configuration.' }),
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
