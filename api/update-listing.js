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
    const { data, error } = await supabase.rpc('update_listing_for_manage', {
      p_edit_token: edit_token.trim(),
      p_title: Object.prototype.hasOwnProperty.call(updates, 'title') ? updates.title : null,
      p_description: Object.prototype.hasOwnProperty.call(updates, 'description') ? updates.description : null,
      p_price: Object.prototype.hasOwnProperty.call(updates, 'price') ? updates.price : null,
      p_availability: Object.prototype.hasOwnProperty.call(updates, 'availability') ? updates.availability : null
    })

    if (error) {
      return res.status(500).json({ error: 'Failed to update listing' })
    }

    if (!data || data.ok === false) {
      if (data && data.error === 'sold') {
        return res.status(403).json({ error: 'Listing has been sold and cannot be edited' })
      }
      return res.status(404).json({ error: 'Listing not found' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
