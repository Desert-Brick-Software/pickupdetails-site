import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_ANON_KEY?.trim()
)
