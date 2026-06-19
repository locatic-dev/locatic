import { describe, expect, it } from 'vitest'

import { getNotificationDestination } from '../navigation'
import type { Id } from '../../../../convex/_generated/dataModel'

describe('notification navigation helpers', () => {
  it('builds profile destinations', () => {
    expect(
      getNotificationDestination({
        kind: 'profile',
        username: 'octocat',
        projectFullName: null,
        conversationId: null,
        inboxTab: null,
        commentId: null,
      }),
    ).toEqual({
      params: { username: 'octocat' },
      search: { tab: 'projects' },
      to: '/u/$username',
    })
  })

  it('builds project destinations with comment deep links', () => {
    expect(
      getNotificationDestination({
        kind: 'project',
        username: null,
        projectFullName: 'octocat/hello-world',
        projectOwner: 'OctoCat',
        projectRepo: 'Hello-World',
        conversationId: null,
        inboxTab: null,
        commentId: 'comment_123' as Id<'comments'>,
      }),
    ).toEqual({
      params: { owner: 'OctoCat', repo: 'Hello-World' },
      search: { comment: 'comment_123' },
      to: '/project/$owner/$repo',
    })
  })

  it('falls back to fullName for legacy project targets', () => {
    expect(
      getNotificationDestination({
        kind: 'project',
        username: null,
        projectFullName: 'octocat/hello-world',
        conversationId: null,
        inboxTab: null,
        commentId: null,
      }),
    ).toEqual({
      params: { owner: 'octocat', repo: 'hello-world' },
      search: { comment: null },
      to: '/project/$owner/$repo',
    })
  })

  it('builds inbox destinations that preserve request tabs', () => {
    expect(
      getNotificationDestination({
        kind: 'conversation',
        username: null,
        projectFullName: null,
        conversationId: 'conversation_123' as Id<'conversations'>,
        inboxTab: 'requests',
        commentId: null,
      }),
    ).toEqual({
      search: {
        compose: null,
        conversation: 'conversation_123',
        tab: 'requests',
      },
      to: '/inbox',
    })
  })

  it('defaults missing inbox tabs to the main inbox for legacy notifications', () => {
    expect(
      getNotificationDestination({
        kind: 'conversation',
        username: null,
        projectFullName: null,
        conversationId: 'conversation_legacy' as Id<'conversations'>,
        commentId: null,
      }),
    ).toEqual({
      search: {
        compose: null,
        conversation: 'conversation_legacy',
        tab: 'inbox',
      },
      to: '/inbox',
    })
  })
})
