import type { Doc } from '../../../convex/_generated/dataModel'

export type NotificationType = Doc<'notifications'>['type']

/**
 * What the actor did, written to follow the actor's name ("ana commented on
 * your post on "locatic""). Every notification type has its own verb; the
 * `never` check fails the build when a new type is added without one.
 */
export function getNotificationAction(notification: {
  type: NotificationType
  projectName?: string | null
}): string {
  const name = notification.projectName?.trim()
  const quoted = name ? `"${name}"` : null

  switch (notification.type) {
    case 'project_liked':
      return quoted ? `liked your project ${quoted}` : 'liked your project'
    case 'post_reacted':
      return quoted
        ? `reacted to your post on ${quoted}`
        : 'reacted to your post'
    case 'project_commented':
      return quoted
        ? `commented on your project ${quoted}`
        : 'commented on your project'
    case 'post_commented':
      return quoted
        ? `commented on your post on ${quoted}`
        : 'commented on your post'
    case 'comment_replied':
      return 'replied to your comment'
    case 'followed':
      return 'started following you'
    case 'dm_received':
      return 'sent you a message'
    case 'contributor_recognized':
      return quoted
        ? `recognized you as a contributor to ${quoted}`
        : 'recognized you as a contributor'
    default: {
      const unhandled: never = notification.type
      return unhandled
    }
  }
}
