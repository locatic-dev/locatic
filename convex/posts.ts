import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { ConvexError, v } from 'convex/values'

import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from './_generated/server'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import { resolveProjectOwnerLogin } from './lib/project_route'
import type { Doc, Id } from './_generated/dataModel'
import {
  buildActorSnapshot,
  buildPostSnapshot,
  buildProjectSnapshot,
} from './lib/snapshots'
import { getProjectTopics } from './lib/topics'
import {
  buildPostSearchText,
  filterVisiblePosts,
  normalizePostSearchQuery,
  withCurrentProjectPostFields,
} from './lib/posts'

const postPageItemValidator = v.object({
  _id: v.id('posts'),
  _creationTime: v.number(),
  projectId: v.id('projects'),
  ownerId: v.id('users'),
  actorId: v.id('users'),
  authorRole: v.union(
    v.literal('owner'),
    v.literal('collaborator'),
    v.literal('contributor'),
  ),
  body: v.string(),
  searchText: v.optional(v.string()),
  reactionCounts: v.record(v.string(), v.number()),
  commentsCount: v.number(),
  projectCityId: v.union(v.id('cities'), v.null()),
  projectTopics: v.array(v.string()),
  actorSnapshot: v.object({
    displayName: v.string(),
    avatarUrl: v.string(),
    cityId: v.union(v.id('cities'), v.null()),
    cityName: v.union(v.string(), v.null()),
  }),
  projectSnapshot: v.object({
    name: v.string(),
    fullName: v.string(),
    ownerLogin: v.string(),
    primaryLanguage: v.union(v.string(), v.null()),
    languages: v.array(
      v.object({
        name: v.string(),
        bytes: v.number(),
      }),
    ),
  }),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  viewerHasLiked: v.boolean(),
})

const emptyPostPage = {
  continueCursor: '',
  isDone: true,
  page: [],
  pageStatus: null,
  splitCursor: null,
}

async function getViewerLikeTargetIds(
  ctx: QueryCtx,
  viewer: Doc<'users'> | null,
  posts: Array<Doc<'posts'>>,
) {
  if (!viewer || posts.length === 0) {
    return new Set<string>()
  }

  const reactions = await Promise.all(
    posts.map((post) =>
      ctx.db
        .query('reactions')
        .withIndex('by_user_target_type_id_reaction', (query) =>
          query
            .eq('userId', viewer._id)
            .eq('targetType', 'post')
            .eq('targetId', String(post._id))
            .eq('reactionType', 'like'),
        )
        .unique(),
    ),
  )

  return new Set(
    reactions
      .filter((reaction): reaction is Doc<'reactions'> => Boolean(reaction))
      .map((reaction) => reaction.targetId),
  )
}

function withViewerPostLikes(
  posts: Array<Doc<'posts'>>,
  viewerLikeTargetIds: Set<string>,
) {
  return posts.map((post) => ({
    ...post,
    viewerHasLiked: viewerLikeTargetIds.has(String(post._id)),
  }))
}

