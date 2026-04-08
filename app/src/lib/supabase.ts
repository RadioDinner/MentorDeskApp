import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[MentorDesk] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth calls will fail.')
}

// Fall back to a structurally valid placeholder so createClient doesn't
// throw on module load when env vars haven't been configured yet.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key'
)
