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

    const { error } = await supabase.from('listings').insert([
      {
        title,
        description,
        price,
        contact_email,
        edit_token,
        status: 'active'
      }
    ])

    if (error) {
      return res.status(500).json({ error: 'DB insert failed' })
    }

    const editLink = `https://pickupdetails.com/edit?token=${edit_token}`

    let emailSent = true

    try {
      await resend.emails.send({
        from: 'PickupDetails <onboarding@resend.dev>',
        to: contact_email,
        subject: 'Your listing is live',
        html: `
          <p>Your listing has been created.</p>
          <p>Edit it here:</p>
          <a href="${editLink}">${editLink}</a>
          <p>Save this email to manage your listing.</p>
        `
      })
    } catch (e) {
      emailSent = false
    }

    return res.status(200).json({
      success: true,
      emailSent
    })
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
}