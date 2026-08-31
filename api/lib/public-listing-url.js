export function getPublicBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('PUBLIC_BASE_URL is not configured')
  }

  return raw.trim().replace(/\/+$/, '')
}

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
  return `${getPublicBaseUrl()}/l/${buildListingSlug(title, listingId)}`
}

export function buildSellerEditUrl(editToken) {
  return `${getPublicBaseUrl()}/edit.html?token=${editToken}`
}

export function extractUuidSuffixFromSlug(slug) {
  const match = String(slug || '').match(/-([0-9a-f]{8})$/i)
  return match ? match[1].toLowerCase() : null
}
