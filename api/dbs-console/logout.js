import { clearSessionCookie, getAdminSession, noStore } from '../lib/admin-session'

export default async function handler(req, res) {
  noStore(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const session = getAdminSession(req)
  clearSessionCookie(req, res)

  if (!session) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  return res.status(200).json({ ok: true })
}
