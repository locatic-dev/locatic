import { ConvexError, v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'

import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { enqueueActivityEventFanOut } from './lib/homeFeed'
import type { Doc } from './lib/types'
import type { Id } from './_generated/dataModel'
import {
  buildActorSnapshot,
  buildPostSnapshot,
  buildProjectSnapshot,
} from './lib/snapshots'
import {
  resolveLocationDisclosure,
  toSnapshotLocation,
  type LocationDisclosure,
  type SnapshotLocation,
} from './lib/visibility'
import {
  buildProjectNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'
import {
  resolveProjectOwnerLogin,
  resolveProjectSnapshotOwnerLogin,
} from './lib/project_route'
import {
  actorSnapshotValidator,
  commentTargetSnapshotValidator,
} from './lib/validators'
import { isPublicPostVisible } from './lib/posts'
import {
  getPubliclyInteractableProject,
  isCommentPubliclyInteractable,
} from './lib/project_access'
import { enforceRateLimit } from './lib/rate_limits'
import { assertMaxLength } from './lib/content_limits'
import { countMetric } from './metrics'
import {
  getCommentReactionCounts,
  getViewerReactionTypesByTargetId,
} from './lib/reactions'

const commentPageItemValidator = v.object({
  _id: v.id('comments'),
  _creationTime: v.number(),
  targetType: v.union(v.literal('project'), v.literal('post')),
  targetId: v.string(),
  authorId: v.id('users'),
  parentId: v.union(v.id('comments'), v.null()),
  content: v.string(),
  replyCount: v.number(),
  likesCount: v.number(),
  reactionCounts: v.optional(v.record(v.string(), v.number())),
  isDeleted: v.boolean(),
  // The stored snapshot plus the live city's slug (`loadAuthorLocations`).
  authorSnapshot: v.object({
    ...actorSnapshotValidator.fields,
    citySlug: v.optional(v.string()),
  }),
  targetSnapshot: commentTargetSnapshotValidator,
  createdAt: v.number(),
  viewerHasLiked: v.boolean(),
  viewerReactionTypes: v.array(v.string()),
  replies: v.array(v.any()),
  previewReplies: v.optional(v.array(v.any())),
})

const emptyCommentPage = {
  continueCursor: '',
  isDone: true,
  page: [],
  pageStatus: null,
  splitCursor: null,
}

async function getRequester(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (query) => query.eq('clerkId', identity.subject))
    .unique()
}

/** A live author location: the snapshot encoding plus the city's slug. */
type AuthorLocation = SnapshotLocation & { citySlug?: string }

const UNDISCLOSED_LOCATION: AuthorLocation = { cityId: null, cityName: null }

function toAuthorLocation(disclosure: LocationDisclosure): AuthorLocation {
  return disclosure.kind === 'city'
    ? { ...toSnapshotLocation(disclosure), citySlug: disclosure.citySlug }
    : toSnapshotLocation(disclosure)
}

/**
 * Current location of each distinct author under the visibility policy: one
 * user read per author and one city read per distinct city. A stored
 * `authorSnapshot` holds the location disclosed when the comment was
 * written, so it is never served as is.
 */
async function loadAuthorLocations(
  ctx: QueryCtx,
  authorIds: Array<Id<'users'>>,
): Promise<Map<string, AuthorLocation>> {
  const distinctIds = [
    ...new Map(
      authorIds.map((authorId) => [String(authorId), authorId]),
    ).values(),
  ]
  const authors = await Promise.all(
    distinctIds.map((authorId) => ctx.db.get(authorId)),
  )
  const cityIds = [
    ...new Map(
      authors.flatMap((author) =>
        author?.profile.cityId
          ? [[String(author.profile.cityId), author.profile.cityId] as const]
          : [],
      ),
    ).values(),
  ]
  const cities = await Promise.all(cityIds.map((cityId) => ctx.db.get(cityId)))
  const cityById = new Map(
    cities.flatMap((city) => (city ? [[String(city._id), city] as const] : [])),
  )

  return new Map(
    distinctIds.map((authorId, index) => {
      const author = authors[index]
      const city = author?.profile.cityId
        ? cityById.get(String(author.profile.cityId))
        : null
      return [
        String(authorId),
        author && !author.deletedAt && !author.deactivatedAt
          ? toAuthorLocation(resolveLocationDisclosure(author, city))
          : UNDISCLOSED_LOCATION,
      ]
    }),
  )
}

/** The comment with its author's current location (`loadAuthorLocations`). */
function withAuthorLocation<
  T extends Pick<Doc<'comments'>, 'authorId' | 'authorSnapshot'>,
>(
  comment: T,
  authorLocations: Map<string, AuthorLocation>,
): T & { authorSnapshot: AuthorLocation } {
  return {
    ...comment,
    authorSnapshot: {
      ...comment.authorSnapshot,
      ...(authorLocations.get(String(comment.authorId)) ??
        UNDISCLOSED_LOCATION),
    },
  }
}

function withViewerReactions(
  comments: Array<Doc<'comments'>>,
  viewerReactionTypesByTargetId: Map<string, string[]>,
) {
  return comments.map((comment) => {
    const viewerReactionTypes =
      viewerReactionTypesByTargetId.get(String(comment._id)) ?? []

    return {
      ...comment,
      reactionCounts: getCommentReactionCounts(comment),
      viewerHasLiked: viewerReactionTypes.includes('like'),
      viewerReactionTypes,
      replies: [],
    }
  })
}

async function buildCommentNavigationTarget(
  ctx: MutationCtx,
  commentId: Doc<'comments'>['_id'],
  parentId: Doc<'comments'>['parentId'],
) {
  const ancestorCommentIds: Array<Doc<'comments'>['_id']> = []
  let rootCommentId = commentId
  let currentParentId = parentId
  const seenParentIds = new Set<string>()

  while (currentParentId && seenParentIds.size < 20) {
    const parentKey = String(currentParentId)
    if (seenParentIds.has(parentKey)) {
      break
    }

    seenParentIds.add(parentKey)
    const parent = await ctx.db.get(currentParentId)
    if (!parent) {
      break
    }

    ancestorCommentIds.unshift(currentParentId)
    rootCommentId = currentParentId
    currentParentId = parent.parentId
  }

  return {
    ancestorCommentIds,
    rootCommentId,
  }
}

async function addPreviewReplies(
  ctx: QueryCtx,
  requester: Doc<'users'> | null,
  comments: Array<Doc<'comments'>>,
) {
  const previewRepliesByParent = await Promise.all(
    comments.map(async (comment) => {
      if (comment.replyCount === 0) {
        return [] as Array<Doc<'comments'>>
      }

      return await ctx.db
        .query('comments')
        .withIndex('by_target_type_parent_created', (query) =>
          query
            .eq('targetType', comment.targetType)
            .eq('targetId', comment.targetId)
            .eq('parentId', comment._id),
        )
        .order('asc')
        .take(2)
    }),
  )
  const allPreviewReplies = previewRepliesByParent.flat()
  const viewerReactionTypesByTargetId = await getViewerReactionTypesByTargetId(
    ctx,
    requester,
    {
      targetIds: allPreviewReplies.map((reply) => String(reply._id)),
      targetType: 'comment',
    },
  )

  return previewRepliesByParent.map((replies) =>
    withViewerReactions(replies, viewerReactionTypesByTargetId),
  )
}

function buildCommentTargetSnapshot(args: {
  project: Doc<'projects'> | null
  post: Doc<'posts'> | null
}) {
  const projectFullName =
    args.project?.github.fullName ?? args.post?.projectSnapshot.fullName
  if (!projectFullName) {
    throw new ConvexError('Comment target snapshot could not be created')
  }

  const projectOwner = args.project
    ? resolveProjectOwnerLogin(args.project)
    : args.post
      ? resolveProjectSnapshotOwnerLogin(args.post.projectSnapshot)
      : null
  const projectRepo =
    args.project?.github.name ?? args.post?.projectSnapshot.name
  if (!projectOwner || !projectRepo) {
    throw new ConvexError('Comment target snapshot is incomplete')
  }

  const targetLabel = args.post ? `${projectFullName} post` : projectFullName

  return {
    projectFullName,
    projectOwner,
    projectRepo,
    targetLabel,
    updateTitle: null,
  }
}

export const listRootsByTarget = query({
  args: {
    targetType: v.union(v.literal('project'), v.literal('post')),
    targetId: v.string(),
    sort: v.union(v.literal('newest'), v.literal('top')),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commentPageItemValidator),
  handler: async (ctx, args) => {
    const requester = await getRequester(ctx)
    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      if (
        !projectId ||
        !(await getPubliclyInteractableProject(ctx, projectId))
      ) {
        return emptyCommentPage
      }
    }

    if (args.targetType === 'post') {
      const postId = ctx.db.normalizeId('posts', args.targetId)
      const post = postId ? await ctx.db.get(postId) : null
      if (
        !post ||
        post.deletedAt !== null ||
        !(await isPublicPostVisible(ctx, post))
      ) {
        return emptyCommentPage
      }
    }

    const page =
      args.sort === 'top'
        ? await ctx.db
            .query('comments')
            .withIndex('by_target_type_parent_likes', (query) =>
              query
                .eq('targetType', args.targetType)
                .eq('targetId', args.targetId)
                .eq('parentId', null),
            )
            .order('desc')
            .paginate(args.paginationOpts)
        : await ctx.db
            .query('comments')
            .withIndex('by_target_type_parent_created', (query) =>
              query
                .eq('targetType', args.targetType)
                .eq('targetId', args.targetId)
                .eq('parentId', null),
            )
            .order('desc')
            .paginate(args.paginationOpts)
    const viewerReactionTypesByTargetId =
      await getViewerReactionTypesByTargetId(ctx, requester, {
        targetIds: page.page.map((comment) => String(comment._id)),
        targetType: 'comment',
      })
    const previewReplies = await addPreviewReplies(ctx, requester, page.page)
    const authorLocations = await loadAuthorLocations(ctx, [
      ...page.page.map((comment) => comment.authorId),
      ...previewReplies.flat().map((reply) => reply.authorId),
    ])

    return {
      ...page,
      page: withViewerReactions(page.page, viewerReactionTypesByTargetId).map(
        (comment, index) => ({
          ...withAuthorLocation(comment, authorLocations),
          previewReplies: (previewReplies[index] ?? []).map((reply) =>
            withAuthorLocation(reply, authorLocations),
          ),
        }),
      ),
    }
  },
})

