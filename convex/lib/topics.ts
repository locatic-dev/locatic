import { ConvexError } from 'convex/values'

const MAX_TOPIC_COUNT = 20
const MAX_TOPIC_LENGTH = 50

export function normalizeProjectTopic(rawTopic: string) {
  return rawTopic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function normalizeProjectTopics(rawTopics: string[]) {
  const topics = Array.from(
    new Set(rawTopics.map(normalizeProjectTopic).filter(Boolean)),
  )

  if (topics.length > MAX_TOPIC_COUNT) {
    throw new ConvexError(`Projects can have at most ${MAX_TOPIC_COUNT} topics`)
  }

  for (const topic of topics) {
    if (topic.length > MAX_TOPIC_LENGTH) {
      throw new ConvexError(
        `Topics must be ${MAX_TOPIC_LENGTH} characters or less`,
      )
    }

    if (/^\d+$/.test(topic)) {
      throw new ConvexError('Topics cannot contain only numbers')
    }
  }

  return topics
}

export function getProjectTopics(project: {
  github: { topics: string[] }
  locatic: { tags?: string[] }
}) {
  return project.locatic.tags?.length
    ? normalizeProjectTopics(project.locatic.tags)
    : normalizeProjectTopics(project.github.topics)
}
