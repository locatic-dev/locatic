import { relativeTime } from '@/lib/time'
import type { HomeFeedEventType, HomeFeedItem } from './cache'

function actorName(item: HomeFeedItem) {
  return item.actorSnapshot.displayName.trim() || 'Someone'
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function dayCopy(timestamp: number) {
  const today = new Date()
  const target = new Date(timestamp)
  const todayKey = today.toDateString()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (target.toDateString() === todayKey) {
    return 'today'
  }

  if (target.toDateString() === yesterday.toDateString()) {
    return 'yesterday'
  }

  return relativeTime(timestamp)
}

function actionNoun(eventType: HomeFeedEventType) {
  switch (eventType) {
    case 'project_liked':
      return 'like'
    case 'followed':
      return 'follow'
    case 'project_posted':
      return 'project'
    case 'post_created':
      return 'update'
    case 'project_commented':
    case 'post_commented':
      return 'comment'
    case 'contributor_matched':
      return 'match'
  }
}

export function getHomeFeedSummary(item: HomeFeedItem) {
  const count = item.eventCount ?? 1
  const actor = actorName(item)
  const eventType = item.groupKind ?? item.eventType

  if (count > 1) {
    switch (eventType) {
      case 'project_liked':
        return `${actor} liked ${count} projects`
      case 'followed':
        return `${actor} followed ${count} builders`
      case 'project_posted':
        return `${actor} published ${count} projects`
      case 'post_created':
        return `${actor} posted ${count} updates`
      case 'project_commented':
      case 'post_commented':
        return `${actor} left ${count} comments`
      case 'contributor_matched':
        return `${actor} matched ${count} projects`
    }
  }

  switch (eventType) {
    case 'project_posted':
      return `${actor} published a project`
    case 'post_created':
      return `${actor} posted an update`
    case 'project_liked':
      return `${actor} liked a project`
    case 'project_commented':
    case 'post_commented':
      return `${actor} commented`
    case 'followed':
      return `${actor} followed a builder`
    case 'contributor_matched':
      return `${actor} matched with a project`
  }
}

export function getHomeFeedTimeCopy(item: HomeFeedItem) {
  const count = item.eventCount ?? 1
  const latestEventAt = item.latestEventAt ?? item.createdAt
  const firstEventAt = item.firstEventAt ?? latestEventAt
  const eventType = item.groupKind ?? item.eventType

  if (count <= 1) {
    return relativeTime(latestEventAt)
  }

  if (eventType === 'project_commented' || eventType === 'post_commented') {
    const spanHours = Math.max(
      1,
      Math.round((latestEventAt - firstEventAt) / (1000 * 60 * 60)),
    )

    if (spanHours < 24) {
      return `${count} ${pluralize(count, 'comment')} in ${spanHours}h`
    }
  }

  return `${count} ${pluralize(count, actionNoun(eventType))} ${dayCopy(
    latestEventAt,
  )}`
}
