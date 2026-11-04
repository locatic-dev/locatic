import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import { MARK_ALL_READ_BATCH_SIZE } from './notifications'
import { NOW, fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
const BACKLOG = MARK_ALL_READ_BATCH_SIZE * 2 + 50
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

async function seedUnread(
  t: TestConvex<typeof schema>,
  recipientId: Id<'users'>,
  actorId: Id<'users'>,
  count: number,
  createdAt: (index: number) => number,
) {
  return await t.run(async (ctx) => {
    const ids: Id<'notifications'>[] = []
    for (let index = 0; index < count; index++)
      ids.push(
        await ctx.db.insert('notifications', {
          recipientId,
          actorId,
          type: 'followed',
          projectId: null,
          postId: null,
          commentId: null,
          actorSnapshot: { displayName: 'actor', avatarUrl: '' },
          projectName: null,
          isRead: false,
          createdAt: createdAt(index),
        }),
      )
    return ids
  })
}

const readCount = (t: TestConvex<typeof schema>, ids: Id<'notifications'>[]) =>
  t.run(async (ctx) => {
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)))
    return rows.filter((row) => row!.isRead).length
  })

const queuedBatches = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect())
      .filter(
        (job) =>
          job.name.endsWith('markAllReadBatch') && job.state.kind === 'pending',
      )
      .map((job) => job.args[0]),
  )

it('marks a large backlog read in bounded batches and leaves later arrivals unread', async () => {
  const t = convexTest(schema, modules)
  const viewer = await seedUser(t, { username: 'viewer' })
  const actor = await seedUser(t, { username: 'actor' })
  const other = await seedUser(t, { username: 'other' })
  const backlog = await seedUnread(
    t,
    viewer,
    actor,
    BACKLOG,
    (index) => NOW - BACKLOG + index,
  )
  const unrelated = await seedUnread(t, other, actor, 5, () => NOW - 1)
  const client = t.withIdentity({ subject: fixtureClerkId('viewer') })

  const first = await client.mutation(api.notifications.markAllRead, {})
  expect(first).toEqual({ cutoff: NOW, isDone: false })
  expect(await readCount(t, backlog)).toBe(MARK_ALL_READ_BATCH_SIZE)
  expect(await queuedBatches(t)).toEqual([{ recipientId: viewer, cutoff: NOW }])

  // A notification created after the request, mid-operation, stays unread.
  vi.setSystemTime(NOW + 1)
  const late = await seedUnread(t, viewer, actor, 1, () => NOW + 1)

  const args = { recipientId: viewer, cutoff: NOW }
  const second = await t.mutation(internal.notifications.markAllReadBatch, args)
  expect(second.isDone).toBe(false)
  expect(await readCount(t, backlog)).toBe(MARK_ALL_READ_BATCH_SIZE * 2)

  const third = await t.mutation(internal.notifications.markAllReadBatch, args)
  expect(third.isDone).toBe(true)
  expect(await readCount(t, backlog)).toBe(BACKLOG)

  // A retried batch finds nothing left to write and schedules nothing more.
  const before = await queuedBatches(t)
  expect(
    await t.mutation(internal.notifications.markAllReadBatch, args),
  ).toEqual({ cutoff: NOW, isDone: true })
  expect(await queuedBatches(t)).toEqual(before)

  expect(await readCount(t, late)).toBe(0)
  expect(await readCount(t, unrelated)).toBe(0)
  expect(await client.query(api.notifications.unreadCount, {})).toBe(1)
})

it('converges through its own scheduled continuations', async () => {
  const t = convexTest(schema, modules)
  const viewer = await seedUser(t, { username: 'viewer' })
  const actor = await seedUser(t, { username: 'actor' })
  const backlog = await seedUnread(t, viewer, actor, BACKLOG, () => NOW - 1)
  const client = t.withIdentity({ subject: fixtureClerkId('viewer') })

  await client.mutation(api.notifications.markAllRead, {})
  expect(await client.query(api.notifications.unreadCount, {})).toBe(100)
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await readCount(t, backlog)).toBe(BACKLOG)
  expect(await client.query(api.notifications.unreadCount, {})).toBe(0)
})
