import { supabase } from './lib/supabase'
import { extractUuidSuffixFromSlug } from './lib/public-listing-url'

function classifyListing(listing) {
  if (!listing) {
    return { listing: null }
  }

  const status = String(listing.status).toLowerCase()

  if (status === 'active') {
    return { listing }
  }

  if (status === 'sold') {
    return { sold: true, id: listing.id || null }
  }

  return { listing: null }
}

async function recordPublicView(listingId) {
  if (!listingId) {
    return
  }

  try {
    const { error } = await supabase.rpc('record_public_listing_view', {
      p_id: listingId
    })

    if (error) {
      console.error('Failed to record public listing view', error.code || error.message)
    }
  } catch {
    console.error('Failed to record public listing view')
  }
}

async function fetchListingById(id) {
  const { data, error } = await supabase.rpc('get_public_listing_by_id', {
    p_id: id
  })

  if (error) {
    return { error }
  }

  return classifyListing(data)
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

  return classifyListing(rows[0])
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
        return res.status(200).json({ sold: true })
      }
    }

    if (result.error) {
      return res.status(500).json({
        error: 'Supabase query failed',
        detail: result.error.message,
        code: result.error.code || null
      })
    }

    if (result.sold) {
      await recordPublicView(result.id)
      return res.status(200).json({ sold: true })
    }

    if (!result.listing) {
      return res.status(200).json({ sold: true })
    }

    await recordPublicView(result.listing.id)
    return res.status(200).json({ listing: result.listing })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
}
