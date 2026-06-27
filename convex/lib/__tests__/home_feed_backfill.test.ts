import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import { buildHomeFeedBackfillTarget } from '../../homeBackfill'

const projectId = 'project_1' as Id<'projects'>
const postId = 'post_1' as Id<'posts'>
const rootCommentId = 'comment_root' as Id<'comments'>
const childCommentId = 'comment_child' as Id<'comments'>

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

function createCtx(records: Record<string, unknown>) {
  return {
    db: {
      get: async (id: string) => records[id] ?? null,
    },
  } as any
}

function createComment(args: {
  id: Id<'comments'>
  parentId: Id<'comments'> | null
}) {
  return {
    _creationTime: Date.now(),
    _id: args.id,
    authorId: 'user_actor' as Id<'users'>,
    authorSnapshot: {
      avatarUrl: '',
      cityId: null,
      cityName: null,
      displayName: 'Avi',
    },
    content: 'This needs a deep link',
    createdAt: Date.now(),
    isDeleted: false,
    likesCount: 0,
    parentId: args.parentId,
    replyCount: 0,
    targetId: postId,
    targetSnapshot: {
      projectFullName: 'avi/test',
      projectOwner: 'avi',
      projectRepo: 'test',
      targetLabel: 'avi/test post',
      updateTitle: null,
    },
    targetType: 'post',
  }
}

describe('home feed backfill helpers', () => {
  it('rebuilds legacy comment targets with deep-link navigation metadata', async () => {
    const target = await buildHomeFeedBackfillTarget(
      createCtx({
        [childCommentId]: createComment({
          id: childCommentId,
          parentId: rootCommentId,
        }),
        [rootCommentId]: createComment({
          id: rootCommentId,
          parentId: null,
        }),
      }),
      {
        _creationTime: Date.now(),
        _id: 'event_1' as Id<'activity_events'>,
        actorId: 'user_actor' as Id<'users'>,
        actorSnapshot: {
          avatarUrl: '',
          cityId: null,
          cityName: null,
          displayName: 'Avi',
        },
        commentId: childCommentId,
        createdAt: Date.now(),
        eventType: 'post_commented',
        postId,
        postSnapshot: null,
        projectId,
        projectSnapshot,
        target: undefined,
      },
    )

    expect(target).toMatchObject({
      ancestorCommentIds: [rootCommentId],
      commentId: childCommentId,
      content: 'This needs a deep link',
      kind: 'comment',
      postId,
      rootCommentId,
      targetLabel: 'test',
      targetType: 'post',
    })
  })

  it('falls back to snapshot-only project targets when a legacy comment is gone', async () => {
    const target = await buildHomeFeedBackfillTarget(createCtx({}), {
      _creationTime: Date.now(),
      _id: 'event_1' as Id<'activity_events'>,
      actorId: 'user_actor' as Id<'users'>,
      actorSnapshot: {
        avatarUrl: '',
        cityId: null,
        cityName: null,
        displayName: 'Avi',
      },
      commentId: childCommentId,
      createdAt: Date.now(),
      eventType: 'project_commented',
      postId: null,
      postSnapshot: undefined,
      projectId,
      projectSnapshot,
      target: undefined,
    })

    expect(target).toMatchObject({
      kind: 'project',
      projectId,
      projectSnapshot,
    })
  })

  it('falls back to snapshot-only post targets when a legacy post comment is gone', async () => {
    const target = await buildHomeFeedBackfillTarget(createCtx({}), {
      _creationTime: Date.now(),
      _id: 'event_1' as Id<'activity_events'>,
      actorId: 'user_actor' as Id<'users'>,
      actorSnapshot: {
        avatarUrl: '',
        cityId: null,
        cityName: null,
        displayName: 'Avi',
      },
      commentId: childCommentId,
      createdAt: Date.now(),
      eventType: 'post_commented',
      postId,
      postSnapshot: null,
      projectId,
      projectSnapshot,
      target: undefined,
    })

    expect(target).toMatchObject({
      kind: 'post',
      postId,
      projectId,
    })
  })
})
