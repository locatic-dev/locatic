import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEmailConfig, isLiveDelivery } from '../email_provider'

afterEach(() => vi.unstubAllEnvs())

describe('email configuration', () => {
  it('keeps the component in test mode unless a sending switch is on', () => {
    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', '')
    expect(isLiveDelivery()).toBe(false)
    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', 'true')
    expect(isLiveDelivery()).toBe(true)
    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', '')
    vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
    expect(isLiveDelivery()).toBe(true)
  })

  it('reports missing sender configuration', () => {
    vi.stubEnv('EMAIL_FROM', 'Locatic <updates@locatic.dev>')
    vi.stubEnv('EMAIL_REPLY_TO', '')
    vi.stubEnv('SITE_URL', '')
    vi.stubEnv('EMAIL_POSTAL_ADDRESS', '')
    expect(getEmailConfig()).toBeNull()
    vi.stubEnv('EMAIL_REPLY_TO', 'hello@locatic.dev')
    vi.stubEnv('SITE_URL', 'https://locatic.dev/')
    expect(getEmailConfig()).toEqual({
      from: 'Locatic <updates@locatic.dev>',
      replyTo: 'hello@locatic.dev',
      siteUrl: 'https://locatic.dev',
      postalAddress: null,
    })
    vi.stubEnv('EMAIL_POSTAL_ADDRESS', ' PO Box 1 ')
    expect(getEmailConfig()?.postalAddress).toBe('PO Box 1')
  })
})
