import { describe, expect, it } from 'vitest'

import { isContributionsVisibleOnPublicProfile } from '../privacy'

describe('privacy helpers', () => {
  it('treats missing contribution visibility as public', () => {
    expect(isContributionsVisibleOnPublicProfile({})).toBe(true)
  })

  it('hides public contribution surfaces only when explicitly private', () => {
    expect(
      isContributionsVisibleOnPublicProfile({
        contributionsVisibility: 'public',
      }),
    ).toBe(true)
    expect(
      isContributionsVisibleOnPublicProfile({
        contributionsVisibility: 'private',
      }),
    ).toBe(false)
  })
})
