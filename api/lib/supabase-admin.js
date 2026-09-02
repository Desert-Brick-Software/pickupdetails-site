import { createClient } from '@supabase/supabase-js'

// Server-side only. Never import this module from public frontend files.
// The service-role key must never be logged or sent to the browser.

let cachedClient = null

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Admin database is not configured')
  }

  if (!cachedClient) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  }

  return cachedClient
}
