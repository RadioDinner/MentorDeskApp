import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  )
  document.getElementById('root').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Inter,sans-serif;color:#6b7280;flex-direction:column;gap:0.5rem">' +
    '<p style="font-size:1.1rem;font-weight:600;color:#111827">Configuration Error</p>' +
    '<p>Missing Supabase environment variables. Check Vercel project settings.</p></div>'
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
