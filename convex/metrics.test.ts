import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { makeFunctionReference } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { ClientMetricKey } from './metrics'
import schema from './schema'
import {
  DAY_MS,
  NOW,
  fixtureClerkId,
  seedUser,
} from './__tests__/fixtures.helpers'

/**
 * Daily product counters (plan item E4): successful actions add one to a
 * per-day, per-key row; repeated no-op actions and anonymous client reports
 * add nothing.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

// `api.metrics.record` once convex/_generated is regenerated with this module.
const recordMetric = makeFunctionReference<
  'mutation',
  { key: ClientMetricKey },
  null
>('metrics:record')

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

/** Counters are scheduled with `runAfter(0)`; only `Date` is faked here. */
async function drainScheduled(t: T) {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await t.finishInProgressScheduledFunctions()
  }
}

async function counts(t: T) {
  const rows = await t.run((ctx) => ctx.db.query('metrics_daily').collect())
  return Object.fromEntries(
    rows.map((row) => [`${row.day} ${row.key}`, row.count]),
  )
}

const TODAY = new Date(NOW).toISOString().slice(0, 10)
const TOMORROW = new Date(NOW + DAY_MS).toISOString().slice(0, 10)

describe('metrics', () => {
  let t: T

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    await seedUser(t, { username: 'ada' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts a follow once, not a repeated follow of the same person', async () => {
    const graceId = await seedUser(t, { username: 'grace' })

    await as(t, 'ada').mutation(api.follows.follow, { targetUserId: graceId })
    await as(t, 'ada').mutation(api.follows.follow, { targetUserId: graceId })
    await drainScheduled(t)

    expect(await counts(t)).toEqual({ [`${TODAY} follow`]: 1 })
  })

  it('counts a DM as opened only when it starts a new conversation', async () => {
    const graceId = await seedUser(t, { username: 'grace' })

    for (const content of ['hello', 'are you around?']) {
      await as(t, 'ada').mutation(api.conversations.sendFirstMessage, {
        otherUserId: graceId,
        content,
      })
    }
    await drainScheduled(t)

    expect(await counts(t)).toEqual({ [`${TODAY} dm_open`]: 1 })
  })

  it('keeps one row per UTC day and key', async () => {
    const record = (key: ClientMetricKey) =>
      as(t, 'ada').mutation(recordMetric, { key })

    await record('empty_state_action')
    await record('empty_state_action')
    await record('discovery_sign_in_return')
    vi.setSystemTime(NOW + DAY_MS)
    await record('empty_state_action')

    expect(await counts(t)).toEqual({
      [`${TODAY} empty_state_action`]: 2,
      [`${TODAY} discovery_sign_in_return`]: 1,
      [`${TOMORROW} empty_state_action`]: 1,
    })
  })

  it('ignores client reports from signed-out callers', async () => {
    await t.mutation(recordMetric, { key: 'empty_state_action' })

    expect(await counts(t)).toEqual({})
  })

  it('rejects keys that are not client metrics', async () => {
    await expect(
      as(t, 'ada').mutation(recordMetric, {
        // Server-side actions cannot be reported from the client.
        key: 'follow' as ClientMetricKey,
      }),
    ).rejects.toThrow(/ArgumentValidationError|Validator/)
  })
})
