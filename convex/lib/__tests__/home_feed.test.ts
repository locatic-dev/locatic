import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import {
  appendHomeFeedPreviewTarget,
  buildHomeFeedGroupKey,
  getHomeFeedLegacyTarget,
  type HomeFeedTarget,
} from '../homeFeed'

const userId = 'user_viewer' as Id<'users'>
const actorId = 'user_actor' as Id<'users'>
const projectId = 'project_1' as Id<'projects'>
const secondProjectId = 'project_2' as Id<'projects'>
const postId = 'post_1' as Id<'posts'>
const commentId = 'comment_1' as Id<'comments'>

const projectSnapshot = {
  cityId: null,
  cityName: null,
  commentsCount: 0,
  description: 'Test project',
  fullName: 'avi/test',
  languages: [],
  likesCount: 0,
  name: 'test',
  ownerAvatarUrl: '',
  ownerDisplayName: 'Avi',
  ownerId: 'user_owner' as Id<'users'>,
  ownerLogin: 'avi',
  primaryLanguage: 'TypeScript',
  stargazersCount: 0,
}

function projectTarget(id = projectId): HomeFeedTarget {
  return {
    kind: 'project',
    projectId: id,
    projectSnapshot: {
      ...projectSnapshot,
      fullName: id === projectId ? 'avi/test' : 'avi/second',
      name: id === projectId ? 'test' : 'second',
    },
  }
}

describe('home feed grouping helpers', () => {
  it('groups compatible same-actor likes across project targets for the same UTC day', () => {
    const firstKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId,
        createdAt: Date.parse('2026-06-21T10:00:00.000Z'),
        eventType: 'project_liked',
        postId: null,
      },
      projectTarget(projectId),
    )
    const secondKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId,
        createdAt: Date.parse('2026-06-21T22:00:00.000Z'),
        eventType: 'project_liked',
        postId: null,
      },
      projectTarget(secondProjectId),
    )

    expect(secondKey).toBe(firstKey)
  })

  it('does not group comments across different project targets', () => {
    const firstKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId,
        createdAt: Date.parse('2026-06-21T10:00:00.000Z'),
        eventType: 'project_commented',
        postId: null,
      },
      projectTarget(projectId),
    )
    const secondKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId,
        createdAt: Date.parse('2026-06-21T11:00:00.000Z'),
        eventType: 'project_commented',
        postId: null,
      },
      projectTarget(secondProjectId),
    )

    expect(secondKey).not.toBe(firstKey)
  })

  it('separates different actors and UTC days', () => {
    const firstKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId,
        createdAt: Date.parse('2026-06-21T23:59:00.000Z'),
        eventType: 'followed',
        postId: null,
      },
      {
        kind: 'profile',
        profile: {
          avatarUrl: null,
          cityName: null,
          displayName: 'Mira',
          githubUsername: 'mira',
          userId: 'user_followed' as Id<'users'>,
        },
      },
    )
    const secondKey = buildHomeFeedGroupKey(
      userId,
      {
        actorId: 'user_other' as Id<'users'>,
        createdAt: Date.parse('2026-06-22T00:01:00.000Z'),
        eventType: 'followed',
        postId: null,
      },
      {
        kind: 'profile',
        profile: {
          avatarUrl: null,
          cityName: null,
          displayName: 'Nora',
          githubUsername: 'nora',
          userId: 'user_followed_2' as Id<'users'>,
        },
      },
    )

    expect(secondKey).not.toBe(firstKey)
  })

  it('dedupes preview targets and caps the expanded preview list', () => {
    const current = Array.from({ length: 10 }, (_, index) =>
      projectTarget(`project_${index}` as Id<'projects'>),
    )

    expect(
      appendHomeFeedPreviewTarget(current, current[0] ?? projectTarget()),
    ).toHaveLength(10)
    expect(
      appendHomeFeedPreviewTarget(
        current,
        projectTarget('project_new' as Id<'projects'>),
      ),
    ).toHaveLength(10)
  })

  it('builds a legacy comment target with comment navigation metadata left absent', () => {
    const target = getHomeFeedLegacyTarget({
      commentId,
      eventType: 'post_commented',
      postId,
      postSnapshot: null,
      projectId,
      projectSnapshot,
      target: undefined,
    })

    expect(target).toMatchObject({
      commentId,
      kind: 'comment',
      postId,
      targetType: 'post',
    })
  })
})