export const listReplies = query({
  args: {
    parentId: v.id('comments'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commentPageItemValidator),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId)
    if (!parent || !(await isCommentPubliclyInteractable(ctx, parent))) {
      throw new ConvexError('Comment not found')
    }

    const requester = await getRequester(ctx)
    const page = await ctx.db
      .query('comments')
      .withIndex('by_target_type_parent_created', (query) =>
        query
          .eq('targetType', parent.targetType)
          .eq('targetId', parent.targetId)
          .eq('parentId', parent._id),
      )
      .order('asc')
      .paginate(args.paginationOpts)
    const viewerReactionTypesByTargetId =
      await getViewerReactionTypesByTargetId(ctx, requester, {
        targetIds: page.page.map((comment) => String(comment._id)),
        targetType: 'comment',
      })
    const authorLocations = await loadAuthorLocations(
      ctx,
      page.page.map((comment) => comment.authorId),
    )

    return {
      ...page,
      page: withViewerReactions(page.page, viewerReactionTypesByTargetId).map(
        (comment) => withAuthorLocation(comment, authorLocations),
      ),
    }
  },
})

export const create = mutation({
  args: {
    targetType: v.union(v.literal('project'), v.literal('post')),
    targetId: v.string(),
    parentId: v.union(v.id('comments'), v.null()),
    content: v.string(),
  },
  returns: v.union(commentPageItemValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    if (!args.content.trim()) {
      throw new ConvexError('Comment cannot be empty')
    }
    assertMaxLength('comment', args.content)
    await enforceRateLimit(ctx, 'commentCreate', String(viewer._id))
    const actorSnapshot = await buildActorSnapshot(ctx.db, viewer)
    let projectTarget: Doc<'projects'> | null = null
    let postTarget: Doc<'posts'> | null = null

    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      projectTarget = projectId
        ? await getPubliclyInteractableProject(ctx, projectId)
        : null
    }

    if (args.targetType === 'post') {
      const postId = ctx.db.normalizeId('posts', args.targetId)
      postTarget = postId ? await ctx.db.get(postId) : null
      if (
        !postTarget ||
        postTarget.deletedAt !== null ||
        !(await isPublicPostVisible(ctx, postTarget))
      ) {
        postTarget = null
      }
    }

    if (!projectTarget && !postTarget) {
      throw new ConvexError('Comment target not found')
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (
        !parent ||
        parent.targetType !== args.targetType ||
        parent.targetId !== args.targetId ||
        !(await isCommentPubliclyInteractable(ctx, parent))
      ) {
        throw new ConvexError('Reply parent does not match this target')
      }

      await ctx.db.patch(parent._id, {
        replyCount: parent.replyCount + 1,
      })
    }

    const commentId = await ctx.db.insert('comments', {
      targetType: args.targetType,
      targetId: args.targetId,
      authorId: viewer._id,
      parentId: args.parentId,
      content: args.content,
      replyCount: 0,
      likesCount: 0,
      reactionCounts: {},
      isDeleted: false,
      authorSnapshot: actorSnapshot,
      targetSnapshot: buildCommentTargetSnapshot({
        project: projectTarget,
        post: postTarget,
      }),
      createdAt: Date.now(),
    })
    const commentNavigationTarget = await buildCommentNavigationTarget(
      ctx,
      commentId,
      args.parentId,
    )

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        commentsCount: viewer.stats.commentsCount + 1,
      },
      updatedAt: Date.now(),
    })

    if (args.targetType === 'project') {
      const project = projectTarget
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            commentsCount: project.locatic.commentsCount + 1,
          },
          updatedAt: Date.now(),
        })

        const owner = await ctx.db.get(project.ownerId)
        if (owner) {
          await createNotificationIfEnabled(ctx, {
            recipient: owner,
            actor: viewer,
            type: 'project_commented',
            projectId: project._id,
            commentId,
            projectName: project.github.name,
            target: buildProjectNotificationTarget(
              {
                fullName: project.github.fullName,
                owner: resolveProjectOwnerLogin(project),
                repo: project.github.name,
              },
              {
                commentId,
              },
            ),
          })
        }

        const eventId = await ctx.db.insert('activity_events', {
          actorId: viewer._id,
          eventType: 'project_commented',
          projectId: project._id,
          commentId,
          actorSnapshot,
          projectSnapshot: buildProjectSnapshot(project),
          target: {
            kind: 'comment',
            projectId: project._id,
            postId: null,
            commentId,
            ...commentNavigationTarget,
            targetType: 'project',
            content: args.content.trim(),
            targetLabel: project.github.fullName,
            projectSnapshot: buildProjectSnapshot(project),
          },
          createdAt: Date.now(),
        })

        await enqueueActivityEventFanOut(ctx, eventId)
      }
    }

    if (args.targetType === 'post') {
      const post = postTarget
      if (post) {
        await ctx.db.patch(post._id, {
          commentsCount: post.commentsCount + 1,
          updatedAt: Date.now(),
        })

        const owner = await ctx.db.get(post.ownerId)
        if (owner) {
          await createNotificationIfEnabled(ctx, {
            recipient: owner,
            actor: viewer,
            type: 'post_commented',
            projectId: post.projectId,
            postId: post._id,
            commentId,
            projectName: post.projectSnapshot.name,
            target: buildProjectNotificationTarget(
              {
                fullName: post.projectSnapshot.fullName,
                owner: resolveProjectSnapshotOwnerLogin(post.projectSnapshot),
                repo: post.projectSnapshot.name,
              },
              {
                commentId,
              },
            ),
          })
        }

        const project = await ctx.db.get(post.projectId)
        if (project) {
          const eventId = await ctx.db.insert('activity_events', {
            actorId: viewer._id,
            eventType: 'post_commented',
            projectId: project._id,
            postId: post._id,
            commentId,
            actorSnapshot,
            projectSnapshot: buildProjectSnapshot(project),
            postSnapshot: buildPostSnapshot(post),
            target: {
              kind: 'comment',
              projectId: project._id,
              postId: post._id,
              commentId,
              ...commentNavigationTarget,
              targetType: 'post',
              content: args.content.trim(),
              targetLabel: post.projectSnapshot.name,
              projectSnapshot: buildProjectSnapshot(project),
              postSnapshot: buildPostSnapshot(post),
            },
            createdAt: Date.now(),
          })

          await enqueueActivityEventFanOut(ctx, eventId)
        }
      }
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (parent) {
        const parentAuthor = await ctx.db.get(parent.authorId)
        if (parentAuthor) {
          const projectRouteTarget = projectTarget
            ? {
                fullName: projectTarget.github.fullName,
                owner: resolveProjectOwnerLogin(projectTarget),
                repo: projectTarget.github.name,
              }
            : postTarget
              ? {
                  fullName: postTarget.projectSnapshot.fullName,
                  owner: resolveProjectSnapshotOwnerLogin(
                    postTarget.projectSnapshot,
                  ),
                  repo: postTarget.projectSnapshot.name,
                }
              : null
          await createNotificationIfEnabled(ctx, {
            recipient: parentAuthor,
            actor: viewer,
            type: 'comment_replied',
            projectId: projectTarget?._id ?? postTarget?.projectId ?? null,
            postId: postTarget?._id ?? null,
            commentId,
            target: projectRouteTarget
              ? buildProjectNotificationTarget(projectRouteTarget, {
                  commentId,
                })
              : null,
          })
        }
      }
    }

    await countMetric(ctx, 'comment')
    const comment = await ctx.db.get(commentId)
    return comment
      ? {
          ...comment,
          reactionCounts: getCommentReactionCounts(comment),
          replies: [],
          viewerHasLiked: false,
          viewerReactionTypes: [],
        }
      : null
  },
})

