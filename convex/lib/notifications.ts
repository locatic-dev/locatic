import type { MutationCtx } from '../_generated/server'
import type { Doc } from './types'

type NotificationTarget = {
  kind: 'profile' | 'project' | 'conversation'
  username: string | null
  projectFullName: string | null
  conversationId: Doc<'conversations'>['_id'] | null
  inboxTab?: 'inbox' | 'requests' | null
  commentId: Doc<'comments'>['_id'] | null
}

const NOTIFICATION_PREF_MAP = {
  project_liked: 'projectLikes',
  update_reacted: 'updateLikes',
  project_commented: 'comments',
  comment_replied: 'commentReplies',
  followed: 'newFollowers',
  dm_received: 'dms',
  contributor_recognized: 'contributorRecognized',
} as const

interface CreateNotificationArgs {
  recipient: Doc<'users'>
  actor: Doc<'users'>
  type: keyof typeof NOTIFICATION_PREF_MAP
  projectId?: Doc<'projects'>['_id'] | null
  updateId?: Doc<'updates'>['_id'] | null
  commentId?: Doc<'comments'>['_id'] | null
  conversationId?: Doc<'conversations'>['_id'] | null
  projectName?: string | null
  target?: NotificationTarget | null
}

export function buildProfileNotificationTarget(
  username: string,
): NotificationTarget {
  return {
    kind: 'profile',
    username,
    projectFullName: null,
    conversationId: null,
    inboxTab: null,
    commentId: null,
  }
}

export function buildProjectNotificationTarget(
  projectFullName: string,
  options?: {
    commentId?: Doc<'comments'>['_id'] | null
  },
): NotificationTarget {
  return {
    kind: 'project',
    username: null,
    projectFullName,
    conversationId: null,
    inboxTab: null,
    commentId: options?.commentId ?? null,
  }
}

export function buildConversationNotificationTarget(
  conversationId: Doc<'conversations'>['_id'],
  isRequest: boolean,
): NotificationTarget {
  return {
    kind: 'conversation',
    username: null,
    projectFullName: null,
    conversationId,
    inboxTab: isRequest ? 'requests' : 'inbox',
    commentId: null,
  }
}

export async function createNotificationIfEnabled(
  ctx: MutationCtx,
  {
    recipient,
    actor,
    type,
    projectId = null,
    updateId = null,
    commentId = null,
    conversationId = null,
    projectName = null,
    target = null,
  }: CreateNotificationArgs,
) {
  if (recipient._id === actor._id) {
    return null
  }

  const prefKey = NOTIFICATION_PREF_MAP[type]
  if (!recipient.notificationPrefs[prefKey]) {
    return null
  }

  return await ctx.db.insert('notifications', {
    recipientId: recipient._id,
    actorId: actor._id,
    type,
    projectId,
    updateId,
    commentId,
    actorSnapshot: {
      displayName: actor.profile.displayName,
      avatarUrl: actor.profile.avatarUrl,
    },
    projectName,
    ...(target || conversationId
      ? {
          target:
            target ??
            buildConversationNotificationTarget(conversationId!, false),
        }
      : {}),
    isRead: false,
    createdAt: Date.now(),
  })
}
