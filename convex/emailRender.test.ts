import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { Resend } from '@convex-dev/resend'
import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const draft = {
  subject: 'Maps are live',
  preheader: '',
  content: {
    kind: 'announcement' as const,
    body: 'Hello [settings]({{UNSUBSCRIBE_URL}})',
    cta: null,
  },
}

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  rateLimiterTest.register(t)
  return t
}

beforeEach(() => {
  vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
  vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', 'true')
  vi.stubEnv('EMAIL_SENDING_ENABLED', '')
  vi.stubEnv(
    'EMAIL_TEST_RECIPIENTS',
    'Admin@Example.test, delivered@resend.dev',
  )
  vi.stubEnv('EMAIL_FROM', 'Locatic <updates@locatic.test>')
  vi.stubEnv('EMAIL_REPLY_TO', 'hello@locatic.test')
  vi.stubEnv('SITE_URL', 'https://locatic.test')
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('emailRender.sendTest', () => {
  it('sends one marked copy to an allowlisted address, with no send record', async () => {
    const t = setup()
    await seedUser(t, { username: 'admin' })
    const sendEmail = vi.spyOn(Resend.prototype, 'sendEmail')

    await t
      .withIdentity({ subject: fixtureClerkId('admin') })
      .action(api.emailRender.sendTest, {
        ...draft,
        recipient: 'admin@example.TEST',
      })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [, options] = sendEmail.mock.calls[0] as unknown as [
      unknown,
      { to: string; subject: string; html: string; text: string },
    ]
    expect(options.to).toBe('admin@example.TEST')
    expect(options.subject).toBe('[test] Maps are live')
    expect(options.html).toContain(
      'https://locatic.test/settings?tab=notifications',
    )
    expect(options.html).not.toContain('{{UNSUBSCRIBE_URL}}')
    expect(options.text).not.toContain('{{UNSUBSCRIBE_URL}}')
    expect(await t.run((ctx) => ctx.db.query('email_sends').collect())).toEqual(
      [],
    )
  })

  it('refuses addresses outside the allowlist, when switched off, and for non-admins', async () => {
    const t = setup()
    await seedUser(t, { username: 'admin' })
    await seedUser(t, { username: 'ada' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })

    await expect(
      admin.action(api.emailRender.sendTest, {
        ...draft,
        recipient: 'someone@example.test',
      }),
    ).rejects.toThrow('Test emails can only go to allowlisted addresses')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .action(api.emailRender.sendTest, {
          ...draft,
          recipient: 'delivered@resend.dev',
        }),
    ).rejects.toThrow('Email admin access required')

    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', '')
    await expect(
      admin.action(api.emailRender.sendTest, {
        ...draft,
        recipient: 'delivered@resend.dev',
      }),
    ).rejects.toThrow('Test sending is disabled in this environment')
  })

  it('allows five test sends per admin per hour', async () => {
    const t = setup()
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const args = { ...draft, recipient: 'delivered@resend.dev' }

    for (let index = 0; index < 5; index += 1) {
      await admin.action(api.emailRender.sendTest, args)
    }
    await expect(admin.action(api.emailRender.sendTest, args)).rejects.toThrow(
      'Too many requests',
    )
  })
})
