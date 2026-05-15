import type { MutationCtx } from '../_generated/server'
import type { Doc } from './types'

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
  projectName?: string | null
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
    projectName = null,
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
    isRead: false,
    createdAt: Date.now(),
  })
}
