import { getAdminSession, noStore } from '../lib/admin-session'

export default async function handler(req, res) {
  noStore(res)

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const session = getAdminSession(req)
  if (!session) {
    return res.status(401).json({ authenticated: false })
  }

  return res.status(200).json({ authenticated: true })
}