export const remove = mutation({
  args: {
    commentId: v.id('comments'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const comment = await ctx.db.get(args.commentId)
    if (!comment || comment.authorId !== viewer._id || comment.isDeleted) {
      throw new ConvexError('Comment not found')
    }

    if (comment.parentId) {
      const parent = await ctx.db.get(comment.parentId)
      if (parent) {
        await ctx.db.patch(parent._id, {
          replyCount: Math.max(0, parent.replyCount - 1),
        })
      }
    }

    if (comment.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', comment.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            commentsCount: Math.max(0, project.locatic.commentsCount - 1),
          },
          updatedAt: Date.now(),
        })
      }
    } else {
      const postId = ctx.db.normalizeId('posts', comment.targetId)
      const post = postId ? await ctx.db.get(postId) : null
      if (post) {
        await ctx.db.patch(post._id, {
          commentsCount: Math.max(0, post.commentsCount - 1),
          updatedAt: Date.now(),
        })
      }
    }

    await ctx.db.patch(comment._id, {
      content: '[deleted]',
      isDeleted: true,
    })

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        commentsCount: Math.max(0, viewer.stats.commentsCount - 1),
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const report = mutation({
  args: {
    commentId: v.id('comments'),
    reason: v.union(
      v.literal('spam'),
      v.literal('abuse'),
      v.literal('harassment'),
      v.literal('other'),
    ),
    details: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const details = args.details?.trim() || null
    assertMaxLength('reportDetails', details)
    await enforceRateLimit(ctx, 'contentReport', String(viewer._id))
    return await ctx.db.insert('reports', {
      reporterId: viewer._id,
      targetType: 'comment',
      targetId: args.commentId,
      reason: args.reason,
      details,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
