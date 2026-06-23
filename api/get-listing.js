import { getSupabaseAdmin } from './lib/supabase'

const SAFE_FIELDS = 'id, title, description, price, image_urls, status, created_at'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.query.token

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Missing token' })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable' })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('listings')
      .select(SAFE_FIELDS)
      .eq('edit_token', token.trim())
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: 'Failed to load listing' })
    }

    if (!data) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    return res.status(200).json({ listing: data })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
