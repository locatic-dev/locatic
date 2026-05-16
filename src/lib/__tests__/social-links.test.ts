import { describe, expect, it } from 'vitest'

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
