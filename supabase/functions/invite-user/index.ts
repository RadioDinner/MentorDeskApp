import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const pwd = Array.from(
    { length: 14 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return pwd + '!1'
}

const VALID_ROLES = ['admin', 'mentor', 'mentee', 'trainee', 'staff', 'assistantmentor']

// Maps role to the profiles entity ID column
const PROFILE_FIELDS: Record<string, string> = {
  mentor: 'mentor_id',
  mentee: 'mentee_id',
  trainee: 'mentee_id',
  staff: 'staff_id',
  assistantmentor: 'assistant_mentor_id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { email, role, entity_id, first_name, last_name, redirect_to, organization_id } = body

    if (!email || !role || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'email, role, and organization_id are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role: ${role}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let userId: string
    let tempPassword: string | null = null
    let isNewUser = false

    // Try to create a new auth user
    const temp = generateTempPassword()
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temp,
      email_confirm: true,
      user_metadata: { first_name, last_name, role, organization_id },
    })

    if (createError) {
      // If user already exists, look them up and add the role.
      // Supabase error messages vary by version — be generous in matching.
      const errMsg = (createError.message || '').toLowerCase()
      const alreadyExists =
        errMsg.includes('already') ||
        errMsg.includes('unique') ||
        errMsg.includes('registered') ||
        errMsg.includes('duplicate') ||
        errMsg.includes('exists')

      if (!alreadyExists) {
        return new Response(
          JSON.stringify({ error: createError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Find existing user by email
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      const existingUser = listData?.users?.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      )

      if (!existingUser) {
        return new Response(
          JSON.stringify({ error: 'Account exists but could not be found. Contact administrator.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = existingUser.id
    } else {
      userId = userData.user.id
      tempPassword = temp
      isNewUser = true
    }

    // Insert into user_roles (the multi-role junction table)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        { user_id: userId, role, entity_id: entity_id || null, organization_id },
        { onConflict: 'user_id,role,organization_id' }
      )

    // Non-fatal if user_roles table doesn't exist yet
    if (roleError) {
      console.log('user_roles upsert warning:', roleError.message)
    }

    // Maintain entity linkage in profiles (active_role, entity IDs)
    const profileField = PROFILE_FIELDS[role]
    const profileRow: Record<string, any> = { id: userId, organization_id }
    if (profileField && entity_id) profileRow[profileField] = entity_id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' })

    if (profileError) {
      console.log('profile upsert warning:', profileError.message)
    }

    // For new users, generate a recovery link and send a branded welcome email
    if (isNewUser) {
      const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: redirect_to ?? undefined },
      })
      if (resetError) console.log('recovery link warning:', resetError.message)

      // Send branded welcome email via Resend (with org reply-to address)
      const resetLink = linkData?.properties?.action_link || ''
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const welcomeRes = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            email,
            first_name: first_name || '',
            organization_id,
            reset_link: resetLink,
            role: role || 'mentee',
          }),
        })
        if (!welcomeRes.ok) {
          console.log('welcome email warning:', await welcomeRes.text())
        }
      } catch (welcomeErr) {
        console.log('welcome email error:', (welcomeErr as Error).message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        temp_password: tempPassword,
        added_role: !isNewUser,
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
