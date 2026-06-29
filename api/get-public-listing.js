import { supabase } from './lib/supabase'
import { extractUuidSuffixFromSlug } from './lib/public-listing-url'

const SAFE_FIELDS = 'id, title, description, price, availability, location, image_urls, status, created_at'

function isActiveListing(listing) {
  return listing && String(listing.status).toLowerCase() === 'active'
}

async function fetchListingById(id) {
  const { data, error } = await supabase
    .from('listings')
    .select(SAFE_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { error }
  }

  if (!isActiveListing(data)) {
    return { listing: null }
  }

  return { listing: data }
}

async function fetchListingBySuffix(suffix) {
  const normalized = suffix.toLowerCase()

  if (!/^[0-9a-f]{8}$/.test(normalized)) {
    return { invalidSuffix: true }
  }

  const { data, error } = await supabase.rpc('get_listing_by_uuid_suffix', {
    suffix: normalized
  })

  if (error) {
    return { error }
  }

  const rows = Array.isArray(data) ? data : []

  if (rows.length === 0) {
    return { listing: null }
  }

  if (rows.length > 1) {
    return { ambiguous: true }
  }

  return { listing: rows[0] }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''
  const suffixParam = typeof req.query.suffix === 'string' ? req.query.suffix.trim() : ''
  const slugParam = typeof req.query.slug === 'string' ? req.query.slug.trim() : ''
  const suffix = suffixParam || extractUuidSuffixFromSlug(slugParam)

  if (!id && !suffix) {
    return res.status(400).json({ error: 'Missing id or suffix' })
  }

  try {
    let result

    if (id) {
      result = await fetchListingById(id)
    } else {
      result = await fetchListingBySuffix(suffix)

      if (result.invalidSuffix) {
        return res.status(400).json({ error: 'Invalid suffix' })
      }

      if (result.ambiguous) {
        return res.status(404).json({ error: 'Listing not found' })
      }
    }

    if (result.error) {
      return res.status(500).json({
        error: 'Supabase query failed',
        detail: result.error.message,
        code: result.error.code || null
      })
    }

    if (!result.listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    return res.status(200).json({ listing: result.listing })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
