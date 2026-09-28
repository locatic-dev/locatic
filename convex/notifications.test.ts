import { convexTest, type TestConvex } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  fixtureClerkId,
  seedConversation,
  seedNotification,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')

const FIRST_PAGE = { cursor: null, numItems: 20 }

function as(t: TestConvex<typeof schema>, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function allNotifications(t: TestConvex<typeof schema>) {
  return await t.run((ctx) => ctx.db.query('notifications').collect())
}

describe('notifications (C9)', () => {
  let t: TestConvex<typeof schema>
  let viewerId: Id<'users'>
  let actorId: Id<'users'>
  let projectId: Id<'projects'>

  beforeEach(async () => {
    t = convexTest(schema, modules)
    viewerId = await seedUser(t, { username: 'viewer' })
    actorId = await seedUser(t, { username: 'actor' })
    projectId = await seedProject(t, { ownerId: viewerId, name: 'locatic' })
  })

  /** A legacy row written before `target` existed (post reactions still are). */
  async function seedLegacyNotification() {
    const id = await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'post_reacted',
      projectId,
    })
    await t.run(async (ctx) => {
      const {
        _id,
        _creationTime,
        target: _target,
        ...rest
      } = (await ctx.db.get(id))!
      await ctx.db.replace(_id, rest)
    })
    return id
  }

  it('viewing the list writes nothing, even for rows without a stored target', async () => {
    await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'followed',
    })
    await seedLegacyNotification()
    const before = await allNotifications(t)

    const { page } = await as(t, 'viewer').query(api.notifications.list, {
      paginationOpts: FIRST_PAGE,
    })
    await as(t, 'viewer').query(api.notifications.unreadCount, {})

    // The legacy row still gets a destination, resolved at read time.
    const legacy = page.find((row) => row.type === 'post_reacted')
    expect(legacy?.target?.kind).toBe('project')
    expect(await allNotifications(t)).toEqual(before)
  })

  it('returns the same unread count the badge shows, before and after a mark-read', async () => {
    const followed = await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'followed',
    })
    await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'project_liked',
      projectId,
    })
    await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'project_liked',
      projectId,
      isRead: true,
    })
    const viewer = as(t, 'viewer')

    expect(await viewer.query(api.notifications.unreadCount, {})).toBe(2)

    await viewer.mutation(api.notifications.markRead, {
      notificationId: followed,
    })
    expect(await viewer.query(api.notifications.unreadCount, {})).toBe(1)

    await viewer.mutation(api.notifications.markAllRead, {})
    expect(await viewer.query(api.notifications.unreadCount, {})).toBe(0)
  })

  it('leaves direct messages to the inbox badge, including unread rows written before they were created read', async () => {
    const { conversationId } = await seedConversation(t, actorId, viewerId, {
      isRequest: false,
      lastMessageSenderId: actorId,
    })
    await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'dm_received',
      conversationId,
    })
    // A legacy row: before S5, `dm_received` was created unread.
    await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'dm_received',
      conversationId,
      isRead: false,
    })

    expect(await as(t, 'viewer').query(api.notifications.unreadCount, {})).toBe(
      0,
    )
  })

  it('caps the unread count so the badge read stays bounded', async () => {
    await t.run(async (ctx) => {
      const actor = (await ctx.db.get(actorId))!
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert('notifications', {
          recipientId: viewerId,
          actorId,
          type: 'followed',
          projectId: null,
          postId: null,
          commentId: null,
          actorSnapshot: {
            displayName: actor.profile.displayName,
            avatarUrl: actor.profile.avatarUrl,
          },
          projectName: null,
          isRead: false,
          createdAt: index,
        })
      }
    })

    expect(await as(t, 'viewer').query(api.notifications.unreadCount, {})).toBe(
      100,
    )
  })

  it('ignores a mark-read for someone else’s notification', async () => {
    const notificationId = await seedNotification(t, {
      recipientId: viewerId,
      actorId,
      type: 'followed',
    })

    await as(t, 'actor').mutation(api.notifications.markRead, {
      notificationId,
    })

    const stored = await t.run((ctx) => ctx.db.get(notificationId))
    expect(stored?.isRead).toBe(false)
  })

  it('stores missing targets only through the internal one-off migration', async () => {
    const legacyId = await seedLegacyNotification()

    const result = await t.mutation(internal.notifications.backfillTargets, {})

    expect(result).toEqual({ patchedCount: 1, isDone: true })
    const stored = await t.run((ctx) => ctx.db.get(legacyId))
    expect(stored?.target).toMatchObject({
      kind: 'project',
      projectRepo: 'locatic',
    })
  })
})
