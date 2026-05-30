import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildConversationKey } from './lib/conversation'
import {
  buildConversationNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'

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

    const conversations = [...asLow, ...asHigh].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )

    return await Promise.all(
      conversations.map(async (conversation) => {
        const otherUserId =
          conversation.participantLowId === viewer._id
            ? conversation.participantHighId
            : conversation.participantLowId
        const otherUser = await ctx.db.get(otherUserId)
        const city = otherUser?.profile.cityId
          ? await ctx.db.get(otherUser.profile.cityId)
          : null

        return {
          ...conversation,
          otherUser: otherUser
            ? {
                userId: otherUser._id,
                githubUsername: otherUser.github.username,
                displayName: otherUser.profile.displayName,
                avatarUrl: otherUser.profile.avatarUrl,
                cityName: city?.displayName ?? null,
              }
            : null,
        }
      }),
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

    const otherUserId =
      conversation.participantLowId === viewer._id
        ? conversation.participantHighId
        : conversation.participantLowId
    const otherUser = await ctx.db.get(otherUserId)
    const city = otherUser?.profile.cityId
      ? await ctx.db.get(otherUser.profile.cityId)
      : null

    return {
      conversation: {
        ...conversation,
        otherUser: otherUser
          ? {
              userId: otherUser._id,
              githubUsername: otherUser.github.username,
              displayName: otherUser.profile.displayName,
              avatarUrl: otherUser.profile.avatarUrl,
              cityName: city?.displayName ?? null,
            }
          : null,
      },
      messages,
    }
  },
})

export const messagesPage = query({
  args: {
    conversationId: v.id('conversations'),
    paginationOpts: paginationOptsValidator,
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

    return await ctx.db
      .query('messages')
      .withIndex('by_conversation_created', (query) =>
        query.eq('conversationId', conversation._id),
      )
      .order('desc')
      .paginate(args.paginationOpts)
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

    const sentAt = Date.now()

    const messageId = await ctx.db.insert('messages', {
      conversationId: conversation._id,
      senderId: viewer._id,
      content: args.content,
      readAt: null,
      createdAt: sentAt,
    })

    await ctx.db.patch(conversation._id, {
      lastMessage: {
        content: args.content,
        senderId: viewer._id,
        sentAt,
      },
      unreadCounts: {
        ...conversation.unreadCounts,
        [String(recipientId)]:
          (conversation.unreadCounts[String(recipientId)] ?? 0) + 1,
      },
      isRequest:
        conversation.isRequest &&
        conversation.lastMessage.senderId === viewer._id,
      updatedAt: sentAt,
    })

    await ctx.db.patch(recipient._id, {
      unreadMessagesCount: recipient.unreadMessagesCount + 1,
      updatedAt: sentAt,
    })

    await createNotificationIfEnabled(ctx, {
      recipient,
      actor: viewer,
      type: 'dm_received',
      conversationId: conversation._id,
      target: buildConversationNotificationTarget(
        conversation._id,
        conversation.isRequest &&
          conversation.lastMessage.senderId === viewer._id,
      ),
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
    const clearedUnreadCount =
      conversation.unreadCounts[String(viewer._id)] ?? 0
    const readAt = Date.now()

    await Promise.all(
      messages
        .filter(
          (message) =>
            message.senderId !== viewer._id && message.readAt === null,
        )
        .map((message) =>
          ctx.db.patch(message._id, {
            readAt,
          }),
        ),
    )

    await ctx.db.patch(conversation._id, {
      unreadCounts: {
        ...conversation.unreadCounts,
        [String(viewer._id)]: 0,
      },
      updatedAt: readAt,
    })

    if (clearedUnreadCount > 0) {
      await ctx.db.patch(viewer._id, {
        unreadMessagesCount: Math.max(
          0,
          viewer.unreadMessagesCount - clearedUnreadCount,
        ),
        updatedAt: readAt,
      })
    }

    return null
  },
})
