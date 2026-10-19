import type { EmailCategory } from './email_audience'

// Token: `userId.category.signature`, where signature is
// base64url(HMAC-SHA256(secret, "userId:category")). Tokens do not expire:
// an unsubscribe link must keep working (CAN-SPAM requires at least 30 days).

const encoder = new TextEncoder()
const CATEGORIES: readonly EmailCategory[] = [
  'product_updates',
  'weekly_digest',
]

function toBase64Url(bytes: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function signature(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toBase64Url(
    await crypto.subtle.sign('HMAC', key, encoder.encode(message)),
  )
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export async function signUnsubscribeToken(
  userId: string,
  category: EmailCategory,
) {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
  if (!secret) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  return `${userId}.${category}.${await signature(secret, `${userId}:${category}`)}`
}

/**
 * Checks a token against the current secret and, during rotation, the
 * previous one. Returns null for anything malformed or unsigned.
 */
export async function verifyUnsubscribeToken(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, category, sig] = parts as [string, string, string]
  if (!userId || !sig || !CATEGORIES.includes(category as EmailCategory)) {
    return null
  }
  const secrets = [
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim(),
    process.env.EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS?.trim(),
  ].filter((value): value is string => Boolean(value))
  for (const secret of secrets) {
    if (
      constantTimeEqual(sig, await signature(secret, `${userId}:${category}`))
    ) {
      return { userId, category: category as EmailCategory }
    }
  }
  return null
}
