import bcrypt from 'bcryptjs'
import {
  clearSessionCookie,
  createSessionToken,
  isAdminAuthConfigured,
  noStore,
  safeEqualString,
  setSessionCookie
} from '../lib/admin-session'
import {
  clearLoginFailures,
  getClientIp,
  getLoginRateLimit,
  recordLoginFailure
} from '../lib/admin-rate-limit'

export default async function handler(req, res) {
  noStore(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const ip = getClientIp(req)
  const limit = getLoginRateLimit(ip)
  if (limit.limited) {
    res.setHeader('Retry-After', String(limit.retryAfter))
    return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  }

  if (!isAdminAuthConfigured()) {
    console.error('Admin login is missing required environment variables')
    return res.status(500).json({ ok: false, error: 'server_error' })
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const expectedUsername = process.env.ADMIN_USERNAME
  const passwordHash = process.env.ADMIN_PASSWORD_HASH

  let passwordOk = false
  try {
    passwordOk = await bcrypt.compare(password, passwordHash)
  } catch {
    console.error('Admin password hash verification failed')
    return res.status(500).json({ ok: false, error: 'server_error' })
  }

  const usernameOk = safeEqualString(username, expectedUsername)

  if (!usernameOk || !passwordOk) {
    recordLoginFailure(ip)
    return res.status(401).json({ ok: false, error: 'invalid_credentials' })
  }

  try {
    const token = createSessionToken(expectedUsername)
    setSessionCookie(req, res, token)
    clearLoginFailures(ip)
    return res.status(200).json({ ok: true })
  } catch {
    console.error('Admin session could not be created')
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
}
