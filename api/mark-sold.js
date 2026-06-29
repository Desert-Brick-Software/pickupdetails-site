import { supabase } from './lib/supabase'
import { deleteListingImages } from './lib/delete-listing-images'

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
      return res.status(500).json({ error: 'Failed to verify listing' })
    }

    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    await deleteListingImages(existing.id)

    const { error: deleteError } = await supabase
      .from('listings')
      .delete()
      .eq('edit_token', edit_token.trim())
      .eq('id', existing.id)

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to remove listing' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
