import { describe, expect, it } from 'vitest'

import {
  buildOnboardingUrl,
  safeRedirectFromSearch,
  toSafeRelativeUrl,
  validateAuthDestinationSearch,
} from '../safe-redirect'

describe('toSafeRelativeUrl', () => {
  it.each([
    ['/home', '/home'],
    [
      '/explore?scope=global&mode=builders',
      '/explore?scope=global&mode=builders',
    ],
    [
      '/project/octocat/hello-world?tab=comments#comment-1',
      '/project/octocat/hello-world?tab=comments#comment-1',
    ],
    ['/u/octocat#pinned', '/u/octocat#pinned'],
    ['/inbox?tab=inbox&next=%2Fhome', '/inbox?tab=inbox&next=%2Fhome'],
    ['/', '/'],
  ])('keeps the same-origin path, query and hash of %s', (input, expected) => {
    expect(toSafeRelativeUrl(input)).toBe(expected)
  })

  it('normalises dot segments before deciding', () => {
    expect(toSafeRelativeUrl('/explore/../settings')).toBe('/settings')
  })

  it.each([
    'https://evil.example/home',
    'http://localhost:3000/home',
    'javascript:alert(1)',
    'data:text/html,hi',
    'mailto:someone@example.com',
    '//evil.example/home',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/%2F%2Fevil.example',
    '/%2f/evil.example',
    '/%252F%252Fevil.example',
    '/%5Cevil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/%0A/evil.example',
    ' /home',
    'home',
    '',
    '?redirect=/home',
    '#hash',
  ])('rejects the external or malformed destination %j', (input) => {
    expect(toSafeRelativeUrl(input)).toBeNull()
  })

  it.each([
    '/sign-in',
    '/sign-in/',
    '/sign-in/sso-callback?x=1',
    '/sign-up',
    '/sign-up/verify',
    '/onboarding',
    '/onboarding?redirect=%2Fhome',
    '/Sign-In',
    '/home/../sign-in',
    '/%2e%2e/onboarding',
    '/%73ign-in',
  ])('rejects the auth route %j as a destination', (input) => {
    expect(toSafeRelativeUrl(input)).toBeNull()
  })

  it('keeps paths that only share a prefix with an auth route', () => {
    expect(toSafeRelativeUrl('/sign-install')).toBe('/sign-install')
    expect(toSafeRelativeUrl('/u/onboarding')).toBe('/u/onboarding')
  })

  it('rejects malformed percent-encoding', () => {
    expect(toSafeRelativeUrl('/%E0%A4%A')).toBeNull()
  })

  it('rejects oversized destinations', () => {
    expect(toSafeRelativeUrl(`/${'a'.repeat(2048)}`)).toBeNull()
  })
})

describe('safeRedirectFromSearch', () => {
  it('returns the sanitised redirect parameter', () => {
    expect(safeRedirectFromSearch({ redirect: '/settings#privacy' })).toBe(
      '/settings#privacy',
    )
  })

  it.each([undefined, null, 42, ['/home'], { href: '/home' }])(
    'ignores the non-string value %j',
    (redirect) => {
      expect(safeRedirectFromSearch({ redirect })).toBeNull()
    },
  )

  it('ignores an unsafe string', () => {
    expect(safeRedirectFromSearch({ redirect: '//evil.example' })).toBeNull()
  })
})

describe('validateAuthDestinationSearch', () => {
  it('keeps a safe destination', () => {
    expect(
      validateAuthDestinationSearch({ redirect: '/explore?scope=global' }),
    ).toEqual({ redirect: '/explore?scope=global' })
  })

  it('drops unsafe or missing destinations without failing', () => {
    // The key must be present (as undefined) so it overrides the raw value
    // when the router merges `{ ...parentSearch, ...validated }`.
    expect(
      validateAuthDestinationSearch({ redirect: 'https://evil.example' }),
    ).toStrictEqual({ redirect: undefined })
    expect(validateAuthDestinationSearch({})).toStrictEqual({
      redirect: undefined,
    })
  })
})

describe('buildOnboardingUrl', () => {
  it('carries the destination as an encoded redirect parameter', () => {
    const url = buildOnboardingUrl('/project/x/y?tab=comments#comment-1')
    const parsed = new URL(url, 'https://locatic.test')

    expect(parsed.pathname).toBe('/onboarding')
    expect(parsed.hash).toBe('')
    expect(parsed.searchParams.get('redirect')).toBe(
      '/project/x/y?tab=comments#comment-1',
    )
  })

  it('returns plain onboarding when there is no destination', () => {
    expect(buildOnboardingUrl(null)).toBe('/onboarding')
  })
})
