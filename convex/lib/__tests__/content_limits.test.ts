import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import {
  CONTENT_LIMITS,
  assertMaxLength,
  assertProfileTextLimits,
} from '../content_limits'

describe('assertMaxLength', () => {
  it('accepts text up to the limit and empty values', () => {
    expect(() =>
      assertMaxLength('comment', 'x'.repeat(CONTENT_LIMITS.comment)),
    ).not.toThrow()
    expect(() => assertMaxLength('reportDetails', null)).not.toThrow()
    expect(() => assertMaxLength('bio', '')).not.toThrow()
  })

  it('rejects text past the limit with a readable message', () => {
    expect(() =>
      assertMaxLength('post', 'x'.repeat(CONTENT_LIMITS.post + 1)),
    ).toThrow(new ConvexError('Post must be 5,000 characters or fewer'))
  })
})

describe('assertProfileTextLimits', () => {
  const profile = {
    displayName: 'Ada',
    bio: 'shipping things',
    socialLinks: {
      github: 'ada',
      x: null,
      linkedin: null,
      bluesky: null,
      website: 'https://ada.dev',
    },
  }

  it('accepts a normal profile', () => {
    expect(() => assertProfileTextLimits(profile)).not.toThrow()
  })

  it('rejects a long bio, display name or social link', () => {
    expect(() =>
      assertProfileTextLimits({ ...profile, bio: 'x'.repeat(141) }),
    ).toThrow(/Bio/)
    expect(() =>
      assertProfileTextLimits({ ...profile, displayName: 'x'.repeat(65) }),
    ).toThrow(/Display name/)
    expect(() =>
      assertProfileTextLimits({
        ...profile,
        socialLinks: { ...profile.socialLinks, website: 'x'.repeat(2049) },
      }),
    ).toThrow(/Social link/)
  })
})
