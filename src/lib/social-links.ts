type SocialPlatform = 'github' | 'linkedin' | 'website' | 'x' | 'bluesky'

function normalizeTrimmed(value: string) {
  return value.trim()
}

export function normalizeHandle(value: string) {
  const trimmed = normalizeTrimmed(value)
  if (!trimmed) return null

  return trimmed
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^https?:\/\/(www\.)?bsky\.app\/profile\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
}

export function normalizeHttpsUrl(value: string) {
  const trimmed = normalizeTrimmed(value)
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }

    return `https://${url.host}${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function normalizeSocialLinkValue(
  platform: SocialPlatform,
  value: string,
) {
  if (platform === 'github' || platform === 'x' || platform === 'bluesky') {
    return normalizeHandle(value)
  }

  return normalizeHttpsUrl(value)
}

/** linkedin.com itself or any of its subdomains (`www.`, `in.`, …). */
function isLinkedInHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'linkedin.com' || host.endsWith('.linkedin.com')
}

export function socialLinkHref(platform: SocialPlatform, value: string | null) {
  if (!value) return null

  if (platform === 'github') return `https://github.com/${value}`
  if (platform === 'x') return `https://x.com/${value}`
  if (platform === 'bluesky') return `https://bsky.app/profile/${value}`

  const href = normalizeHttpsUrl(value)
  // The LinkedIn icon must not front an arbitrary site.
  if (
    href &&
    platform === 'linkedin' &&
    !isLinkedInHost(new URL(href).hostname)
  ) {
    return null
  }
  return href
}
