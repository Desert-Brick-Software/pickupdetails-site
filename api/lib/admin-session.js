import crypto from 'crypto'

export const ADMIN_COOKIE_NAME = 'dbs_admin_session'
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (typeof secret !== 'string' || secret.length < 32) {
    return null
  }
  return secret
}

export function isAdminAuthConfigured() {
  const username = process.env.ADMIN_USERNAME
  const passwordHash = process.env.ADMIN_PASSWORD_HASH
  return (
    typeof username === 'string' &&
    username.length > 0 &&
    typeof passwordHash === 'string' &&
    passwordHash.length > 0 &&
    Boolean(getSessionSecret())
  )
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function safeEqualString(a, b) {
  const strA = String(a)
  const strB = String(b)
  const max = Math.max(strA.length, strB.length, 1)
  const padA = Buffer.alloc(max)
  const padB = Buffer.alloc(max)
  Buffer.from(strA).copy(padA)
  Buffer.from(strB).copy(padB)
  const contentMatch = crypto.timingSafeEqual(padA, padB)
  return contentMatch && strA.length === strB.length
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  if (options.path) {
    parts.push(`Path=${options.path}`)
  }
  if (options.httpOnly) {
    parts.push('HttpOnly')
  }
  if (options.secure) {
    parts.push('Secure')
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }

  return parts.join('; ')
}

function useSecureCookie(req) {
  const proto = req?.headers?.['x-forwarded-proto']
  if (proto === 'https') {
    return true
  }
  if (proto === 'http') {
    return false
  }
  const vercelEnv = process.env.VERCEL_ENV
  return vercelEnv === 'production' || vercelEnv === 'preview'
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    secure: useSecureCookie(req),
    sameSite: 'Strict',
    path: '/',
    maxAge
  }
}

export function createSessionToken(username) {
  const secret = getSessionSecret()
  if (!secret) {
    throw new Error('Admin session is not configured')
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    sub: String(username),
    iat: now,
    exp: now + ADMIN_SESSION_TTL_SECONDS
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${payloadB64}.${signPayload(payloadB64, secret)}`
}

export function verifySessionToken(token) {
  const secret = getSessionSecret()
  if (!secret || typeof token !== 'string') {
    return null
  }

  const dot = token.lastIndexOf('.')
  if (dot < 1) {
    return null
  }

  const payloadB64 = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = signPayload(payloadB64, secret)

  if (!safeEqualString(signature, expected)) {
    return null
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (!payload || payload.v !== 1 || typeof payload.sub !== 'string' || !payload.sub) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    return null
  }

  return { username: payload.sub, exp: payload.exp }
}

export function readCookie(req, name) {
  const header = req.headers.cookie
  if (!header || typeof header !== 'string') {
    return null
  }

  const parts = header.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) {
      continue
    }
    const key = part.slice(0, idx).trim()
    if (key !== name) {
      continue
    }
    try {
      return decodeURIComponent(part.slice(idx + 1).trim())
    } catch {
      return null
    }
  }

  return null
}

export function getAdminSession(req) {
  const token = readCookie(req, ADMIN_COOKIE_NAME)
  if (!token) {
    return null
  }
  return verifySessionToken(token)
}

export function setSessionCookie(req, res, token) {
  res.setHeader('Set-Cookie', serializeCookie(ADMIN_COOKIE_NAME, token, cookieOptions(req, ADMIN_SESSION_TTL_SECONDS)))
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', serializeCookie(ADMIN_COOKIE_NAME, '', cookieOptions(req, 0)))
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store')
}

export function requireAdminSession(req, res) {
  const session = getAdminSession(req)
  if (!session) {
    noStore(res)
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return null
  }
  return session
}
