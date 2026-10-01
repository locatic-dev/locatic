import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  fixtureClerkId,
  seedCities,
  seedConversation,
  seedUser,
  type SeededCities,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')

type CityVisibility = 'exact_city' | 'region_only' | 'hidden'

function as(t: TestConvex<typeof schema>, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

/**
 * Every surface that shows a DM partner's city: the inbox list, the open
 * conversation and the new-message recipient preview.
 */
async function partnerCityNames(
  t: TestConvex<typeof schema>,
  partnerId: Id<'users'>,
  conversationId: Id<'conversations'>,
) {
  const viewer = as(t, 'viewer')
  const [list, detail, preview] = await Promise.all([
    viewer.query(api.conversations.list, {}),
    viewer.query(api.conversations.get, { conversationId }),
    viewer.query(api.conversations.getRecipientPreview, {
      otherUserId: partnerId,
    }),
  ])
  const listed = list.find((entry) => entry._id === conversationId)

  return {
    list: listed?.otherUser?.cityName,
    detail: detail.conversation.otherUser?.cityName,
    preview: preview?.cityName,
  }
}

describe('conversation partner location (D8)', () => {
  let t: TestConvex<typeof schema>
  let cities: SeededCities
  let viewerId: Id<'users'>

  beforeEach(async () => {
    t = convexTest(schema, modules)
    cities = await seedCities(t)
    viewerId = await seedUser(t, {
      username: 'viewer',
      cityId: cities.hyderabad,
    })
  })

  async function seedPartner(
    cityVisibility: CityVisibility,
    cityId: Id<'cities'> = cities.bengaluru,
  ) {
    const partnerId = await seedUser(t, {
      username: `partner-${cityVisibility.replace('_', '-')}`,
      cityId,
      cityVisibility,
    })
    const { conversationId } = await seedConversation(t, viewerId, partnerId, {
      isRequest: false,
      lastMessageSenderId: partnerId,
    })
    return { partnerId, conversationId }
  }

  it('shows the exact city of an exact-city partner', async () => {
    const { partnerId, conversationId } = await seedPartner('exact_city')

    expect(await partnerCityNames(t, partnerId, conversationId)).toEqual({
      list: 'Bengaluru, Karnataka, India',
      detail: 'Bengaluru, Karnataka, India',
      preview: 'Bengaluru, Karnataka, India',
    })
  })

  it('shows only the region label of a region-only partner', async () => {
    const { partnerId, conversationId } = await seedPartner('region_only')

    expect(await partnerCityNames(t, partnerId, conversationId)).toEqual({
      list: 'Karnataka, India',
      detail: 'Karnataka, India',
      preview: 'Karnataka, India',
    })
  })

  it('shows only the country of a region-only partner in a city-state', async () => {
    const { partnerId, conversationId } = await seedPartner(
      'region_only',
      cities.berlin,
    )

    expect(await partnerCityNames(t, partnerId, conversationId)).toEqual({
      list: 'Germany',
      detail: 'Germany',
      preview: 'Germany',
    })
  })

  it('shows no city for a hidden partner', async () => {
    const { partnerId, conversationId } = await seedPartner('hidden')

    expect(await partnerCityNames(t, partnerId, conversationId)).toEqual({
      list: null,
      detail: null,
      preview: null,
    })
  })

  it('follows a privacy change on the next read', async () => {
    const { partnerId, conversationId } = await seedPartner('exact_city')

    await t.run((ctx) =>
      ctx.db.get(partnerId).then((partner) =>
        ctx.db.patch(partnerId, {
          privacy: { ...partner!.privacy, cityVisibility: 'hidden' },
        }),
      ),
    )

    expect(await partnerCityNames(t, partnerId, conversationId)).toEqual({
      list: null,
      detail: null,
      preview: null,
    })
  })
})

describe('inbox requests and pending state (C9)', () => {
  let t: TestConvex<typeof schema>
  let senderId: Id<'users'>
  let recipientId: Id<'users'>

  beforeEach(async () => {
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    senderId = await seedUser(t, { username: 'sender' })
    recipientId = await seedUser(t, { username: 'recipient' })
    // DM notifications are off by default; turn them on for the recipient so
    // the inbox/notification reconciliation is exercised.
    await t.run(async (ctx) => {
      const recipient = await ctx.db.get(recipientId)
      await ctx.db.patch(recipientId, {
        notificationPrefs: { ...recipient!.notificationPrefs, dms: true },
      })
    })
  })

  async function statusesFor(username: string) {
    const list = await as(t, username).query(api.conversations.list, {})
    return list.map((conversation) => conversation.status)
  }

  it('lists an outgoing request as pending for the sender and as an incoming request for the recipient', async () => {
    const { conversationId } = await seedConversation(
      t,
      senderId,
      recipientId,
      {
        isRequest: true,
        lastMessageSenderId: senderId,
      },
    )

    expect(await statusesFor('sender')).toEqual(['pending'])
    expect(await statusesFor('recipient')).toEqual(['request'])

    const opened = await as(t, 'sender').query(api.conversations.get, {
      conversationId,
    })
    expect(opened.conversation.status).toBe('pending')
  })

  it('makes the conversation active for both once the recipient replies', async () => {
    const { conversationId } = await as(t, 'sender').mutation(
      api.conversations.sendFirstMessage,
      { otherUserId: recipientId, content: 'hi, love the project' },
    )
    expect(await statusesFor('sender')).toEqual(['pending'])

    await as(t, 'recipient').mutation(api.conversations.sendMessage, {
      conversationId,
      content: 'thanks!',
    })

    expect(await statusesFor('sender')).toEqual(['active'])
    expect(await statusesFor('recipient')).toEqual(['active'])
  })

  it('keeps a pending request pending while only the sender writes', async () => {
    const { conversationId } = await as(t, 'sender').mutation(
      api.conversations.sendFirstMessage,
      { otherUserId: recipientId, content: 'hi' },
    )
    await as(t, 'sender').mutation(api.conversations.sendMessage, {
      conversationId,
      content: 'following up',
    })

    expect(await statusesFor('sender')).toEqual(['pending'])
    expect(await statusesFor('recipient')).toEqual(['request'])
  })

  it('counts one message once: in the inbox badge, not the notifications badge', async () => {
    const { conversationId } = await as(t, 'sender').mutation(
      api.conversations.sendFirstMessage,
      { otherUserId: recipientId, content: 'hi' },
    )
    const recipient = as(t, 'recipient')

    const bootstrap = await recipient.query(api.users.viewerBootstrap, {})
    expect(bootstrap.viewer?.unreadMessagesCount).toBe(1)
    expect(await recipient.query(api.notifications.unreadCount, {})).toBe(0)
    const { page } = await recipient.query(api.notifications.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    // The notification is listed but created read (S5): the inbox badge is
    // the one task, and nothing has to scan notifications to clear it.
    expect(page.map((row) => [row.type, row.isRead])).toEqual([
      ['dm_received', true],
    ])

    const before = await t.run((ctx) => ctx.db.get(conversationId))
    await recipient.mutation(api.conversations.markRead, { conversationId })

    const after = await recipient.query(api.users.viewerBootstrap, {})
    expect(after.viewer?.unreadMessagesCount).toBe(0)
    expect(await recipient.query(api.notifications.unreadCount, {})).toBe(0)
    // Reading must not reorder the inbox, which sorts by `updatedAt`.
    const stored = await t.run((ctx) => ctx.db.get(conversationId))
    expect(stored?.updatedAt).toBe(before?.updatedAt)
  })
})
