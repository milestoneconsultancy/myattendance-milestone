import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    '[SupabaseClient] Warning: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not set. Please provide valid environment variables in .env.local.'
  )
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder-milestone-project.supabase.co',
  supabasePublishableKey || 'placeholder-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

