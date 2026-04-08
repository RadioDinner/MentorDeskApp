import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase

if (!supabaseUrl || !supabaseAnonKey) {
  // Show a visible error instead of a blank page
  const msg =
    '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Inter,sans-serif;color:#6b7280;flex-direction:column;gap:0.5rem;padding:2rem;text-align:center">' +
    '<p style="font-size:1.1rem;font-weight:600;color:#111827">Configuration Error</p>' +
    '<p>Missing Supabase environment variables.</p>' +
    '<p style="font-size:0.82rem">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your Vercel project settings, then redeploy.</p></div>'
  try { document.getElementById('root').innerHTML = msg } catch {}
  // Create a dummy client that won't crash imports
  supabase = createClient('https://placeholder.supabase.co', 'placeholder')
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
}

export { supabase }
