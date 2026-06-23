import { getSupabaseAdmin } from './lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { edit_token } = req.body || {}

  if (!edit_token || typeof edit_token !== 'string' || !edit_token.trim()) {
    return res.status(400).json({ error: 'Missing edit_token' })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable' })
  }

  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('listings')
      .select('id')
      .eq('edit_token', edit_token.trim())
      .maybeSingle()

    if (lookupError) {
      return res.status(500).json({ error: 'Failed to verify listing' })
    }

    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('listings')
      .update({ status: 'sold' })
      .eq('edit_token', edit_token.trim())

    if (updateError) {
      return res.status(500).json({ error: 'Failed to mark listing as sold' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
