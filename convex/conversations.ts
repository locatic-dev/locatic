import { ConvexError, v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'

import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { getViewerOrThrow } from './lib/auth'
import { buildConversationKey } from './lib/conversation'
import {
  buildConversationNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'
import { assertMaxLength } from './lib/content_limits'
import { enforceRateLimit } from './lib/rate_limits'
import { buildSnapshotLocation } from './lib/snapshots'
import { countMetric } from './metrics'

const lastMessageValidator = v.object({
  content: v.string(),
  senderId: v.id('users'),
  sentAt: v.number(),
})

const conversationValidator = v.object({
  _id: v.id('conversations'),
  _creationTime: v.number(),
  conversationKey: v.string(),
  participantLowId: v.id('users'),
  participantHighId: v.id('users'),
  lastMessage: lastMessageValidator,
  unreadCounts: v.record(v.string(), v.number()),
  isRequest: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const messageValidator = v.object({
  _id: v.id('messages'),
  _creationTime: v.number(),
  conversationId: v.id('conversations'),
  senderId: v.id('users'),
  content: v.string(),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
})

const conversationOtherUserValidator = v.object({
  userId: v.id('users'),
  githubUsername: v.string(),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  cityName: v.union(v.string(), v.null()),
})

/**
 * How a conversation reads for the viewer:
 * - `request`: an incoming message request the viewer has not answered.
 * - `pending`: an outgoing request the other person has not answered yet.
 * - `active`: an accepted conversation.
 *
 * Rule (C9): `isRequest` stays true only while every message came from the
 * person who started the conversation, because the first reply from the
 * recipient clears it (`sendMessage`, `sendFirstMessage`). So while
 * `isRequest` holds, `lastMessage.senderId` is the requester: equal to the
 * viewer means outgoing (`pending`), otherwise incoming (`request`).
 */
const conversationStatusValidator = v.union(
  v.literal('active'),
  v.literal('pending'),
  v.literal('request'),
)

function getConversationStatus(
  conversation: Doc<'conversations'>,
  viewerId: Id<'users'>,
) {
  if (!conversation.isRequest) {
    return 'active' as const
  }

  return conversation.lastMessage.senderId === viewerId
    ? ('pending' as const)
    : ('request' as const)
}

const enrichedConversationValidator = v.object({
  _id: v.id('conversations'),
  _creationTime: v.number(),
  conversationKey: v.string(),
  participantLowId: v.id('users'),
  participantHighId: v.id('users'),
  lastMessage: lastMessageValidator,
  unreadCounts: v.record(v.string(), v.number()),
  isRequest: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  status: conversationStatusValidator,
  otherUser: v.union(conversationOtherUserValidator, v.null()),
})

const recipientPreviewValidator = v.object({
  userId: v.id('users'),
  githubUsername: v.string(),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  cityName: v.union(v.string(), v.null()),
})

const firstMessageResultValidator = v.object({
  conversationId: v.id('conversations'),
  isRequest: v.boolean(),
  messageId: v.id('messages'),
})

function buildRecipientPreview(user: {
  _id: Id<'users'>
  github: { username: string }
  profile: {
    displayName: string
    avatarUrl?: string | null
  }
}) {
  return {
    userId: user._id,
    githubUsername: user.github.username,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl ?? null,
  }
}

/**
 * City label a conversation partner may see, per the visibility policy (plan
 * decision D8): the exact city name for exact-city users, the region label
 * for region-only users, null for hidden users.
 */
async function getDisclosedCityName(
  ctx: QueryCtx | MutationCtx,
  user: Doc<'users'>,
) {
  return (await buildSnapshotLocation(ctx.db, user)).cityName
}

async function getConversationForViewerPair(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<'users'>,
  otherUserId: Id<'users'>,
) {
  const key = buildConversationKey(String(viewerId), String(otherUserId))
  return await ctx.db
    .query('conversations')
    .withIndex('by_conversation_key', (query) =>
      query.eq('conversationKey', key),
    )
    .unique()
}

function getOtherParticipantId(
  conversation: Doc<'conversations'>,
  viewerId: Id<'users'>,
) {
  return conversation.participantLowId === viewerId
    ? conversation.participantHighId
    : conversation.participantLowId
}

function canViewerAccessConversation(
  conversation: Doc<'conversations'>,
  viewerId: Id<'users'>,
) {
  return (
    conversation.participantLowId === viewerId ||
    conversation.participantHighId === viewerId
  )
}

async function createConversationForFirstMessage({
  ctx,
  key,
  recipientId,
  sentAt,
  viewerId,
}: {
  ctx: MutationCtx
  key: string
  recipientId: Id<'users'>
  sentAt: number
  viewerId: Id<'users'>
}) {
  const [participantLowId, participantHighId] =
    String(viewerId) < String(recipientId)
      ? [viewerId, recipientId]
      : [recipientId, viewerId]
  const conversationId = await ctx.db.insert('conversations', {
    conversationKey: key,
    participantLowId,
    participantHighId,
    lastMessage: {
      content: '',
      senderId: viewerId,
      sentAt,
    },
    unreadCounts: {
      [String(viewerId)]: 0,
      [String(recipientId)]: 0,
    },
    isRequest: true,
    createdAt: sentAt,
    updatedAt: sentAt,
  })
  const conversation = await ctx.db.get(conversationId)
  if (!conversation) {
    throw new ConvexError('Conversation could not be created')
  }

  return conversation
}

async function appendMessageToConversation({
  content,
  conversation,
  ctx,
  nextIsRequest,
  recipient,
  sender,
  sentAt,
}: {
  content: string
  conversation: Doc<'conversations'>
  ctx: MutationCtx
  nextIsRequest: boolean
  recipient: Doc<'users'>
  sender: Doc<'users'>
  sentAt: number
}) {
  const messageId = await ctx.db.insert('messages', {
    conversationId: conversation._id,
    senderId: sender._id,
    content,
    readAt: null,
    createdAt: sentAt,
  })

  await ctx.db.patch(conversation._id, {
    lastMessage: {
      content,
      senderId: sender._id,
      sentAt,
    },
    unreadCounts: {
      ...conversation.unreadCounts,
      [String(recipient._id)]:
        (conversation.unreadCounts[String(recipient._id)] ?? 0) + 1,
    },
    isRequest: nextIsRequest,
    updatedAt: sentAt,
  })

  await ctx.db.patch(recipient._id, {
    unreadMessagesCount: recipient.unreadMessagesCount + 1,
    updatedAt: sentAt,
  })

  await createNotificationIfEnabled(ctx, {
    recipient,
    actor: sender,
    type: 'dm_received',
    conversationId: conversation._id,
    target: buildConversationNotificationTarget(
      conversation._id,
      nextIsRequest,
    ),
  })

  return { messageId }
}

export const list = query({
  args: {},
  returns: v.array(enrichedConversationValidator),
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

    const conversations = [...asLow, ...asHigh]
      .filter((conversation) => conversation.lastMessage.content.trim())
      .sort((left, right) => right.updatedAt - left.updatedAt)

    return await Promise.all(
      conversations.map(async (conversation) => {
        const otherUserId =
          conversation.participantLowId === viewer._id
            ? conversation.participantHighId
            : conversation.participantLowId
        const otherUser = await ctx.db.get(otherUserId)
        const cityName = otherUser
          ? await getDisclosedCityName(ctx, otherUser)
          : null

        return {
          ...conversation,
          status: getConversationStatus(conversation, viewer._id),
          otherUser: otherUser
            ? {
                userId: otherUser._id,
                githubUsername: otherUser.github.username,
                displayName: otherUser.profile.displayName,
                avatarUrl: otherUser.profile.avatarUrl,
                cityName,
              }
            : null,
        }
      }),
    )
  },
})

export const findWithUser = query({
  args: {
    otherUserId: v.id('users'),
  },
  returns: v.union(conversationValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    if (viewer._id === args.otherUserId) {
      return null
    }

    const conversation = await getConversationForViewerPair(
      ctx,
      viewer._id,
      args.otherUserId,
    )

    return conversation?.lastMessage.content.trim() ? conversation : null
  },
})

export const getRecipientPreview = query({
  args: {
    otherUserId: v.string(),
  },
  returns: v.union(recipientPreviewValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const otherUserId = ctx.db.normalizeId('users', args.otherUserId)
    if (!otherUserId || viewer._id === otherUserId) {
      return null
    }

    const otherUser = await ctx.db.get(otherUserId)
    if (!otherUser) {
      return null
    }

    return {
      ...buildRecipientPreview(otherUser),
      cityName: await getDisclosedCityName(ctx, otherUser),
    }
  },
})

export const get = query({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: v.object({
    conversation: enrichedConversationValidator,
    messages: v.array(messageValidator),
  }),
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
    const cityName = otherUser
      ? await getDisclosedCityName(ctx, otherUser)
      : null

    return {
      conversation: {
        ...conversation,
        status: getConversationStatus(conversation, viewer._id),
        otherUser: otherUser
          ? {
              userId: otherUser._id,
              githubUsername: otherUser.github.username,
              displayName: otherUser.profile.displayName,
              avatarUrl: otherUser.profile.avatarUrl,
              cityName,
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
  returns: paginationResultValidator(messageValidator),
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
  returns: v.union(conversationValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const otherUser = await ctx.db.get(args.otherUserId)
    if (!otherUser) {
      throw new ConvexError('Recipient not found')
    }

    const existing = await getConversationForViewerPair(
      ctx,
      viewer._id,
      otherUser._id,
    )

    if (existing) {
      return existing.lastMessage.content.trim() ? existing : null
    }

    return null
  },
})

export const sendMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    content: v.string(),
  },
  returns: v.union(messageValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const content = args.content.trim()
    if (!content) {
      throw new ConvexError('Message cannot be empty')
    }
    assertMaxLength('message', content)

    await enforceRateLimit(ctx, 'conversationMessage', String(viewer._id))
    const conversation = await ctx.db.get(args.conversationId)
    if (
      !conversation ||
      !canViewerAccessConversation(conversation, viewer._id)
    ) {
      throw new ConvexError('Conversation not found')
    }

    const recipientId = getOtherParticipantId(conversation, viewer._id)
    const recipient = await ctx.db.get(recipientId)
    if (!recipient) {
      throw new ConvexError('Recipient not found')
    }

    const sentAt = Date.now()
    const nextIsRequest =
      conversation.isRequest && conversation.lastMessage.senderId === viewer._id

    const { messageId } = await appendMessageToConversation({
      content,
      conversation,
      ctx,
      nextIsRequest,
      recipient,
      sender: viewer,
      sentAt,
    })

    return await ctx.db.get(messageId)
  },
})

export const sendFirstMessage = mutation({
  args: {
    otherUserId: v.id('users'),
    content: v.string(),
  },
  returns: firstMessageResultValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const content = args.content.trim()
    if (!content) {
      throw new ConvexError('Message cannot be empty')
    }
    assertMaxLength('message', content)

    await enforceRateLimit(ctx, 'conversationMessage', String(viewer._id))
    const otherUser = await ctx.db.get(args.otherUserId)
    if (!otherUser || otherUser._id === viewer._id) {
      throw new ConvexError('Recipient not found')
    }

    const key = buildConversationKey(String(viewer._id), String(otherUser._id))
    const existing = await getConversationForViewerPair(
      ctx,
      viewer._id,
      otherUser._id,
    )
    const sentAt = Date.now()
    let conversation = existing

    if (!conversation) {
      conversation = await createConversationForFirstMessage({
        ctx,
        key,
        recipientId: otherUser._id,
        sentAt,
        viewerId: viewer._id,
      })
      await countMetric(ctx, 'dm_open')
    }

    const resultingIsRequest = conversation.lastMessage.content.trim()
      ? conversation.isRequest &&
        conversation.lastMessage.senderId === viewer._id
      : true
    const { messageId } = await appendMessageToConversation({
      content,
      conversation,
      ctx,
      nextIsRequest: resultingIsRequest,
      recipient: otherUser,
      sender: viewer,
      sentAt,
    })

    return {
      conversationId: conversation._id,
      isRequest: resultingIsRequest,
      messageId,
    }
  },
})

export const markRead = mutation({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: v.null(),
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

    // Reading does not touch `updatedAt`: the inbox orders by it, so a read
    // must not move the conversation to the top of the list.
    await ctx.db.patch(conversation._id, {
      unreadCounts: {
        ...conversation.unreadCounts,
        [String(viewer._id)]: 0,
      },
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
