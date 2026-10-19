import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import { categoryForKind, getSkipReason, isSubscribed } from '../email_audience'
import type { Doc } from '../types'
import { createDefaultViewerProfile } from '../viewer'

type UserOverrides = Partial<Omit<Doc<'users'>, 'notificationPrefs'>> & {
  notificationPrefs?: Partial<Doc<'users'>['notificationPrefs']>
}

function makeUser(overrides: UserOverrides = {}): Doc<'users'> {
  const base = createDefaultViewerProfile({
    clerkId: 'user_1',
    email: 'ada@example.test',
    githubId: 1,
    githubUsername: 'ada',
    githubUrl: 'https://github.com/ada',
    avatarUrl: '',
    displayName: 'Ada',
  })
  const { notificationPrefs, ...rest } = overrides
  return {
    ...base,
    _id: 'k57user' as Id<'users'>,
    _creationTime: 0,
    ...rest,
    notificationPrefs: { ...base.notificationPrefs, ...notificationPrefs },
  }
}

describe('email eligibility', () => {
  it.each([
    ['eligible for updates by default', {}, 'product_updates', null],
    [
      'legacy user without the key',
      { notificationPrefs: { productUpdates: undefined } },
      'product_updates',
      null,
    ],
    [
      'opted out of updates',
      { notificationPrefs: { productUpdates: false } },
      'product_updates',
      'unsubscribed',
    ],
    ['digest needs opt-in', {}, 'weekly_digest', 'unsubscribed'],
    [
      'digest opted in',
      { notificationPrefs: { weeklyDigest: true } },
      'weekly_digest',
      null,
    ],
    [
      'unverified email',
      { emailVerified: false },
      'product_updates',
      'unverified',
    ],
    [
      'legacy user without verification',
      { emailVerified: undefined },
      'product_updates',
      'unverified',
    ],
    [
      'unusable email',
      { email: 'x@y.invalid' },
      'product_updates',
      'unverified',
    ],
    ['deactivated', { deactivatedAt: 1 }, 'product_updates', 'inactive'],
    ['deleted', { deletedAt: 1 }, 'product_updates', 'inactive'],
    ['pending purge', { purgeAfter: 1 }, 'product_updates', 'inactive'],
  ] as const)('%s', (_, overrides, category, reason) => {
    expect(
      getSkipReason(
        makeUser({ emailVerified: true, ...(overrides as UserOverrides) }),
        category,
      ),
    ).toBe(reason)
  })

  it('treats absent optional lifecycle fields as active', () => {
    const user = makeUser({ emailVerified: true })
    const legacy = { ...user } as Partial<Doc<'users'>>
    delete legacy.purgeAfter
    delete legacy.deactivatedAt
    expect(getSkipReason(legacy as Doc<'users'>, 'product_updates')).toBeNull()
  })

  it('maps campaign kinds to categories', () => {
    expect(categoryForKind('announcement')).toBe('product_updates')
    expect(categoryForKind('digest')).toBe('weekly_digest')
  })

  it('reads a missing product-updates key as subscribed', () => {
    expect(
      isSubscribed(
        makeUser({ notificationPrefs: { productUpdates: undefined } }),
        'product_updates',
      ),
    ).toBe(true)
  })
})
