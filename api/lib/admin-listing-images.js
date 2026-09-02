import { getSupabaseAdmin } from './supabase-admin'

const BUCKET = 'listing-images'
const LIST_PAGE_SIZE = 100

async function listObjectPaths(supabaseAdmin, prefix) {
  const paths = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset
    })

    if (error) {
      throw error
    }

    const entries = Array.isArray(data) ? data : []
    if (entries.length === 0) {
      break
    }

    for (const entry of entries) {
      if (!entry?.name) {
        continue
      }

      const path = `${prefix}/${entry.name}`
      const isFolder = entry.id == null

      if (isFolder) {
        const nested = await listObjectPaths(supabaseAdmin, path)
        paths.push(...nested)
      } else {
        paths.push(path)
      }
    }

    if (entries.length < LIST_PAGE_SIZE) {
      break
    }

    offset += LIST_PAGE_SIZE
  }

  return paths
}

export async function deleteAdminListingImages(listingId) {
  const supabaseAdmin = getSupabaseAdmin()
  const paths = await listObjectPaths(supabaseAdmin, listingId)

  if (paths.length === 0) {
    return
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths)
  if (error) {
    throw error
  }

  const remaining = await listObjectPaths(supabaseAdmin, listingId)
  if (remaining.length > 0) {
    throw new Error('Listing images were not fully removed')
  }
}
