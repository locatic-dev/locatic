import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fixtureClerkId,
  NOW,
  seedUser,
  purgeFixtureAccount,
} from './__tests__/fixtures.helpers'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { listClerkPrimaryEmails } from './lib/clerk_users'
import { createDefaultViewerProfile } from './lib/viewer'
import schema from './schema'

vi.mock('./lib/clerk_users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/clerk_users')>()),
  listClerkPrimaryEmails: vi.fn(),
}))

const modules = import.meta.glob('./**/*.ts')
const listClerk = vi.mocked(listClerkPrimaryEmails)

type T = TestConvex<typeof schema>

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  listClerk.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

async function drain(t: T) {
  await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers())
}

async function insertLegacyUsers(t: T, count: number) {
  return await t.run(async (ctx) => {
    const ids: Id<'users'>[] = []
    for (let index = 0; index < count; index += 1) {
      const profile = createDefaultViewerProfile({
        clerkId: `clerk_legacy_${index}`,
        email: `legacy${index}@example.test`,
        githubId: null,
        githubUsername: `legacy${index}`,
        githubUrl: `https://github.com/legacy${index}`,
        avatarUrl: '',
        displayName: `legacy ${index}`,
      })
      const { productUpdates: _unused, ...prefs } = profile.notificationPrefs
      const { emailVerified: _alsoUnused, ...rest } = profile
      ids.push(
        await ctx.db.insert('users', { ...rest, notificationPrefs: prefs }),
      )
    }
    return ids
  })
}

describe('backfillProductUpdates', () => {
  it('turns updates on for members without the key, logs it, and is idempotent', async () => {
    const t = convexTest(schema, modules)
    const [first, second, third] = await insertLegacyUsers(t, 3)
    await t.run(async (ctx) => {
      const user = await ctx.db.get(third!)
      await ctx.db.patch(third!, {
        notificationPrefs: {
          ...user!.notificationPrefs,
          productUpdates: false,
        },
      })
    })

    await t.mutation(internal.emailMigrations.backfillProductUpdates, {
      cursor: null,
    })
    await drain(t)
    await t.mutation(internal.emailMigrations.backfillProductUpdates, {
      cursor: null,
    })
    await drain(t)

    const users = await t.run(async (ctx) =>
      Promise.all([first, second, third].map((id) => ctx.db.get(id!))),
    )
    expect(users.map((user) => user?.notificationPrefs.productUpdates)).toEqual(
      [true, true, false],
    )
    const changes = await t.run((ctx) =>
      ctx.db.query('email_preference_changes').collect(),
    )
    expect(changes).toHaveLength(2)
    expect(changes.every((change) => change.source === 'backfill')).toBe(true)
    expect(changes.every((change) => change.subscribed)).toBe(true)
  })

  it('does not recreate consent during irreversible deletion but preserves recoverable defaults', async () => {
    const t = convexTest(schema, modules)
    const [expired, recoverable] = await insertLegacyUsers(t, 2)
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.patch(expired!, {
        deletedAt: now - 1,
        purgeAfter: now - 1,
        purgeProgress: { stage: 18, cursor: null },
      })
      await ctx.db.patch(recoverable!, {
        deletedAt: now - 1,
        purgeAfter: now + 86_400_000,
      })
    })
    await t.mutation(internal.emailMigrations.backfillProductUpdates, {
      cursor: null,
    })
    const changes = await t.run((ctx) =>
      ctx.db.query('email_preference_changes').collect(),
    )
    expect(changes.map((row) => row.userId)).toEqual([recoverable])
    expect(
      (await t.run((ctx) => ctx.db.get(expired!)))?.notificationPrefs
        .productUpdates,
    ).toBe(false)
  })

  it('gives purged accounts the field turned off, with no consent record', async () => {
    const t = convexTest(schema, modules)
    const [purged] = await insertLegacyUsers(t, 1)
    await purgeFixtureAccount(t, purged!)

    await t.mutation(internal.emailMigrations.backfillProductUpdates, {
      cursor: null,
    })
    await drain(t)

    const user = await t.run((ctx) => ctx.db.get(purged!))
    // Set so the field can become required; off, and not logged as consent.
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
  })

  it('pages through more than one batch', async () => {
    const t = convexTest(schema, modules)
    await insertLegacyUsers(t, 205)

    await t.mutation(internal.emailMigrations.backfillProductUpdates, {
      cursor: null,
    })
    await drain(t)

    const changes = await t.run((ctx) =>
      ctx.db.query('email_preference_changes').collect(),
    )
    expect(changes).toHaveLength(205)
  })
})

