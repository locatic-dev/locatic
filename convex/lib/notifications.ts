import type { MutationCtx } from '../_generated/server'
import type { Doc } from './types'

type NotificationTarget = {
  kind: 'profile' | 'project' | 'conversation'
  username: string | null
  projectFullName: string | null
  projectOwner?: string | null
  projectRepo?: string | null
  conversationId: Doc<'conversations'>['_id'] | null
  inboxTab?: 'inbox' | 'requests' | null
  commentId: Doc<'comments'>['_id'] | null
}

const NOTIFICATION_PREF_MAP = {
  project_liked: 'projectLikes',
  post_reacted: 'updateLikes',
  project_commented: 'comments',
  post_commented: 'comments',
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
  postId?: Doc<'posts'>['_id'] | null
  commentId?: Doc<'comments'>['_id'] | null
  conversationId?: Doc<'conversations'>['_id'] | null
  projectName?: string | null
  target?: NotificationTarget | null
  createdAt?: number
}

export function buildProfileNotificationTarget(
  username: string,
): NotificationTarget {
  return {
    kind: 'profile',
    username,
    projectFullName: null,
    projectOwner: null,
    projectRepo: null,
    conversationId: null,
    inboxTab: null,
    commentId: null,
  }
}

export function buildProjectNotificationTarget(
  project: {
    fullName: string
    owner: string
    repo: string
  },
  options?: {
    commentId?: Doc<'comments'>['_id'] | null
  },
): NotificationTarget {
  return {
    kind: 'project',
    username: null,
    projectFullName: project.fullName,
    projectOwner: project.owner,
    projectRepo: project.repo,
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
    projectOwner: null,
    projectRepo: null,
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
    postId = null,
    commentId = null,
    conversationId = null,
    projectName = null,
    target = null,
    createdAt = Date.now(),
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
    postId,
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
    createdAt,
  })
}
