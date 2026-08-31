import { supabase } from './lib/supabase'
import { buildPublicListingUrl, buildSellerEditUrl, getPublicBaseUrl } from './lib/public-listing-url'
import { getResendFromAddress } from './lib/email-sender'
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

function buildConfirmationEmailHtml({ publicUrl, editUrl, homepageUrl }) {
  const marketplaceDescriptionAddon = `Interested? I use Seller's Filter to share pickup details and handle buyer inquiries. The link is in the comments.`

  const defaultShareTemplate = `Interested? View the pickup details and contact me here:

${publicUrl}`

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 600px;">
      <p style="font-size: 18px; font-weight: 600; margin: 0 0 24px;">Your Seller's Filter listing has been created successfully.</p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Share Your Listing</h2>
      <p style="margin: 0 0 8px;">Use your Seller's Filter listing anywhere you're selling. Buyers can review your pickup details before contacting you, helping reduce repetitive questions and unnecessary back-and-forth.</p>
      <p style="margin: 0 0 24px;"><a href="${publicUrl}" style="color: #2563eb;">${publicUrl}</a></p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Facebook Marketplace</h2>
      <p style="margin: 0 0 8px;">Facebook Marketplace requires special handling. URLs placed in Marketplace listing descriptions are not useful or clickable for buyers, while links placed in comments on Marketplace listings can be clickable.</p>
      <p style="margin: 0 0 8px;">Create your Facebook Marketplace listing normally, including the title, price, photos, condition, item description, and other relevant listing information.</p>
      <p style="margin: 0 0 8px;"><strong>Suggested Marketplace description add-on</strong></p>
      <p style="margin: 0 0 8px;">Add this short message to your Marketplace description:</p>
      <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px; padding: 16px; margin: 0 0 16px; white-space: pre-wrap; font-size: 14px;">${escapeHtml(marketplaceDescriptionAddon)}</div>
      <p style="margin: 0 0 8px;">After you publish the Marketplace listing, add a comment to your own listing containing your Seller's Filter public listing URL:</p>
      <p style="margin: 0 0 24px;"><a href="${publicUrl}" style="color: #2563eb;">${publicUrl}</a></p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Sharing Somewhere Else?</h2>
      <p style="margin: 0 0 8px;">When the platform or location supports clickable links, you can use this simple default message:</p>
      <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px; padding: 16px; margin: 0 0 24px; white-space: pre-wrap; font-size: 14px;">${escapeHtml(defaultShareTemplate)}</div>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Keep Your Listing Up to Date</h2>
      <p style="margin: 0 0 8px;">Seller's Filter works best when buyers can trust the information they see. If your availability, pickup details, or other information changes, update your listing.</p>
      <p style="margin: 0 0 8px;"><strong>When your item sells, please mark it as sold promptly.</strong></p>
      <p style="margin: 0 0 24px;">Keeping listings current helps buyers avoid contacting sellers about unavailable items—and helps everyone spend less time asking "Is this available?"</p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Manage Your Listing</h2>
      <p style="margin: 0 0 8px;"><strong>Do not share this link.</strong> Anyone with it can edit your listing.</p>
      <p style="margin: 0 0 8px;"><a href="${editUrl}" style="color: #2563eb;">${editUrl}</a></p>
      <p style="margin: 0 0 24px;"><strong>Save this email.</strong> You'll need the private link above to update your listing or mark the item as sold.</p>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">What is Seller's Filter?</h2>
      <p style="margin: 0 0 8px;">Seller's Filter helps sellers organize pickup information in one place so buyers can review important details before reaching out.</p>
      <ul style="margin: 0 0 24px; padding-left: 20px;">
        <li>Less back-and-forth</li>
        <li>Fewer misunderstandings</li>
        <li>More serious inquiries</li>
      </ul>

      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">Help Us Grow</h2>
      <p style="margin: 0 0 24px;">Know someone who sells online? Share Seller's Filter with them: <a href="${homepageUrl}" style="color: #2563eb;">${homepageUrl}</a></p>

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="margin: 0; font-size: 13px; color: #666;">Built by Desert Brick Software</p>
    </div>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    getPublicBaseUrl()
    getResendFromAddress()
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server configuration error' })
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

    const editUrl = buildSellerEditUrl(edit_token)
    const publicUrl = buildPublicListingUrl(title, listing.id)
    const homepageUrl = getPublicBaseUrl()

    let emailSent = true

    try {
      await resend.emails.send({
        from: getResendFromAddress(),
        to: contact_email,
        subject: "Your Seller's Filter listing is ready",
        html: buildConfirmationEmailHtml({ publicUrl, editUrl, homepageUrl })
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
