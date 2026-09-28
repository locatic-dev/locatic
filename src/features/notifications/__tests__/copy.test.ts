import { describe, expect, it } from 'vitest'

import { getNotificationAction } from '../copy'

describe('notification copy', () => {
  it.each([
    ['project_liked', 'liked your project "locatic"'],
    ['post_reacted', 'reacted to your post on "locatic"'],
    ['project_commented', 'commented on your project "locatic"'],
    ['post_commented', 'commented on your post on "locatic"'],
    ['comment_replied', 'replied to your comment'],
    ['followed', 'started following you'],
    ['dm_received', 'sent you a message'],
    ['contributor_recognized', 'recognized you as a contributor to "locatic"'],
  ] as const)('gives %s a real verb', (type, expected) => {
    expect(getNotificationAction({ type, projectName: 'locatic' })).toBe(
      expected,
    )
  })

  it('reads naturally without a project name', () => {
    expect(
      getNotificationAction({ type: 'post_reacted', projectName: null }),
    ).toBe('reacted to your post')
    expect(
      getNotificationAction({ type: 'project_liked', projectName: ' ' }),
    ).toBe('liked your project')
  })
})
