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
import { isAccountDeleted } from './lib/account_deletion'
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

const readWatermarksValidator = v.optional(
  v.record(v.string(), v.object({ sequence: v.number(), readAt: v.number() })),
)

const conversationValidator = v.object({
  messageSequence: v.optional(v.number()),
  readWatermarks: readWatermarksValidator,
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
  sequence: v.optional(v.number()),
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
 * Rule: `isRequest` stays true only while every message came from the
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
  messageSequence: v.optional(v.number()),
  readWatermarks: readWatermarksValidator,
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

function isRecipientUnavailable(user: Doc<'users'>) {
  return isAccountDeleted(user) || user.deactivatedAt != null
}

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
 * City label a conversation partner may see, per the visibility policy
 * (`convex/lib/visibility.ts`): the exact city name for exact-city users, the region label
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
  // Transactions serialize on the conversation; unlike wall-clock time this
  // distinguishes a message arriving just after a read in the same millisecond.
  const sequence = (conversation.messageSequence ?? 0) + 1
  const messageId = await ctx.db.insert('messages', {
    sequence,
    conversationId: conversation._id,
    senderId: sender._id,
    content,
    readAt: null,
    createdAt: sentAt,
  })

  await ctx.db.patch(conversation._id, {
    messageSequence: sequence,
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

async function enrichConversation(
  ctx: QueryCtx,
  conversation: Doc<'conversations'>,
  viewerId: Id<'users'>,
) {
  const otherUser = await ctx.db.get(
    getOtherParticipantId(conversation, viewerId),
  )
  const unavailable = !otherUser || isRecipientUnavailable(otherUser)
  return {
    ...conversation,
    status: getConversationStatus(conversation, viewerId),
    otherUser: otherUser
      ? {
          userId: otherUser._id,
          githubUsername: unavailable ? '' : otherUser.github.username,
          displayName: unavailable
            ? 'account unavailable'
            : otherUser.profile.displayName,
          avatarUrl: unavailable ? null : otherUser.profile.avatarUrl,
          cityName: unavailable
            ? null
            : await getDisclosedCityName(ctx, otherUser),
        }
      : null,
  }
}

function projectReadReceipt(
  conversation: Doc<'conversations'>,
  message: Doc<'messages'>,
) {
  const recipientId = getOtherParticipantId(conversation, message.senderId)
  const watermark = conversation.readWatermarks?.[String(recipientId)]
  // Legacy rows precede sequence writes. Keep their persisted receipts.
  return {
    ...message,
    readAt:
      message.readAt ??
      (watermark && (message.sequence ?? 0) <= watermark.sequence
        ? watermark.readAt
        : null),
  }
}

function requirePagedInbox(): never {
  throw new ConvexError({
    code: 'CLIENT_UPGRADE_REQUIRED',
    message: 'Refresh the Inbox to load the paginated version.',
  })
}

/** Temporary compatibility for already-loaded clients; never silently truncate. */
export const list = query({
  args: {},
  returns: v.array(enrichedConversationValidator),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const [low, high] = await Promise.all([
      ctx.db
        .query('conversations')
        .withIndex('by_participant_low_updated', (q) =>
          q.eq('participantLowId', viewer._id),
        )
        .order('desc')
        .take(101),
      ctx.db
        .query('conversations')
        .withIndex('by_participant_high_updated', (q) =>
          q.eq('participantHighId', viewer._id),
        )
        .order('desc')
        .take(101),
    ])
    if (low.length + high.length > 100) return requirePagedInbox()
    const rows = [...low, ...high]
      .filter((row) => row.lastMessage.content.trim())
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return await Promise.all(
      rows.map((row) => enrichConversation(ctx, row, viewer._id)),
    )
  },
})

/** Retire only after the paged frontend has replaced old clients. */
export const get = query({
  args: { conversationId: v.id('conversations') },
  returns: v.object({
    conversation: enrichedConversationValidator,
    messages: v.array(messageValidator),
  }),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation || !canViewerAccessConversation(conversation, viewer._id))
      throw new ConvexError('Conversation not found')
    const page = await ctx.db
      .query('messages')
      .withIndex('by_conversation_created', (q) =>
        q.eq('conversationId', conversation._id),
      )
      .paginate({
        cursor: null,
        numItems: 100,
        maximumRowsRead: 100,
        maximumBytesRead: 256_000,
      })
    if (!page.isDone) return requirePagedInbox()
    return {
      conversation: await enrichConversation(ctx, conversation, viewer._id),
      messages: page.page.map((message) =>
        projectReadReceipt(conversation, message),
      ),
    }
  },
})

export const listPage = query({
  args: {
    side: v.union(v.literal('low'), v.literal('high')),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(enrichedConversationValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const source =
      args.side === 'low'
        ? ctx.db
            .query('conversations')
            .withIndex('by_participant_low_updated', (q) =>
              q.eq('participantLowId', viewer._id),
            )
        : ctx.db
            .query('conversations')
            .withIndex('by_participant_high_updated', (q) =>
              q.eq('participantHighId', viewer._id),
            )
    const page = await source.order('desc').paginate({
      ...args.paginationOpts,
      numItems: Math.min(Math.max(1, args.paginationOpts.numItems), 50),
      maximumRowsRead: 50,
      maximumBytesRead: 256_000,
    })
    return {
      ...page,
      page: await Promise.all(
        page.page
          .filter((row) => row.lastMessage.content.trim())
          .map((row) => enrichConversation(ctx, row, viewer._id)),
      ),
    }
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
    if (!otherUser || isRecipientUnavailable(otherUser)) {
      return null
    }

    return {
      ...buildRecipientPreview(otherUser),
      cityName: await getDisclosedCityName(ctx, otherUser),
    }
  },
})

/** Selected conversations are independent of the currently loaded list pages. */
export const getSummary = query({
  args: { conversationId: v.string() },
  returns: v.union(enrichedConversationValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const id = ctx.db.normalizeId('conversations', args.conversationId)
    const conversation = id ? await ctx.db.get(id) : null
    if (
      !conversation ||
      !canViewerAccessConversation(conversation, viewer._id) ||
      !conversation.lastMessage.content.trim()
    )
      return null
    return await enrichConversation(ctx, conversation, viewer._id)
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

    const page = await ctx.db
      .query('messages')
      .withIndex('by_conversation_created', (query) =>
        query.eq('conversationId', conversation._id),
      )
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(Math.max(1, args.paginationOpts.numItems), 100),
        maximumRowsRead: 100,
        maximumBytesRead: 256_000,
      })

    return {
      ...page,
      page: page.page.map((message) =>
        projectReadReceipt(conversation, message),
      ),
    }
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
    if (!otherUser || isRecipientUnavailable(otherUser)) {
      throw new ConvexError('Recipient unavailable')
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
    if (!recipient || isRecipientUnavailable(recipient)) {
      throw new ConvexError('Recipient unavailable')
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

    const otherUser = await ctx.db.get(args.otherUserId)
    if (
      !otherUser ||
      isRecipientUnavailable(otherUser) ||
      otherUser._id === viewer._id
    ) {
      throw new ConvexError('Recipient unavailable')
    }
    await enforceRateLimit(ctx, 'conversationMessage', String(viewer._id))

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

    const clearedUnreadCount =
      conversation.unreadCounts[String(viewer._id)] ?? 0
    const readAt = Date.now()
    const sequence = conversation.messageSequence ?? 0
    if (
      clearedUnreadCount === 0 &&
      conversation.readWatermarks?.[String(viewer._id)]?.sequence === sequence
    )
      return null

    // Reading does not touch `updatedAt`: the inbox orders by it, so a read
    // must not move the conversation to the top of the list.
    await ctx.db.patch(conversation._id, {
      readWatermarks: {
        ...conversation.readWatermarks,
        [String(viewer._id)]: { sequence, readAt },
      },
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
