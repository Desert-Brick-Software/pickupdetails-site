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
    const { data: existing, error: lookupError } = await supabase
      .from('listings')
      .select('id')
      .eq('edit_token', edit_token.trim())
      .maybeSingle()

    if (lookupError) {
      return res.status(500).json({
        error: 'Failed to verify listing',
        detail: lookupError.message,
        code: lookupError.code || null
      })
    }

    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    const { error: deleteError } = await supabase
      .from('listings')
      .delete()
      .eq('edit_token', edit_token.trim())

    if (deleteError) {
      return res.status(500).json({
        error: 'Failed to mark listing as sold',
        detail: deleteError.message,
        code: deleteError.code || null
      })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