export const listByProject = query({
  args: {
    projectId: v.id('projects'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(postPageItemValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project?.locatic.isVisible) {
      return emptyPostPage
    }

    const owner = await ctx.db.get(project.ownerId)
    if (!owner || owner.deletedAt !== null || owner.deactivatedAt !== null) {
      return emptyPostPage
    }

    const page = await ctx.db
      .query('posts')
      .withIndex('by_project_deleted_created', (query) =>
        query.eq('projectId', args.projectId).eq('deletedAt', null),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    const visiblePage = await filterVisiblePosts(ctx, page.page)
    const viewerLikeTargetIds = await getViewerLikeTargetIds(
      ctx,
      viewer,
      visiblePage,
    )

    return {
      ...page,
      page: withViewerPostLikes(visiblePage, viewerLikeTargetIds),
    }
  },
})

export const search = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
  },
  returns: v.array(postPageItemValidator),
  handler: async (ctx, args) => {
    const normalizedQ = normalizePostSearchQuery(args.q)
    if (!normalizedQ) {
      return []
    }

    const limit = Math.min(args.limit ?? 8, 20)
    const cityIds = new Set((args.cityIds ?? []).map(String))
    const viewer = await getViewerFromAuth(ctx)
    const cityIdValues = [...cityIds].flatMap((cityId) => {
      const normalizedCityId = ctx.db.normalizeId('cities', cityId)
      return normalizedCityId ? [normalizedCityId] : []
    })
    const posts =
      cityIdValues.length > 0
        ? (
            await Promise.all(
              cityIdValues.map((cityId) =>
                ctx.db
                  .query('posts')
                  .withSearchIndex('search_text', (query) =>
                    query
                      .search('searchText', normalizedQ)
                      .eq('deletedAt', null)
                      .eq('projectCityId', cityId),
                  )
                  .take(limit),
              ),
            )
          ).flat()
        : await ctx.db
            .query('posts')
            .withSearchIndex('search_text', (query) =>
              query.search('searchText', normalizedQ).eq('deletedAt', null),
            )
            .take(limit)
    const filtered = (await filterVisiblePosts(ctx, posts)).slice(0, limit)
    const viewerLikeTargetIds = await getViewerLikeTargetIds(
      ctx,
      viewer,
      filtered,
    )

    return withViewerPostLikes(filtered, viewerLikeTargetIds)
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    body: v.string(),
  },
  returns: v.union(postPageItemValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const project = await ctx.db.get(args.projectId)
    const body = args.body.trim()
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }

    if (body.length < 1) {
      throw new ConvexError('Post body is required')
    }

    const now = Date.now()
    const actorSnapshot = await buildActorSnapshot(ctx.db, viewer)
    const projectTopics = getProjectTopics(project)
    const postId = await ctx.db.insert('posts', {
      projectId: project._id,
      ownerId: project.ownerId,
      actorId: viewer._id,
      authorRole: 'owner',
      body,
      searchText: buildPostSearchText({
        body,
        projectFullName: project.github.fullName,
        topics: projectTopics,
      }),
      reactionCounts: {},
      commentsCount: 0,
      projectCityId: project.exploreOwner.cityId,
      projectTopics,
      actorSnapshot,
      projectSnapshot: {
        name: project.github.name,
        fullName: project.github.fullName,
        ownerLogin: resolveProjectOwnerLogin(project),
        primaryLanguage: project.github.primaryLanguage,
        languages: project.github.languages,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        postsCount: (project.locatic.postsCount ?? 0) + 1,
      },
      updatedAt: now,
    })

    const post = await ctx.db.get(postId)
    if (!post) {
      return null
    }

    const eventId = await ctx.db.insert('activity_events', {
      actorId: viewer._id,
      eventType: 'post_created',
      projectId: project._id,
      postId,
      commentId: null,
      actorSnapshot,
      projectSnapshot: buildProjectSnapshot(project),
      postSnapshot: buildPostSnapshot(post),
      createdAt: now,
    })

    const event = await ctx.db.get(eventId)
    if (event) {
      await fanOutActivityEventToFollowers(ctx, event)
    }

    return {
      ...post,
      viewerHasLiked: false,
    }
  },
})

export const update = mutation({
  args: {
    postId: v.id('posts'),
    body: v.string(),
  },
  returns: v.union(postPageItemValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const post = await ctx.db.get(args.postId)
    const body = args.body.trim()
    if (!post || post.ownerId !== viewer._id || post.deletedAt !== null) {
      throw new ConvexError('Post not found')
    }

    if (body.length < 1) {
      throw new ConvexError('Post body is required')
    }

    await ctx.db.patch(post._id, {
      body,
      searchText: buildPostSearchText({
        body,
        projectFullName: post.projectSnapshot.fullName,
        topics: post.projectTopics,
      }),
      updatedAt: Date.now(),
    })

    const updatedPost = await ctx.db.get(post._id)
    if (!updatedPost) {
      return null
    }

    const visiblePost = await withCurrentProjectPostFields(ctx, updatedPost)
    return visiblePost
      ? {
          ...visiblePost,
          viewerHasLiked: false,
        }
      : null
  },
})

export const remove = mutation({
  args: {
    postId: v.id('posts'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const post = await ctx.db.get(args.postId)
    if (!post || post.ownerId !== viewer._id || post.deletedAt !== null) {
      throw new ConvexError('Post not found')
    }

    const project = await ctx.db.get(post.projectId)
    const now = Date.now()
    await ctx.db.patch(post._id, {
      deletedAt: now,
      updatedAt: now,
    })

    if (project) {
      await ctx.db.patch(project._id, {
        locatic: {
          ...project.locatic,
          postsCount: Math.max(0, (project.locatic.postsCount ?? 0) - 1),
        },
        updatedAt: now,
      })
    }

    return null
  },
})

export const backfillSearchText = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500)
    const posts = await ctx.db
      .query('posts')
      .withIndex('by_deleted_created', (query) => query.eq('deletedAt', null))
      .take(limit)
    let patched = 0

    for (const post of posts) {
      const project = await ctx.db.get(post.projectId)
      const topics = project ? getProjectTopics(project) : post.projectTopics
      const projectFullName =
        project?.github.fullName ?? post.projectSnapshot.fullName
      const searchText = buildPostSearchText({
        body: post.body,
        projectFullName,
        topics,
      })

      if (
        post.searchText === searchText &&
        post.projectTopics.join('\0') === topics.join('\0')
      ) {
        continue
      }

      await ctx.db.patch(post._id, {
        projectTopics: topics,
        searchText,
      })
      patched += 1
    }

    return patched
  },
})

export type ProjectPostId = Id<'posts'>
