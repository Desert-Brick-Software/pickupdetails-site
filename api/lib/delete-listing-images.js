import { supabase } from './supabase'

const BUCKET = 'listing-images'
const MAX_IMAGES = 3

export async function deleteListingImages(listingId) {
  const paths = []

  const { data: files } = await supabase.storage.from(BUCKET).list(listingId)
  if (files && files.length > 0) {
    for (const file of files) {
      if (file.name) {
        paths.push(`${listingId}/${file.name}`)
      }
    }
  }

  if (paths.length === 0) {
    for (let i = 1; i <= MAX_IMAGES; i++) {
      paths.push(`${listingId}/${i}.jpg`)
    }
  }

  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) {
    console.error('Failed to delete listing images:', error.message)
  }
}
