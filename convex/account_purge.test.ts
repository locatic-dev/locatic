import { convexTest } from 'convex-test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import {
  NOW,
  fixtureClerkId,
  seedUser,
  seedProject,
  seedPost,
  seedFollow,
  seedActivityEvent,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

it('does not let a new comment copy an expired collaborator post after activity was swept', async () => {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const author = await seedUser(t, { username: 'author' })
  const owner = await seedUser(t, { username: 'owner' })
  const projectId = await seedProject(t, { ownerId: owner, name: 'engine' })
  const postId = await seedPost(t, projectId, author, NOW, {
    body: 'Erase this authored text',
  })
  await t.run((ctx) =>
    ctx.db.patch(author, {
      deletedAt: NOW - 31 * 86_400_000,
      deactivatedAt: NOW - 31 * 86_400_000,
      purgeAfter: NOW,
    }),
  )
  for (let page = 0; page < 100; page++) {
    if (
      ((await t.run((ctx) => ctx.db.get(author)))?.purgeProgress?.stage ?? 0) >=
      8
    )
      break
    await t.mutation(internal.users.scrubDeletedAccount, { userId: author })
  }
  await expect(
    t
      .withIdentity({ subject: fixtureClerkId('owner') })
      .mutation(api.comments.create, {
        targetType: 'post',
        targetId: postId,
        parentId: null,
        content: 'A late reply',
      }),
  ).rejects.toThrow('Comment target not found')
  expect(await t.run((ctx) => ctx.db.query('activity_events').take(1))).toEqual(
    [],
  )
})

it.each(['due', 'purged'] as const)(
  'does not fan out a stale snapshot when its post author is %s',
  async (status) => {
    const t = convexTest(schema, modules)
    const author = await seedUser(t, { username: 'author' })
    const owner = await seedUser(t, { username: 'owner' })
    const follower = await seedUser(t, { username: 'follower' })
    const projectId = await seedProject(t, { ownerId: owner, name: 'engine' })
    const postId = await seedPost(t, projectId, author, NOW, {
      body: 'Erase this authored text',
    })
    const eventId = await seedActivityEvent(
      t,
      owner,
      projectId,
      NOW,
      'post_created',
      { postId },
    )
    await seedFollow(t, follower, owner)
    await t.run((ctx) =>
      ctx.db.patch(author, {
        deletedAt: NOW - 31 * 86_400_000,
        purgeAfter: status === 'due' ? NOW : null,
        ...(status === 'purged' ? { purgedAt: NOW } : {}),
      }),
    )
    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })
    expect(
      await t.run((ctx) => ctx.db.query('home_feed_items').take(1)),
    ).toEqual([])
  },
)

const accountStages = [
  { table: 'reports', stage: 10 },
  { table: 'github_tokens', stage: 12 },
  { table: 'github_sync_log', stage: 13 },
  { table: 'email_sends', stage: 16 },
  { table: 'email_preference_changes', stage: 17 },
] as const

