import { describe, expect, it } from 'vitest'

import {
  normalizeProjectRouteKey,
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
