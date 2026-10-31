import { convexTest } from 'convex-test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import {
  makeFunctionReference,
  type FunctionReturnType,
  type PaginationResult,
} from 'convex/server'
import type { Id } from './_generated/dataModel'
import {
  fixtureClerkId,
  NOW,
  seedConversation,
  seedUser,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
type Conversation = NonNullable<
  FunctionReturnType<typeof api.conversations.getSummary>
>
const legacyList = makeFunctionReference<
  'query',
  Record<string, never>,
  Conversation[]
>('conversations:list')
const legacyGet = makeFunctionReference<
  'query',
  { conversationId: Id<'conversations'> },
  {
    conversation: Conversation
    messages: FunctionReturnType<typeof api.conversations.messagesPage>['page']
  }
>('conversations:get')
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

it('marks a long legacy history read without rewriting any historical message', async () => {
  const t = convexTest(schema, modules)
  const sender = await seedUser(t, { username: 'sender' })
  const recipient = await seedUser(t, { username: 'recipient' })
  const { conversationId, messageId } = await seedConversation(
    t,
    sender,
    recipient,
    { isRequest: false, lastMessageSenderId: sender },
  )
  const messages = await t.run(async (ctx) => {
    const ids = [messageId]
    for (let index = 0; index < 101; index++)
      ids.push(
        await ctx.db.insert('messages', {
          conversationId,
          senderId: sender,
          content: `legacy ${index}`,
          readAt: null,
          createdAt: NOW,
        }),
      )
    const conversation = await ctx.db.get(conversationId)
    await ctx.db.patch(conversationId, {
      unreadCounts: { ...conversation!.unreadCounts, [recipient]: ids.length },
    })
    await ctx.db.patch(recipient, { unreadMessagesCount: ids.length })
    return ids
  })
  const client = t.withIdentity({ subject: fixtureClerkId('recipient') })
  await client.mutation(api.conversations.markRead, { conversationId })
  const stored = await t.run(async (ctx) =>
    Promise.all(messages.map((id) => ctx.db.get(id))),
  )
  expect(stored.every((message) => message!.readAt === null)).toBe(true)
  const page = await client.query(api.conversations.messagesPage, {
    conversationId,
    paginationOpts: { cursor: null, numItems: 30 },
  })
  expect(page.page.every((message) => message.readAt === NOW)).toBe(true)
  expect(
    (await t.run((ctx) => ctx.db.get(recipient)))!.unreadMessagesCount,
  ).toBe(0)
  const oversized = await client.query(api.conversations.messagesPage, {
    conversationId,
    paginationOpts: { cursor: null, numItems: 5000 },
  })
  expect(oversized.page.length).toBeLessThanOrEqual(100)
  await expect(client.query(legacyGet, { conversationId })).rejects.toThrow(
    /refresh.*inbox/i,
  )
})

it('keeps a same-millisecond late message unread and clears only the reader counter', async () => {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const sender = await seedUser(t, { username: 'sender' })
  const recipient = await seedUser(t, { username: 'recipient' })
  const a = t.withIdentity({ subject: fixtureClerkId('sender') })
  const b = t.withIdentity({ subject: fixtureClerkId('recipient') })
  const { conversationId } = await a.mutation(
    api.conversations.sendFirstMessage,
    { otherUserId: recipient, content: 'first' },
  )
  await b.mutation(api.conversations.sendMessage, {
    conversationId,
    content: 'reply',
  })
  await b.mutation(api.conversations.markRead, { conversationId })
  await b.mutation(api.conversations.markRead, { conversationId })
  await a.mutation(api.conversations.sendMessage, {
    conversationId,
    content: 'late',
  })
  const page = await b.query(api.conversations.messagesPage, {
    conversationId,
    paginationOpts: { cursor: null, numItems: 30 },
  })
  expect(page.page.find((message) => message.content === 'first')!.readAt).toBe(
    NOW,
  )
  expect(
    page.page.find((message) => message.content === 'late')!.readAt,
  ).toBeNull()
  expect(
    (await t.run((ctx) => ctx.db.get(recipient)))!.unreadMessagesCount,
  ).toBe(1)
  expect((await t.run((ctx) => ctx.db.get(sender)))!.unreadMessagesCount).toBe(
    1,
  )
})

it('pages both participant indexes completely without exposing an unrelated conversation', async () => {
  const t = convexTest(schema, modules)
  const partners: Id<'users'>[] = []
  for (let index = 0; index < 61; index++)
    partners.push(await seedUser(t, { username: `before-${index}` }))
  const viewer = await seedUser(t, { username: 'viewer' })
  for (let index = 0; index < 64; index++)
    partners.push(await seedUser(t, { username: `after-${index}` }))
  const ids: Id<'conversations'>[] = []
  for (const partner of partners) {
    ids.push(
      (
        await seedConversation(t, viewer, partner, {
          isRequest: false,
          lastMessageSenderId: partner,
          sentAt: NOW,
        })
      ).conversationId,
    )
  }
  const outsider = await seedUser(t, { username: 'outsider' })
  await seedConversation(t, outsider, partners[0], {
    isRequest: false,
    lastMessageSenderId: outsider,
  })
  const client = t.withIdentity({ subject: fixtureClerkId('viewer') })
  const seen = []
  for (const side of ['low', 'high'] as const) {
    let cursor: string | null = null
    let sideCount = 0
    for (let index = 0; index < 20; index++) {
      const page: PaginationResult<{ _id: Id<'conversations'> }> =
        await client.query(api.conversations.listPage, {
          side,
          paginationOpts: { cursor, numItems: 17 },
        })
      expect(page.page.length).toBeLessThanOrEqual(17)
      seen.push(...page.page.map((entry) => entry._id))
      sideCount += page.page.length
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(sideCount).toBeGreaterThan(50)
  }
  expect(new Set(seen)).toEqual(new Set(ids))
  expect(seen.length).toBe(ids.length)
  await expect(client.query(legacyList, {})).rejects.toThrow(/refresh.*inbox/i)
  expect(
    await client.query(api.conversations.getSummary, {
      conversationId: ids[0],
    }),
  ).toMatchObject({ _id: ids[0] })
  expect(
    await t
      .withIdentity({ subject: fixtureClerkId('outsider') })
      .query(api.conversations.getSummary, { conversationId: ids[0] }),
  ).toBeNull()
  expect(
    await client.query(api.conversations.getSummary, {
      conversationId: 'invalid',
    }),
  ).toBeNull()
  const capped = await client.query(api.conversations.listPage, {
    side: 'low',
    paginationOpts: { cursor: null, numItems: 5000 },
  })
  expect(capped.page.length).toBeLessThanOrEqual(50)
  await expect(
    t
      .withIdentity({ subject: fixtureClerkId('outsider') })
      .mutation(api.conversations.markRead, { conversationId: ids[0] }),
  ).rejects.toThrow('Conversation not found')
  await expect(
    t.query(api.conversations.listPage, {
      side: 'low',
      paginationOpts: { cursor: null, numItems: 30 },
    }),
  ).rejects.toThrow('Unauthorized')
})

it('keeps bounded legacy Inbox clients compatible with current privacy and projected read receipts', async () => {
  const t = convexTest(schema, modules)
  const a = await seedUser(t, { username: 'a' })
  const b = await seedUser(t, { username: 'b' })
  await seedUser(t, { username: 'outsider' })
  const { conversationId, messageId } = await seedConversation(t, a, b, {
    isRequest: false,
    lastMessageSenderId: a,
  })
  const client = t.withIdentity({ subject: fixtureClerkId('b') })
  await client.mutation(api.conversations.markRead, { conversationId })
  expect(await client.query(legacyList, {})).toMatchObject([
    { _id: conversationId, status: 'active' },
  ])
  const detail = await client.query(legacyGet, { conversationId })
  expect(detail.conversation._id).toBe(conversationId)
  expect(detail.messages).toMatchObject([{ _id: messageId, readAt: NOW }])
  expect((await t.run((ctx) => ctx.db.get(messageId)))!.readAt).toBeNull()
  await expect(t.query(legacyList, {})).rejects.toThrow('Unauthorized')
  await expect(
    t
      .withIdentity({ subject: fixtureClerkId('outsider') })
      .query(legacyGet, { conversationId }),
  ).rejects.toThrow('Conversation not found')
  await t.run((ctx) => ctx.db.patch(a, { deactivatedAt: NOW }))
  expect((await client.query(legacyList, {}))[0].otherUser).toMatchObject({
    displayName: 'account unavailable',
    githubUsername: '',
    cityName: null,
  })
  expect(
    (await client.query(legacyGet, { conversationId })).conversation.otherUser,
  ).toMatchObject({ displayName: 'account unavailable' })
})

it('retains persisted legacy read receipts while projecting the new watermark', async () => {
  const t = convexTest(schema, modules)
  const a = await seedUser(t, { username: 'a' })
  const b = await seedUser(t, { username: 'b' })
  const { conversationId, messageId } = await seedConversation(t, a, b, {
    isRequest: false,
    lastMessageSenderId: a,
  })
  await t.run((ctx) => ctx.db.patch(messageId, { readAt: NOW - 100 }))
  const client = t.withIdentity({ subject: fixtureClerkId('b') })
  await client.mutation(api.conversations.markRead, { conversationId })
  expect(
    (
      await client.query(api.conversations.messagesPage, {
        conversationId,
        paginationOpts: { cursor: null, numItems: 30 },
      })
    ).page[0].readAt,
  ).toBe(NOW - 100)
})
