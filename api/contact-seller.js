import { supabase } from './lib/supabase'
import { getResendFromAddress } from './lib/email-sender'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function trimString(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const BUYER_DECLARATIONS = {
  ready_to_purchase: {
    label: 'Ready to purchase',
    meaning: "I'm prepared to purchase this item if it matches the listing/description."
  },
  interested_still_looking: {
    label: 'Interested but still looking',
    meaning: "I'm interested, but I'd like to inspect or consider the item before committing to purchase."
  }
}

function resolveBuyerDeclaration(value) {
  const key = trimString(value)
  if (!Object.prototype.hasOwnProperty.call(BUYER_DECLARATIONS, key)) {
    return null
  }
  return { value: key, ...BUYER_DECLARATIONS[key] }
}

function buildSellerEmailHtml(listing, buyer) {
  const title = escapeHtml(listing.title || "Seller's Filter listing")
  const priceBlock = listing.price
    ? `<p><strong>Price:</strong> ${escapeHtml(listing.price)}</p>`
    : ''
  const locationBlock = listing.location
    ? `<p><strong>Pickup area:</strong> ${escapeHtml(listing.location)}</p>`
    : ''
  const availabilityBlock = listing.availability
    ? `<p><strong>Availability:</strong> ${escapeHtml(listing.availability)}</p>`
    : ''
  const phoneBlock = buyer.phone
    ? `<p><strong>Buyer phone:</strong> ${escapeHtml(buyer.phone)}</p>`
    : ''
  const declaration = buyer.declaration
  const declarationBlock = declaration
    ? `<p><strong>Buyer declaration: ${escapeHtml(declaration.label)}</strong></p>
    <p>${escapeHtml(declaration.meaning)}</p>`
    : ''

  return `
    <h2>New buyer inquiry</h2>
    <p><strong>Item:</strong> ${title}</p>
    ${priceBlock}
    ${locationBlock}
    ${availabilityBlock}
    <hr />
    <p><strong>Buyer name:</strong> ${escapeHtml(buyer.name)}</p>
    <p><strong>Buyer email:</strong> ${escapeHtml(buyer.email)}</p>
    ${phoneBlock}
    ${declarationBlock}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(buyer.message).replace(/\n/g, '<br />')}</p>
    <hr />
    <p><strong>Buyer acknowledgments:</strong></p>
    <p>✓ I understand this item may sell before the seller responds.</p>
    <hr />
    <p>You can reply directly to the buyer's email address above.</p>
  `
}

function buildBuyerEmailHtml(listingTitle) {
  const title = escapeHtml(listingTitle || 'this item')
  return `
    <p>Your inquiry about ${title} has been sent.</p>
    <p>If the seller is interested, they'll contact you using the email address you provided.</p>
    <p>No further action is needed.</p>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let fromAddress
  try {
    fromAddress = getResendFromAddress()
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server configuration error' })
  }

  const body = req.body || {}
  const listing_id = trimString(body.listing_id)
  const buyer_name = trimString(body.buyer_name)
  const buyer_email = trimString(body.buyer_email)
  const buyer_phone = trimString(body.buyer_phone) || null
  const buyer_message = trimString(body.buyer_message)
  const acknowledge_may_sell = body.acknowledge_may_sell === true
  const buyer_declaration = resolveBuyerDeclaration(body.buyer_declaration)
  const phone_contact_consent = body.phone_contact_consent === true

  if (!listing_id) {
    return res.status(400).json({ error: 'listing_id is required' })
  }

  if (!buyer_name) {
    return res.status(400).json({ error: 'buyer_name is required' })
  }

  if (!buyer_email) {
    return res.status(400).json({ error: 'buyer_email is required' })
  }

  if (!isValidEmail(buyer_email)) {
    return res.status(400).json({ error: 'buyer_email must be a valid email address' })
  }

  if (!buyer_message) {
    return res.status(400).json({ error: 'buyer_message is required' })
  }

  if (!acknowledge_may_sell) {
    return res.status(400).json({ error: 'acknowledge_may_sell must be true' })
  }

  if (!buyer_declaration) {
    return res.status(400).json({
      error: 'buyer_declaration must be ready_to_purchase or interested_still_looking'
    })
  }

  if (buyer_phone && !phone_contact_consent) {
    return res.status(400).json({ error: 'phone_contact_consent must be true when buyer_phone is provided' })
  }

  try {
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, title, price, availability, location, status, contact_email')
      .eq('id', listing_id)
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: 'Failed to look up listing' })
    }

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (String(listing.status).toLowerCase() !== 'active') {
      return res.status(400).json({ error: 'Listing is no longer available.' })
    }

    if (!listing.contact_email) {
      return res.status(500).json({ error: 'Seller contact email is unavailable.' })
    }

    const buyer = {
      name: buyer_name,
      email: buyer_email,
      phone: buyer_phone && phone_contact_consent ? buyer_phone : null,
      message: buyer_message,
      declaration: buyer_declaration
    }

    const listingTitle = listing.title || "Seller's Filter listing"
    const safeSubjectTitle = listingTitle.replace(/[\r\n]/g, ' ')

    await resend.emails.send({
      from: fromAddress,
      to: listing.contact_email,
      subject: `New inquiry: ${safeSubjectTitle}`,
      html: buildSellerEmailHtml(listing, buyer)
    })

    await resend.emails.send({
      from: fromAddress,
      to: buyer_email,
      subject: 'Your message was sent',
      html: buildBuyerEmailHtml(listingTitle)
    })

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Failed to send message. Please try again.' })
  }
}
