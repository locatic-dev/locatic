export type HomeFeedEventType =
  | 'project_posted'
  | 'post_created'
  | 'update_broadcast'
  | 'project_liked'
  | 'project_commented'
  | 'post_commented'
  | 'contributor_matched'

export function getHomeFeedActivityLabel({
  actorDisplayName,
  eventType,
}: {
  actorDisplayName: string
  eventType: HomeFeedEventType
}) {
  const actorName = actorDisplayName.trim() || 'Someone'

  switch (eventType) {
    case 'project_posted':
      return `${actorName} shipped this`
    case 'post_created':
      return `${actorName} posted an update`
    case 'update_broadcast':
      return `${actorName} updated this`
    case 'project_liked':
      return `${actorName} liked this`
    case 'project_commented':
    case 'post_commented':
      return `${actorName} commented here`
    case 'contributor_matched':
      return `${actorName} matched with this`
    default:
      return `${actorName} shared this`
  }
}
