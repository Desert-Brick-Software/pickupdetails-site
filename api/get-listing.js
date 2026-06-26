import { supabase } from './lib/supabase'

const SAFE_FIELDS = 'id, title, description, price, availability, image_urls, status, created_at'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.query.token

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Missing token' })
  }

  try {
    const { data, error } = await supabase
      .from('listings')
      .select(SAFE_FIELDS)
      .eq('edit_token', token.trim())
      .maybeSingle()

    if (error) {
      return res.status(500).json({
        error: 'Supabase query failed',
        detail: error.message,
        code: error.code || null
      })
    }

    if (!data) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    return res.status(200).json({ listing: data })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
