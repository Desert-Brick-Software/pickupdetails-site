const PUBLIC_BASE_URL = 'https://pickupdetails.com'

export function titleToSlug(title) {
  const slug = String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'listing'
}

export function uuidSuffix(listingId) {
  return String(listingId || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toLowerCase()
}

export function buildListingSlug(title, listingId) {
  return `${titleToSlug(title)}-${uuidSuffix(listingId)}`
}

export function buildPublicListingUrl(title, listingId) {
  return `${PUBLIC_BASE_URL}/l/${buildListingSlug(title, listingId)}`
}

export function extractUuidSuffixFromSlug(slug) {
  const match = String(slug || '').match(/-([0-9a-f]{8})$/i)
  return match ? match[1].toLowerCase() : null
}
