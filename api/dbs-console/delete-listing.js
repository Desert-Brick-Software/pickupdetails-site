import { noStore, requireAdminSession } from '../lib/admin-session'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { deleteAdminListingImages } from '../lib/admin-listing-images'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  noStore(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!requireAdminSession(req, res)) {
    return
  }

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : ''
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ ok: false, error: 'invalid_id' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data: listing, error: lookupError } = await supabaseAdmin
      .from('listings')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (lookupError) {
      console.error('Admin delete lookup failed', lookupError.code || lookupError.message)
      return res.status(500).json({ ok: false, error: 'delete_failed' })
    }

    if (!listing) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }

    try {
      await deleteAdminListingImages(id)
    } catch (err) {
      console.error('Admin listing image cleanup failed', err?.message || 'unknown error')
      return res.status(500).json({ ok: false, error: 'delete_failed' })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('listings')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Admin listing row delete failed', deleteError.code || deleteError.message)
      return res.status(500).json({ ok: false, error: 'delete_failed' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Admin delete request failed', err?.message || 'unknown error')
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
}
