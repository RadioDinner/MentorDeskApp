const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // This function has been deprecated in favor of invite-user.
  // Use the invite-user function with role='mentor' and organization_id instead.
  return new Response(
    JSON.stringify({
      error: 'This endpoint is deprecated. Use the invite-user function with role="mentor" and organization_id instead.',
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 410,
    }
  )
})
