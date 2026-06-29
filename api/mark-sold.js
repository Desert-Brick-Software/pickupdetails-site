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
      .select('id, status')
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

    if (String(existing.status).toLowerCase() === 'sold') {
      return res.status(403).json({ error: 'Listing is already marked as sold' })
    }

    const updates = {
      status: 'sold',
      sold_at: new Date().toISOString()
    }

    let { error: updateError } = await supabase
      .from('listings')
      .update(updates)
      .eq('edit_token', edit_token.trim())

    if (updateError) {
      const soldAtColumnMissing =
        updateError.code === 'PGRST204' ||
        /sold_at/i.test(updateError.message || '')

      if (soldAtColumnMissing) {
        const retry = await supabase
          .from('listings')
          .update({ status: 'sold' })
          .eq('edit_token', edit_token.trim())

        updateError = retry.error
      }
    }

    if (updateError) {
      return res.status(500).json({
        error: 'Failed to mark listing as sold',
        detail: updateError.message,
        code: updateError.code || null
      })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
