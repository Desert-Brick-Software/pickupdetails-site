export function getResendFromAddress() {
  const name = typeof process.env.RESEND_FROM_NAME === 'string'
    ? process.env.RESEND_FROM_NAME.trim()
    : ''
  const email = typeof process.env.RESEND_FROM_EMAIL === 'string'
    ? process.env.RESEND_FROM_EMAIL.trim()
    : ''

  if (!name || !email) {
    throw new Error('RESEND_FROM_NAME and RESEND_FROM_EMAIL must be configured')
  }

  return `${name} <${email}>`
}