it.each(accountStages)(
  'purges $table through account indexes without reading unrelated rows',
  async ({ table, stage }) => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const erased = await seedUser(t, { username: 'erased' })
    const other = await seedUser(t, { username: 'other' })
    const projectId = await seedProject(t, { ownerId: other, name: 'engine' })
    const comment = await t
      .withIdentity({ subject: fixtureClerkId('other') })
      .mutation(api.comments.create, {
        targetType: 'project',
        targetId: projectId,
        parentId: null,
        content: 'Independent discussion',
      })
    const campaignId = await t.run((ctx) =>
      ctx.db.insert('email_campaigns', {
        title: 'Fixture',
        subject: 'Fixture',
        preheader: '',
        revision: 1,
        templateVersion: 2,
        state: 'sent',
        content: { kind: 'announcement', body: 'Hello', cta: null },
        preparationDiagnostics: [],
        createdBy: other,
        updatedBy: other,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    )
    const insert = (userId: typeof erased, index: number) =>
      t.run(async (ctx) => {
        switch (table) {
          case 'reports':
            return await ctx.db.insert(table, {
              reporterId: userId,
              targetType: 'comment',
              targetId: comment!._id,
              reason: 'spam',
              details: null,
              status: 'open',
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'github_tokens':
            return await ctx.db.insert(table, {
              userId,
              tokenStatus: 'active',
              scopes: [],
              lastUsedAt: null,
              lastValidatedAt: null,
              lastError: null,
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'github_sync_log':
            return await ctx.db.insert(table, {
              userId,
              syncType: 'manual',
              reposFetched: 1,
              reposNew: 0,
              reposUpdated: 1,
              status: 'success',
              error: null,
              githubRateLimitRemaining: null,
              syncedAt: NOW + index,
            })
          case 'email_sends':
            return await ctx.db.insert(table, {
              userId,
              campaignId,
              category: 'product_updates',
              emailId: `fixture-${userId}-${index}`,
              status: 'delivered',
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'email_preference_changes':
            return await ctx.db.insert(table, {
              userId,
              category: 'product_updates',
              subscribed: false,
              source: 'settings',
              changedAt: NOW + index,
            })
        }
      })
    const unrelated: Awaited<ReturnType<typeof insert>>[] = []
    for (let index = 0; index < 56; index++) {
      const userId =
        table === 'github_tokens'
          ? await seedUser(t, { username: `unrelated-${index}` })
          : other
      unrelated.push(await insert(userId, index))
    }
    const enterStage = async () => {
      await t.run((ctx) =>
        ctx.db.patch(erased, {
          deletedAt: NOW - 31 * 86_400_000,
          purgeAfter: NOW,
          purgeProgress: { stage, cursor: null },
        }),
      )
    }
    const finishStage = async () => {
      let pages = 0
      while (
        (await t.run((ctx) => ctx.db.get(erased)))?.purgeProgress?.stage ===
        stage
      ) {
        await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
        if (++pages > 20) throw new Error('Purge stage did not finish')
      }
      return pages
    }
    await enterStage()
    expect(await finishStage()).toBe(1)

    const owned: Awaited<ReturnType<typeof insert>>[] = []
    const ownedCount = table === 'github_tokens' ? 1 : 56
    for (let index = 0; index < ownedCount; index++)
      owned.push(await insert(erased, index))
    await enterStage()
    expect(await finishStage()).toBe(Math.ceil(ownedCount / 25))
    expect(
      await t.run((ctx) => Promise.all(owned.map((id) => ctx.db.get(id)))),
    ).toEqual(owned.map(() => null))
    expect(
      (
        await t.run((ctx) => Promise.all(unrelated.map((id) => ctx.db.get(id))))
      ).every(Boolean),
    ).toBe(true)
  },
)

it('finishes an existing table-scan cursor without changing its query shape', async () => {
  const t = convexTest(schema, modules)
  const erased = await seedUser(t, { username: 'erased' })
  const other = await seedUser(t, { username: 'other' })
  await t.run(async (ctx) => {
    for (let index = 0; index < 31; index++)
      await ctx.db.insert('email_preference_changes', {
        userId: other,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
        changedAt: NOW + index,
      })
    // Old releases used a global table cursor. Keep its query shape for the
    // rest of this stage instead of handing the cursor to a different index.
    const first = await ctx.db
      .query('email_preference_changes')
      .paginate({ cursor: null, numItems: 25 })
    await ctx.db.patch(erased, {
      deletedAt: NOW - 31 * 86_400_000,
      purgeAfter: NOW,
      purgeProgress: { stage: 17, cursor: first.continueCursor },
    })
    await ctx.db.insert('email_preference_changes', {
      userId: erased,
      category: 'product_updates',
      subscribed: false,
      source: 'settings',
      changedAt: NOW,
    })
  })
  await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
  expect((await t.run((ctx) => ctx.db.get(erased)))?.purgeProgress?.stage).toBe(
    18,
  )
  const rows = await t.run((ctx) =>
    ctx.db.query('email_preference_changes').collect(),
  )
  expect(rows).toHaveLength(31)
  expect(rows.every((row) => row.userId === other)).toBe(true)
})
