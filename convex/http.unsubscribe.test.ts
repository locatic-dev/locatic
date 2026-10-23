import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { seedUser, purgeFixtureAccount } from './__tests__/fixtures.helpers'
import type { Id } from './_generated/dataModel'
import { signUnsubscribeToken } from './lib/unsubscribe_token'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  return t
}

type TestConvex = ReturnType<typeof setup>

function oneClick(token: string, body: BodyInit, contentType?: string) {
  return {
    path: `/email/unsubscribe?t=${encodeURIComponent(token)}`,
    init: {
      method: 'POST',
      body,
      ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    },
  }
}

async function snapshot(t: TestConvex, userId: Id<'users'>) {
  return await t.run(async (ctx) => ({
    productUpdates: (await ctx.db.get(userId))?.notificationPrefs
      .productUpdates,
    changes: await ctx.db.query('email_preference_changes').collect(),
  }))
}

describe('/email/unsubscribe', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 's')
    vi.stubEnv('SITE_URL', 'https://locatic.test/')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('unsubscribes on an RFC 8058 URL-encoded POST, once', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    const request = oneClick(
      token,
      'List-Unsubscribe=One-Click',
      'application/x-www-form-urlencoded',
    )

    const response = await t.fetch(request.path, request.init)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    const again = await t.fetch(request.path, request.init)
    expect(again.status).toBe(200)

    const after = await snapshot(t, userId)
    expect(after.productUpdates).toBe(false)
    expect(after.changes).toEqual([
      expect.objectContaining({ source: 'one_click', subscribed: false }),
    ])
  })

  it('accepts a multipart body', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    const form = new FormData()
    form.set('List-Unsubscribe', 'One-Click')
    const request = oneClick(token, form)

    const response = await t.fetch(request.path, request.init)
    expect(response.status).toBe(200)
    expect((await snapshot(t, userId)).productUpdates).toBe(false)
  })

  it('rejects a POST without the one-click field', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')

    for (const body of ['', 'List-Unsubscribe=Other', 'unsubscribe=1']) {
      const request = oneClick(token, body, 'application/x-www-form-urlencoded')
      expect((await t.fetch(request.path, request.init)).status).toBe(400)
    }
    const after = await snapshot(t, userId)
    expect(after.productUpdates).toBe(true)
    expect(after.changes).toEqual([])
  })

  it('rejects a tampered or missing token', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')

    for (const bad of [`${token}x`, '']) {
      const request = oneClick(
        bad,
        'List-Unsubscribe=One-Click',
        'application/x-www-form-urlencoded',
      )
      expect((await t.fetch(request.path, request.init)).status).toBe(400)
    }
    expect((await snapshot(t, userId)).changes).toEqual([])
  })

  it('succeeds without writing for a user who no longer exists', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    await t.run((ctx) => ctx.db.delete(userId))
    const request = oneClick(
      token,
      'List-Unsubscribe=One-Click',
      'application/x-www-form-urlencoded',
    )

    expect((await t.fetch(request.path, request.init)).status).toBe(200)
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
  })

  it('succeeds without writing for a purged account', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    await purgeFixtureAccount(t, userId)
    const request = oneClick(
      token,
      'List-Unsubscribe=One-Click',
      'application/x-www-form-urlencoded',
    )

    expect((await t.fetch(request.path, request.init)).status).toBe(200)
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
  })

  it('redirects a GET to the confirmation page without changing anything', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')

    const response = await t.fetch(
      `/email/unsubscribe?t=${encodeURIComponent(token)}`,
      { method: 'GET' },
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `https://locatic.test/unsubscribe?t=${encodeURIComponent(token)}`,
    )
    const after = await snapshot(t, userId)
    expect(after.productUpdates).toBe(true)
    expect(after.changes).toEqual([])
  })
})
