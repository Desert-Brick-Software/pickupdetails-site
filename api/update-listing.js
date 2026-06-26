import { supabase } from './lib/supabase'

const ALLOWED_FIELDS = ['title', 'description', 'price', 'availability']

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { edit_token, ...rest } = req.body || {}

  if (!edit_token || typeof edit_token !== 'string' || !edit_token.trim()) {
    return res.status(400).json({ error: 'Missing edit_token' })
  }

  const updates = {}
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rest, field)) {
      updates[field] = rest[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  try {
    const { data: existing, error: lookupError } = await supabase
      .from('listings')
      .select('id, status')
      .eq('edit_token', edit_token.trim())
      .maybeSingle()

    if (lookupError) {
      return res.status(500).json({ error: 'Failed to verify listing' })
    }

    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (String(existing.status).toLowerCase() === 'sold') {
      return res.status(403).json({ error: 'Listing has been sold and cannot be edited' })
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update(updates)
      .eq('edit_token', edit_token.trim())

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update listing' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