describe('clearLegacyEmailSubscription', () => {
  it('removes the PR #32 field from every member, across pages', async () => {
    const t = convexTest(schema, modules)
    const ids = await insertLegacyUsers(t, 105)
    await t.run(async (ctx) => {
      for (const id of ids.slice(0, 103)) {
        await ctx.db.patch(id, {
          emailSubscription: {
            primaryEmailVerified: true,
            primaryEmailVerifiedAt: NOW,
            preferenceVersion: 1,
            preferenceUpdatedAt: null,
            preferenceSource: 'legacy',
          },
        })
      }
    })

    await t.mutation(internal.emailMigrations.clearLegacyEmailSubscription, {
      cursor: null,
    })
    await drain(t)

    const users = await t.run((ctx) => ctx.db.query('users').collect())
    expect(users.filter((user) => 'emailSubscription' in user)).toEqual([])
    expect(users).toHaveLength(105)
  })
})

describe('applyEmailVerified', () => {
  async function snapshot(t: T, userId: Id<'users'>) {
    const user = await t.run((ctx) => ctx.db.get(userId))
    return {
      email: user!.email,
      emailVerified: user!.emailVerified ?? null,
      updatedAt: user!.updatedAt,
    }
  }

  it('writes Clerk’s verification, and false whenever it cannot vouch for the stored address', async () => {
    const t = convexTest(schema, modules)
    const [ada, bob, cyd, dan] = await insertLegacyUsers(t, 4)

    const result = await t.mutation(
      internal.emailMigrations.applyEmailVerified,
      {
        updates: [
          {
            userId: ada!,
            clerk: { email: ' LEGACY0@example.test ', verified: true },
            snapshot: await snapshot(t, ada!),
          },
          {
            userId: bob!,
            clerk: { email: 'bob@elsewhere.test', verified: true },
            snapshot: await snapshot(t, bob!),
          },
          {
            userId: cyd!,
            clerk: { email: null, verified: false },
            snapshot: await snapshot(t, cyd!),
          },
          { userId: dan!, clerk: null, snapshot: await snapshot(t, dan!) },
        ],
      },
    )

    expect(result).toEqual({
      verified: 1,
      unverified: 0,
      addressMismatch: 1,
      noPrimaryAddress: 1,
      missingInClerk: 1,
      changedSinceSnapshot: [],
    })
    const docs = await t.run(async (ctx) =>
      Promise.all([ada, bob, cyd, dan].map((id) => ctx.db.get(id!))),
    )
    expect(docs.map((doc) => doc?.emailVerified)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('skips a member the webhook updated after the lookup, even at the same address', async () => {
    const t = convexTest(schema, modules)
    const ada = await seedUser(t, { username: 'ada' })
    const before = await snapshot(t, ada)

    vi.setSystemTime(NOW + 1_000)
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('ada'),
      email: 'ada@example.test',
      githubId: null,
      githubUsername: 'ada',
      githubUrl: 'https://github.com/ada',
      displayName: 'ada',
      avatarUrl: '',
      emailVerified: false,
    })
    const result = await t.mutation(
      internal.emailMigrations.applyEmailVerified,
      {
        updates: [
          {
            userId: ada,
            clerk: { email: 'ada@example.test', verified: true },
            snapshot: before,
          },
        ],
      },
    )

    expect(result).toMatchObject({ verified: 0, changedSinceSnapshot: [ada] })
    expect((await t.run((ctx) => ctx.db.get(ada)))?.emailVerified).toBe(false)
  })
})

describe('backfillEmailVerified', () => {
  it('asks Clerk for each page and leaves every member with the field set', async () => {
    const t = convexTest(schema, modules)
    const ids = await insertLegacyUsers(t, 101)
    // A purged tombstone: Clerk no longer has it either.
    await purgeFixtureAccount(t, ids[4]!)
    listClerk.mockImplementation(async (clerkIds) =>
      clerkIds
        .filter(
          (clerkId) =>
            clerkId !== 'clerk_legacy_1' && clerkId !== 'clerk_legacy_4',
        )
        .map((clerkId) => ({
          clerkId,
          email:
            clerkId === 'clerk_legacy_3'
              ? null
              : `${clerkId.replace('clerk_', '').replace('_', '')}@example.test`,
          verified: clerkId !== 'clerk_legacy_2',
        })),
    )

    await t.action(internal.emailMigrations.backfillEmailVerified, {
      cursor: null,
    })
    await drain(t)

    expect(listClerk).toHaveBeenCalledTimes(2)
    expect(listClerk.mock.calls[0]?.[0]).toHaveLength(100)
    expect(listClerk.mock.calls[1]?.[0]).toHaveLength(1)
    const users = await t.run(async (ctx) =>
      Promise.all(ids.slice(0, 4).map((id) => ctx.db.get(id))),
    )
    // Missing in Clerk, unverified, and no primary address all read false.
    expect(users.map((user) => user?.emailVerified)).toEqual([
      true,
      false,
      false,
      false,
    ])
    const all = await t.run((ctx) => ctx.db.query('users').collect())
    expect(all.filter((user) => user.emailVerified === undefined)).toEqual([])
    expect(all.find((user) => user._id === ids[4])?.emailVerified).toBe(false)
  })

  it('keeps a webhook decision made while Clerk was being asked', async () => {
    const t = convexTest(schema, modules)
    const [only] = await insertLegacyUsers(t, 1)
    listClerk.mockImplementation(async () => {
      // Clerk answers with the old state; meanwhile the webhook records that
      // the same address is no longer verified.
      vi.setSystemTime(NOW + 1_000)
      await t.mutation(internal.users.upsertFromClerkWebhook, {
        clerkId: 'clerk_legacy_0',
        email: 'legacy0@example.test',
        githubId: null,
        githubUsername: 'legacy0',
        githubUrl: 'https://github.com/legacy0',
        displayName: 'legacy 0',
        avatarUrl: '',
        emailVerified: false,
      })
      return [
        {
          clerkId: 'clerk_legacy_0',
          email: 'legacy0@example.test',
          verified: true,
        },
      ]
    })

    await t.action(internal.emailMigrations.backfillEmailVerified, {
      cursor: null,
    })
    await drain(t)

    expect((await t.run((ctx) => ctx.db.get(only!)))?.emailVerified).toBe(false)
  })

  it('waits for Clerk’s Retry-After on a 429 and tries the same page again', async () => {
    const t = convexTest(schema, modules)
    const [only] = await insertLegacyUsers(t, 1)
    listClerk
      .mockRejectedValueOnce(
        Object.assign(new Error('Too Many Requests'), {
          status: 429,
          retryAfter: 7,
        }),
      )
      .mockResolvedValueOnce([
        {
          clerkId: 'clerk_legacy_0',
          email: 'legacy0@example.test',
          verified: true,
        },
      ])

    await t.action(internal.emailMigrations.backfillEmailVerified, {
      cursor: null,
    })
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query('_scheduled_functions').collect(),
    )
    expect(scheduled).toEqual([
      expect.objectContaining({
        name: 'emailMigrations:backfillEmailVerified',
        args: [{ cursor: null }],
        scheduledTime: NOW + 7_000,
      }),
    ])

    await drain(t)
    expect((await t.run((ctx) => ctx.db.get(only!)))?.emailVerified).toBe(true)
  })
})
