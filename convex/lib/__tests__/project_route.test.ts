import { describe, expect, it } from 'vitest'

import {
  normalizeProjectRouteKey,
  parseProjectReference,
  resolveProjectOwnerLogin,
} from '../project_route'

describe('normalizeProjectRouteKey', () => {
  it('trims and lowercases route segments for exact index lookups', () => {
    expect(normalizeProjectRouteKey(' Vercel ')).toBe('vercel')
    expect(normalizeProjectRouteKey('Next.JS')).toBe('next.js')
  })

  it('prefers the canonical owner login over the legacy full name owner', () => {
    expect(
      resolveProjectOwnerLogin({
        github: {
          fullName: 'legacy-owner/locatic',
          ownerLogin: 'CanonicalOwner',
        },
      }),
    ).toBe('CanonicalOwner')
  })
})

describe('parseProjectReference', () => {
  it.each([
    ['ada/mapkit', { owner: 'ada', repo: 'mapkit' }],
    [' Ada/MapKit ', { owner: 'Ada', repo: 'MapKit' }],
    ['https://github.com/ada/mapkit', { owner: 'ada', repo: 'mapkit' }],
    ['github.com/ada/mapkit.git', { owner: 'ada', repo: 'mapkit' }],
    [
      'https://github.com/ada/mapkit/tree/main?tab=readme#top',
      { owner: 'ada', repo: 'mapkit' },
    ],
    [
      'https://locatic.dev/project/ada/mapkit',
      { owner: 'ada', repo: 'mapkit' },
    ],
    [
      'https://locatic.dev/project/ada/my%20kit',
      { owner: 'ada', repo: 'my kit' },
    ],
    ['ada/mapkit.git', { owner: 'ada', repo: 'mapkit' }],
    ['ada/mapkit/', { owner: 'ada', repo: 'mapkit' }],
    ['https://github.com/ada/mapkit/', { owner: 'ada', repo: 'mapkit' }],
  ])('%s', (input, expected) => {
    expect(parseProjectReference(input)).toEqual(expected)
  })

  it.each([
    '',
    'mapkit',
    'ada mapkit',
    'https://example.com/ada',
    'a/b/c',
    // Malformed escapes fall back to a name search instead of throwing.
    'https://github.com/%E0',
    'https://github.com/ada/%E0',
  ])('returns null for %j', (input) => {
    expect(parseProjectReference(input)).toBeNull()
  })
})
