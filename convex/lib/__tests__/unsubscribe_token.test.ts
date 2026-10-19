import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../unsubscribe_token'

afterEach(() => vi.unstubAllEnvs())

describe('unsubscribe tokens', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'current-secret')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS', '')
  })

  it('round-trips user and category', async () => {
    const token = await signUnsubscribeToken('k57abc', 'product_updates')
    expect(token).toMatch(/^k57abc\.product_updates\.[A-Za-z0-9_-]+$/)
    await expect(verifyUnsubscribeToken(token)).resolves.toEqual({
      userId: 'k57abc',
      category: 'product_updates',
    })
  })

  it('rejects tampering and a swapped category', async () => {
    const token = await signUnsubscribeToken('k57abc', 'product_updates')
    const [user, , sig] = token.split('.')
    await expect(
      verifyUnsubscribeToken(`${user}.weekly_digest.${sig}`),
    ).resolves.toBeNull()
    await expect(
      verifyUnsubscribeToken(`${user}x.product_updates.${sig}`),
    ).resolves.toBeNull()
    await expect(
      verifyUnsubscribeToken(`${user}.product_updates.${sig}x`),
    ).resolves.toBeNull()
    await expect(
      verifyUnsubscribeToken(`${user}.newsletter.${sig}`),
    ).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('garbage')).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('')).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('a.b.c.d')).resolves.toBeNull()
  })

  it('accepts the previous secret during rotation', async () => {
    const token = await signUnsubscribeToken('k57abc', 'weekly_digest')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'new-secret')
    await expect(verifyUnsubscribeToken(token)).resolves.toBeNull()
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS', 'current-secret')
    await expect(verifyUnsubscribeToken(token)).resolves.toEqual({
      userId: 'k57abc',
      category: 'weekly_digest',
    })
  })

  it('rejects every token when no secret is configured', async () => {
    const token = await signUnsubscribeToken('k57abc', 'product_updates')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', '')
    await expect(verifyUnsubscribeToken(token)).resolves.toBeNull()
  })

  it('throws when signing without a secret', async () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', '')
    await expect(
      signUnsubscribeToken('k57abc', 'product_updates'),
    ).rejects.toThrow('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  })
})
