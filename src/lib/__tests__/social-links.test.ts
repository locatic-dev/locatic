import { describe, expect, it, vi } from 'vitest'

import {
  normalizeHandle,
  normalizeHttpsUrl,
  normalizeSocialLinkValue,
  socialLinkHref,
} from '../social-links'

describe('social links', () => {
  it('normalizes social handles from urls and @ prefixes', () => {
    expect(normalizeHandle('@builder')).toBe('builder')
    expect(normalizeHandle('https://x.com/shipper/')).toBe('shipper')
    expect(normalizeHandle('https://bsky.app/profile/dev.bsky.social')).toBe(
      'dev.bsky.social',
    )
  })

  it('normalizes website-style values to https urls', () => {
    expect(normalizeHttpsUrl('example.com/docs')).toBe(
      'https://example.com/docs',
    )
    expect(normalizeHttpsUrl('http://example.com')).toBe('https://example.com/')
    expect(normalizeHttpsUrl('javascript:alert(1)')).toBeNull()
  })

  it('builds outbound hrefs safely', () => {
    expect(
      normalizeSocialLinkValue('linkedin', 'linkedin.com/in/locatic'),
    ).toBe('https://linkedin.com/in/locatic')
    expect(socialLinkHref('github', 'octocat')).toBe(
      'https://github.com/octocat',
    )
    expect(socialLinkHref('x', 'shipper')).toBe('https://x.com/shipper')
    expect(socialLinkHref('website', 'locatic.dev')).toBe(
      'https://locatic.dev/',
    )
  })
})

it('rejects malformed hostnames even when the browser URL parser accepts and escapes them', () => {
  // Some URL implementations escape invalid hostnames instead of rejecting them.
  class LenientURL {
    protocol = 'https:'
    hostname = 'not%20a%20valid%20website'
    host = this.hostname
    pathname = '/'
    search = ''
    hash = ''
  }
  vi.stubGlobal('URL', LenientURL)
  try {
    expect(normalizeHttpsUrl('not a valid website')).toBeNull()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('keeps encoded spaces in a valid path and international domain names supported', () => {
  expect(normalizeHttpsUrl('example.com/a b')).toBe('https://example.com/a%20b')
  expect(normalizeHttpsUrl('bücher.de')).toBe('https://xn--bcher-kva.de/')
})
