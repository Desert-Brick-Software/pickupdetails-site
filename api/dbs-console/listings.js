import { noStore, requireAdminSession } from '../lib/admin-session'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { buildListingSlug } from '../lib/public-listing-url'

const LISTING_FIELDS = [
  'id',
  'title',
  'price',
  'location',
  'contact_email',
  'status',
  'image_urls',
  'created_at',
  'sold_at',
  'last_viewed_at',
  'view_count'
]

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function queryString(query, key) {
  const value = query?.[key]
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }
  return typeof value === 'string' ? value : ''
}

function parsePage(value) {
  const page = Number.parseInt(value, 10)
  if (!Number.isFinite(page) || page < 1) {
    return 1
  }
  return page
}

function parseLimit(value) {
  const limit = Number.parseInt(value, 10)
  if (!Number.isFinite(limit) || limit < 1) {
    return DEFAULT_LIMIT
  }
  return Math.min(limit, MAX_LIMIT)
}

function parseStatus(value) {
  const status = String(value || 'all').trim().toLowerCase()
  if (status === 'active' || status === 'sold' || status === 'all') {
    return status
  }
  return 'all'
}

function parseSort(value) {
  const sort = String(value || 'newest').trim().toLowerCase()
  return sort === 'oldest' ? 'oldest' : 'newest'
}

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[%_,*()\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function mapListing(row) {
  const listing = {}
  for (const field of LISTING_FIELDS) {
    listing[field] = row?.[field] ?? null
  }
  const viewCount = Number(listing.view_count)
  listing.view_count = Number.isFinite(viewCount) && viewCount > 0 ? viewCount : 0
  listing.public_path = `/l/${buildListingSlug(listing.title, listing.id)}`
  return listing
}

export default async function handler(req, res) {
  noStore(res)

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!requireAdminSession(req, res)) {
    return
  }

  const status = parseStatus(queryString(req.query, 'status'))
  const sort = parseSort(queryString(req.query, 'sort'))
  const q = sanitizeSearch(queryString(req.query, 'q'))
  const page = parsePage(queryString(req.query, 'page'))
  const limit = parseLimit(queryString(req.query, 'limit'))
  const from = (page - 1) * limit
  const to = from + limit - 1

  try {
    const supabaseAdmin = getSupabaseAdmin()
    let query = supabaseAdmin
      .from('listings')
      .select(LISTING_FIELDS.join(', '), { count: 'exact' })
      .order('created_at', { ascending: sort === 'oldest' })
      .range(from, to)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    if (q) {
      const pattern = `%${q}%`
      query = query.or(
        `title.ilike."${pattern}",contact_email.ilike."${pattern}",location.ilike."${pattern}"`
      )
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Admin listings query failed', error.code || error.message)
      return res.status(500).json({ ok: false, error: 'server_error' })
    }

    const listings = Array.isArray(data) ? data.map(mapListing) : []

    return res.status(200).json({
      ok: true,
      listings,
      page,
      limit,
      total: typeof count === 'number' ? count : listings.length
    })
  } catch (err) {
    console.error('Admin listings request failed', err?.message || 'unknown error')
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
}
