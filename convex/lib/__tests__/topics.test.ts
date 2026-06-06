import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { getProjectTopics, normalizeProjectTopics } from '../topics'

describe('project topics', () => {
  it('normalizes topics into unique URL-safe tokens', () => {
    expect(
      normalizeProjectTopics([
        ' React Native ',
        'react-native',
        'AI/Agents',
        '---Convex---',
      ]),
    ).toEqual(['react-native', 'ai-agents', 'convex'])
  })

  it('rejects numeric-only topics', () => {
    expect(() => normalizeProjectTopics(['2026'])).toThrow(ConvexError)
  })

  it('prefers owner-edited locatic topics over GitHub topics', () => {
    expect(
      getProjectTopics({
        github: { topics: ['github-topic'] },
        locatic: { tags: ['owner topic'] },
      }),
    ).toEqual(['owner-topic'])
  })
})
