import { supabase } from './lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { edit_token } = req.body || {}

  if (!edit_token || typeof edit_token !== 'string' || !edit_token.trim()) {
    return res.status(400).json({ error: 'Missing edit_token' })
  }

  try {
    const { data, error } = await supabase.rpc('mark_listing_sold', {
      p_edit_token: edit_token.trim()
    })

    if (error) {
      return res.status(500).json({
        error: 'Failed to mark listing as sold',
        detail: error.message,
        code: error.code || null
      })
    }

    if (!data || data.ok === false) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
