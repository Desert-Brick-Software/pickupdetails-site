import { supabase } from './lib/supabase'
import { Resend } from 'resend'
import crypto from 'crypto'
import formidable from 'formidable'
import fs from 'fs'

const resend = new Resend(process.env.RESEND_API_KEY)

export const config = {
  api: {
    bodyParser: false
  }
}

const BUCKET = 'listing-images'
const MAX_IMAGES = 3
const MAX_FILE_SIZE = 3 * 1024 * 1024

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFiles: MAX_IMAGES,
      maxFileSize: MAX_FILE_SIZE,
      multiples: true
    })
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err)
        return
      }
      resolve({ fields, files })
    })
  })
}

function firstField(fields, name) {
  const value = fields[name]
  if (Array.isArray(value)) {
    return (value[0] || '').trim()
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}

function optionalField(fields, name) {
  const value = firstField(fields, name)
  return value || null
}

function collectImageFiles(files) {
  const raw = files.images
  if (!raw) {
    return []
  }
  return Array.isArray(raw) ? raw : [raw]
}

function cleanupTempFiles(imageFiles) {
  for (const file of imageFiles) {
    if (file.filepath) {
      try {
        fs.unlinkSync(file.filepath)
      } catch {
        // ignore temp cleanup errors
      }
    }
  }
}

async function uploadListingImages(listingId, imageFiles) {
  const urls = []

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i]
    const mime = file.mimetype || ''

    if (!mime.startsWith('image/')) {
      throw new Error('Only image files are allowed.')
    }

    const buffer = fs.readFileSync(file.filepath)
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error('One or more images are too large. Try smaller photos.')
    }

    const path = `${listingId}/${i + 1}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    })

    if (error) {
      throw new Error('Image upload failed. Please try again.')
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  return urls
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildConfirmationEmailHtml({ title, description, publicUrl, editUrl }) {
  const marketplacePost = `${title}

${description}

To make pickup easier, I've posted availability, location details, and answers to common questions here:

${publicUrl}

If you're interested, please review the details and submit a contact request through the listing.`

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 600px;">
      <p style="font-size: 18px; font-weight: 600; margin: 0 0 24px;">Your PickupDetails listing has been created successfully.</p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Share Your Listing</h2>
      <p style="margin: 0 0 8px;">Share your listing link anywhere you're selling — Facebook Marketplace, Craigslist, OfferUp, and more. Buyers can review pickup information, availability, and other details before contacting you.</p>
      <p style="margin: 0 0 24px;"><a href="${publicUrl}" style="color: #2563eb;">${publicUrl}</a></p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Suggested Marketplace Post</h2>
      <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px; padding: 16px; margin: 0 0 24px; white-space: pre-wrap; font-size: 14px;">${escapeHtml(marketplacePost)}</div>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Manage Your Listing</h2>
      <p style="margin: 0 0 8px;"><strong>Do not share this link.</strong> Anyone with it can edit your listing.</p>
      <p style="margin: 0 0 8px;"><a href="${editUrl}" style="color: #2563eb;">${editUrl}</a></p>
      <p style="margin: 0 0 24px;">Save this email so you can edit your listing later.</p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">What is PickupDetails?</h2>
      <p style="margin: 0 0 8px;">PickupDetails helps sellers organize pickup information in one place so buyers can review important details before reaching out.</p>
      <ul style="margin: 0 0 24px; padding-left: 20px;">
        <li>Less back-and-forth</li>
        <li>Fewer misunderstandings</li>
        <li>More serious inquiries</li>
      </ul>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Help Us Grow</h2>
      <p style="margin: 0 0 24px;">Know someone who sells online? Share PickupDetails with them: <a href="https://pickupdetails.com" style="color: #2563eb;">https://pickupdetails.com</a></p>

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="margin: 0; font-size: 13px; color: #666;">Built by Desert Brick Software</p>
    </div>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let tempFiles = []

  try {
    const { fields, files } = await parseMultipart(req)
    const title = firstField(fields, 'title')
    const description = firstField(fields, 'description')
    const contact_email = firstField(fields, 'contact_email')
    const price = optionalField(fields, 'price')
    const availability = optionalField(fields, 'availability')
    const location = optionalField(fields, 'location')

    if (!title || !description || !contact_email) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const imageFiles = collectImageFiles(files)
    tempFiles = imageFiles

    if (imageFiles.length > MAX_IMAGES) {
      return res.status(400).json({ error: 'You can upload up to 3 photos.' })
    }

    for (const file of imageFiles) {
      const mime = file.mimetype || ''
      if (!mime.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image files are allowed.' })
      }
    }

    const edit_token = crypto.randomBytes(32).toString('hex')

    const { data: listing, error } = await supabase
      .from('listings')
      .insert([
        {
          title,
          description,
          price,
          availability,
          location,
          contact_email,
          edit_token,
          status: 'active'
        }
      ])
      .select('id')
      .single()

    if (error) {
      return res.status(500).json({ error: 'DB insert failed' })
    }

    let image_urls = []

    if (imageFiles.length > 0) {
      try {
        image_urls = await uploadListingImages(listing.id, imageFiles)
      } catch (uploadError) {
        return res.status(500).json({
          error: uploadError.message || 'Image upload failed. Please try again.'
        })
      }

      const { error: updateError } = await supabase
        .from('listings')
        .update({ image_urls })
        .eq('id', listing.id)

      if (updateError) {
        return res.status(500).json({ error: 'Failed to save image URLs. Please try again.' })
      }
    }

    const editUrl = `https://pickupdetails.com/edit.html?token=${edit_token}`
    const publicUrl = `https://pickupdetails.com/listing.html?id=${listing.id}`

    let emailSent = true

    try {
      await resend.emails.send({
        from: 'PickupDetails <onboarding@resend.dev>',
        to: contact_email,
        subject: 'Your PickupDetails listing is ready',
        html: buildConfirmationEmailHtml({ title, description, publicUrl, editUrl })
      })
    } catch {
      emailSent = false
    }

    return res.status(200).json({
      success: true,
      emailSent,
      editUrl,
      publicUrl,
      image_urls
    })
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'One or more images are too large. Try smaller photos.' })
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.httpCode === 413) {
      return res.status(400).json({ error: 'You can upload up to 3 photos.' })
    }
    return res.status(500).json({ error: 'Server error' })
  } finally {
    cleanupTempFiles(tempFiles)
  }
}
