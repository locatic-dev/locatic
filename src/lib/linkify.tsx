import type { ReactNode } from 'react'

export type LinkPart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }

// Matches http(s) URLs. Trailing sentence punctuation is trimmed afterwards so
// "see https://a.com." doesn't capture the period into the href.
const URL_PATTERN = /https?:\/\/[^\s]+/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/

/**
 * Split free text into ordered text and link segments. Pure and
 * environment-agnostic so it can be unit tested without a DOM.
 */
export function splitLinkParts(text: string): LinkPart[] {
  if (!text) {
    return []
  }

  const parts: LinkPart[] = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchIndex = match.index ?? 0
    const rawUrl = match[0]
    const href = rawUrl.replace(TRAILING_PUNCTUATION, '')
    const trailing = rawUrl.slice(href.length)

    if (matchIndex > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, matchIndex) })
    }

    parts.push({ type: 'link', value: href, href })

    if (trailing) {
      parts.push({ type: 'text', value: trailing })
    }

    lastIndex = matchIndex + rawUrl.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts
}

/**
 * Render free text with any http(s) URLs turned into safe external links.
 * Plain strings are returned untouched.
 */
export function linkify(text: string): ReactNode {
  const parts = splitLinkParts(text)

  return parts.map((part, index) => {
    if (part.type === 'link') {
      return (
        <a
          key={index}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand underline-offset-2 hover:underline wrap-anywhere"
        >
          {part.value}
        </a>
      )
    }

    return <span key={index}>{part.value}</span>
  })
}
