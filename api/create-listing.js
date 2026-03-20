import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { title, description, price, contact_email } = req.body

    const edit_token = crypto.randomBytes(16).toString('hex')

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
      return res.status(500).json({ error })
    }

    const editLink = `https://pickupdetails.com/edit/${edit_token}`

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: contact_email,
      subject: 'Your listing is live',
      html: `
        <p>Your listing has been created.</p>
        <p>Edit it here:</p>
        <a href="${editLink}">${editLink}</a>
      `
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}