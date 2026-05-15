import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildConversationKey } from './lib/conversation'
import { createNotificationIfEnabled } from './lib/notifications'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const [asLow, asHigh] = await Promise.all([
      ctx.db
        .query('conversations')
        .withIndex('by_participant_low_updated', (query) =>
          query.eq('participantLowId', viewer._id),
        )
        .collect(),
      ctx.db
        .query('conversations')
        .withIndex('by_participant_high_updated', (query) =>
          query.eq('participantHighId', viewer._id),
        )
        .collect(),
    ])

    return [...asLow, ...asHigh].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )
  },
})

export const get = query({
  args: {
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (
      !conversation ||
      (conversation.participantLowId !== viewer._id &&
        conversation.participantHighId !== viewer._id)
    ) {
      throw new ConvexError('Conversation not found')
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation_created', (query) =>
        query.eq('conversationId', conversation._id),
      )
      .collect()

    return { conversation, messages }
  },
})

export const startOrGet = mutation({
  args: {
    otherUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const otherUser = await ctx.db.get(args.otherUserId)
    if (!otherUser) {
      throw new ConvexError('Recipient not found')
    }

    const key = buildConversationKey(String(viewer._id), String(otherUser._id))
    const existing = await ctx.db
      .query('conversations')
      .withIndex('by_conversation_key', (query) =>
        query.eq('conversationKey', key),
      )
      .unique()

    if (existing) {
      return existing
    }

    const [participantLowId, participantHighId] =
      String(viewer._id) < String(otherUser._id)
        ? [viewer._id, otherUser._id]
        : [otherUser._id, viewer._id]

    const conversationId = await ctx.db.insert('conversations', {
      conversationKey: key,
      participantLowId,
      participantHighId,
      lastMessage: {
        content: '',
        senderId: viewer._id,
        sentAt: Date.now(),
      },
      unreadCounts: {
        [String(viewer._id)]: 0,
        [String(otherUser._id)]: 0,
      },
      isRequest: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    return await ctx.db.get(conversationId)
  },
})

export const sendMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (
      !conversation ||
      (conversation.participantLowId !== viewer._id &&
        conversation.participantHighId !== viewer._id)
    ) {
      throw new ConvexError('Conversation not found')
    }

    const recipientId =
      conversation.participantLowId === viewer._id
        ? conversation.participantHighId
        : conversation.participantLowId
    const recipient = await ctx.db.get(recipientId)
    if (!recipient) {
      throw new ConvexError('Recipient not found')
    }

    const messageId = await ctx.db.insert('messages', {
      conversationId: conversation._id,
      senderId: viewer._id,
      content: args.content,
      readAt: null,
      createdAt: Date.now(),
    })

    await ctx.db.patch(conversation._id, {
      lastMessage: {
        content: args.content,
        senderId: viewer._id,
        sentAt: Date.now(),
      },
      unreadCounts: {
        ...conversation.unreadCounts,
        [String(recipientId)]:
          (conversation.unreadCounts[String(recipientId)] ?? 0) + 1,
      },
      isRequest:
        conversation.isRequest &&
        !conversation.unreadCounts[String(viewer._id)],
      updatedAt: Date.now(),
    })

    await createNotificationIfEnabled(ctx, {
      recipient,
      actor: viewer,
      type: 'dm_received',
    })

    return await ctx.db.get(messageId)
  },
})

export const markRead = mutation({
  args: {
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (
      !conversation ||
      (conversation.participantLowId !== viewer._id &&
        conversation.participantHighId !== viewer._id)
    ) {
      throw new ConvexError('Conversation not found')
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (query) =>
        query.eq('conversationId', conversation._id),
      )
      .collect()

    await Promise.all(
      messages
        .filter(
          (message) =>
            message.senderId !== viewer._id && message.readAt === null,
        )
        .map((message) =>
          ctx.db.patch(message._id, {
            readAt: Date.now(),
          }),
        ),
    )

    await ctx.db.patch(conversation._id, {
      unreadCounts: {
        ...conversation.unreadCounts,
        [String(viewer._id)]: 0,
      },
      updatedAt: Date.now(),
    })

    return null
  },
})
