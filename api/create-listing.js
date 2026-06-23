import { supabase } from './lib/supabase'
import { Resend } from 'resend'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { title, description, price, contact_email } = req.body

    if (!title || !description || !contact_email) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const edit_token = crypto.randomBytes(32).toString('hex')

    const { data: listing, error } = await supabase
      .from('listings')
      .insert([
        {
          title,
          description,
          price,
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

    const editUrl = `https://pickupdetails.com/edit.html?token=${edit_token}`
    const publicUrl = `https://pickupdetails.com/listing.html?id=${listing.id}`

    let emailSent = true

    try {
      await resend.emails.send({
        from: 'PickupDetails <onboarding@resend.dev>',
        to: contact_email,
        subject: 'Your listing is live',
        html: `
          <p>Your listing has been created.</p>
          <p>Share your public listing:</p>
          <a href="${publicUrl}">${publicUrl}</a>
          <p>Private edit link (do not share this):</p>
          <a href="${editUrl}">${editUrl}</a>
          <p><strong>Warning:</strong> Do not share the edit link. Anyone with it can change your listing.</p>
          <p>Save this email to manage your listing.</p>
        `
      })
    } catch (e) {
      emailSent = false
    }

    return res.status(200).json({
      success: true,
      emailSent,
      editUrl,
      publicUrl
    })
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
}