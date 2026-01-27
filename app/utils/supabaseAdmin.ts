import env from '#start/env'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL) {
  throw new Error('Missing env: SUPABASE_URL')
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'abby-backend-admin',
    },
  },
})
