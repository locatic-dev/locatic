import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api, internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import { HOME_FEED_UNFOLLOW_BATCH_SIZE } from '../homeFeed'
import {
  NOW,
  daysAgo,
  fixtureClerkId,
  seedActivityEvent,
  seedHomeFeedItem,
  seedProject,
  seedUser,
} from '../../__tests__/fixtures.helpers'

const modules = import.meta.glob('../../**/*.ts')
const PAGE = { numItems: 50, cursor: null }
const UNFOLLOWED_ROWS = HOME_FEED_UNFOLLOW_BATCH_SIZE * 2 + 30
const UNRELATED_ROWS = 300

type T = TestConvex<typeof schema>

beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

const as = (t: T, username: string) =>
  t.withIdentity({ subject: fixtureClerkId(username) })

/** Copies one delivered row `count` times with distinct group keys. */
async function cloneFeedRows(
  t: T,
  templateId: Id<'home_feed_items'>,
  count: number,
  userId?: Id<'users'>,
) {
  await t.run(async (ctx) => {
    const { _id, _creationTime, ...template } = (await ctx.db.get(templateId))!
    for (let index = 0; index < count; index++) {
      const key = `${template.groupKey}:clone:${String(userId)}:${index}`
      await ctx.db.insert('home_feed_items', {
        ...template,
        userId: userId ?? template.userId,
        groupKey: key,
        dedupeKey: key,
        createdAt: template.createdAt - index,
      })
    }
  })
}

const feedRowsFrom = (t: T, userId: Id<'users'>, actorId: Id<'users'>) =>
  t.run(
    async (ctx) =>
      (
        await ctx.db
          .query('home_feed_items')
          .withIndex('by_user_actor_created', (query) =>
            query.eq('userId', userId).eq('actorId', actorId),
          )
          .collect()
      ).length,
  )

const queuedCleanups = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect())
      .filter(
        (job) =>
          job.name.endsWith('removeUnfollowedFeedItemsBatch') &&
          job.state.kind === 'pending',
      )
      .map((job) => job.args[0]),
  )

async function setup() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const viewer = await seedUser(t, { username: 'viewer' })
  const builder = await seedUser(t, { username: 'builder' })
  const other = await seedUser(t, { username: 'other' })
  const bystander = await seedUser(t, { username: 'bystander' })
  const builderEvent = await seedActivityEvent(
    t,
    builder,
    await seedProject(t, { ownerId: builder, name: 'forge' }),
    daysAgo(1),
    'project_posted',
  )
  const otherEvent = await seedActivityEvent(
    t,
    other,
    await seedProject(t, { ownerId: other, name: 'kiln' }),
    daysAgo(1),
    'project_posted',
  )
  for (const [username, target] of [
    ['viewer', builder],
    ['viewer', other],
    ['bystander', builder],
  ] as const)
    await as(t, username).mutation(api.follows.follow, {
      targetUserId: target,
    })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  // Backfill delivered one row per follow; widen both feeds.
  const builderRow = await seedHomeFeedItem(t, viewer, builderEvent)
  await cloneFeedRows(t, builderRow, UNFOLLOWED_ROWS - 1)
  await cloneFeedRows(t, builderRow, 40, bystander)
  await cloneFeedRows(
    t,
    await seedHomeFeedItem(t, viewer, otherEvent),
    UNRELATED_ROWS - 1,
  )
  return { t, viewer, builder, other, bystander, builderEvent }
}

it('unfollows without reading the feed, hides rows at once and removes them in bounded batches', async () => {
  const { t, viewer, builder, other, bystander } = await setup()
  expect(await feedRowsFrom(t, viewer, builder)).toBe(UNFOLLOWED_ROWS)

  await as(t, 'viewer').mutation(api.follows.unfollow, {
    targetUserId: builder,
  })

  // The unfollow transaction deleted nothing; the read already hides them.
  expect(await feedRowsFrom(t, viewer, builder)).toBe(UNFOLLOWED_ROWS)
  const page = await as(t, 'viewer').query(api.home.list, {
    paginationOpts: PAGE,
  })
  expect(page.page.length).toBeGreaterThan(0)
  expect(page.page.every((item) => item.actorId === other)).toBe(true)
  const [viewerDoc, builderDoc] = await t.run((ctx) =>
    Promise.all([ctx.db.get(viewer), ctx.db.get(builder)]),
  )
  expect(viewerDoc!.stats.followingCount).toBe(1)
  expect(builderDoc!.stats.followersCount).toBe(1)
  const args = { followerId: viewer, actorId: builder }
  expect(await queuedCleanups(t)).toEqual([args])

  await t.mutation(internal.home.removeUnfollowedFeedItemsBatch, args)
  expect(await feedRowsFrom(t, viewer, builder)).toBe(
    UNFOLLOWED_ROWS - HOME_FEED_UNFOLLOW_BATCH_SIZE,
  )
  expect(await queuedCleanups(t)).toContainEqual(args)

  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await feedRowsFrom(t, viewer, builder)).toBe(0)
  expect(await feedRowsFrom(t, viewer, other)).toBe(UNRELATED_ROWS)
  expect(await feedRowsFrom(t, bystander, builder)).toBe(41)
  expect(await queuedCleanups(t)).toEqual([])
})

it('keeps the rows of a new follow when the cleanup runs after a refollow', async () => {
  const { t, viewer, builder, builderEvent } = await setup()
  const args = { followerId: viewer, actorId: builder }
  const client = as(t, 'viewer')

  await client.mutation(api.follows.unfollow, { targetUserId: builder })
  await t.mutation(internal.home.removeUnfollowedFeedItemsBatch, args)
  const remaining = UNFOLLOWED_ROWS - HOME_FEED_UNFOLLOW_BATCH_SIZE
  expect(await feedRowsFrom(t, viewer, builder)).toBe(remaining)

  await client.mutation(api.follows.follow, { targetUserId: builder })
  // Every queued batch, old and new, now sees the follow and deletes nothing.
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await feedRowsFrom(t, viewer, builder)).toBe(remaining)
  const page = await client.query(api.home.list, { paginationOpts: PAGE })
  expect(page.page.some((item) => item.sourceEventId === builderEvent)).toBe(
    true,
  )
  expect((await t.run((ctx) => ctx.db.get(viewer)))!.stats.followingCount).toBe(
    2,
  )

  // Unfollowing again removes everything, including the refollow's rows.
  await client.mutation(api.follows.unfollow, { targetUserId: builder })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await feedRowsFrom(t, viewer, builder)).toBe(0)
})
