export interface EmailProviderConfig {
  apiKey: string
  from: string
  replyTo: string
  segmentId: string
  topicId: string
}

export function getEmailProviderConfig(): EmailProviderConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()
  const segmentId = process.env.RESEND_SEGMENT_ID?.trim()
  const topicId = process.env.RESEND_TOPIC_ID?.trim()
  if (!apiKey || !from || !replyTo || !segmentId || !topicId) {
    return null
  }
  return { apiKey, from, replyTo, segmentId, topicId }
}

export function compactProviderError(error: unknown) {
  if (!error || typeof error !== 'object') return 'provider request failed'
  const value = error as {
    message?: unknown
    name?: unknown
    statusCode?: unknown
  }
  const name = typeof value.name === 'string' ? value.name : 'provider_error'
  const status =
    typeof value.statusCode === 'number' ? ` (${value.statusCode})` : ''
  const message =
    typeof value.message === 'string'
      ? value.message.replace(/re_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300)
      : 'request failed'
  return `${name}${status}: ${message}`
}

export function isTransientProviderError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: unknown; statusCode?: unknown }
  return (
    value.statusCode === 408 ||
    value.statusCode === 409 ||
    value.statusCode === 429 ||
    (typeof value.statusCode === 'number' && value.statusCode >= 500) ||
    (typeof value.name === 'string' &&
      /rate_limit|timeout|temporar|connection/i.test(value.name))
  )
}
