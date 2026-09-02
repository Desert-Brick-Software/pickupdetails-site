const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const buckets = new Map()

function prune(now) {
  if (buckets.size < 200) {
    return
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function getLoginRateLimit(ip) {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    return { limited: false }
  }
  if (bucket.count >= MAX_FAILED_ATTEMPTS) {
    return {
      limited: true,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    }
  }
  return { limited: false }
}

export function recordLoginFailure(ip) {
  const now = Date.now()
  const existing = buckets.get(ip)
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  existing.count += 1
}

export function clearLoginFailures(ip) {
  buckets.delete(ip)
}
