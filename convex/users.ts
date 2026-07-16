import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { Doc } from './lib/types'
import {
  getOrCreateViewer,
  getViewerAuthState,
  getViewerByClerkId,
  getViewerFromAuth,
  getViewerOrThrow,
  requireIdentity,
} from './lib/auth'
import { buildDiscoverabilitySearchText } from './lib/discoverability'
import { resolveProjectOwnerLogin } from './lib/project_route'
import {
  buildProjectCardPreview,
  resolvePublicCityLabel,
} from './lib/project_previews'
import { filterVisiblePosts, getVisiblePostProject } from './lib/posts'
import { isProjectPubliclyInteractable } from './lib/project_access'
import {
  getAccountDeletionWindow,
  shouldPurgeDeletedAccount,
} from './lib/account_deletion'
import { getExploreCityIdsAfterProfileCityChange } from './lib/explore'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
} from './lib/snapshots'
import { createDefaultViewerProfile } from './lib/viewer'
import { resolveStoredGithubId } from './lib/clerk'
import { assertGithubUsernameAvailable } from './lib/github_identity'
import {
  compactWebhookError,
  getWebhookProcessingDecision,
} from './lib/webhook_events'
import {
  getNextUserPostsCountBackfillCursor,
  shouldPatchUserPostsCount,
} from './lib/post_counts'
import { isContributionsVisibleOnPublicProfile } from './lib/privacy'
import {
  buildStatusValidator,
  cityReferenceValidator,
  cityVisibilityValidator,
  optionalStringValidator,
  optionalTimestampValidator,
  profileVisibilityValidator,
  socialLinksValidator,
  tabVisibilityValidator,
} from './lib/validators'
import {
  getCommentReactionCounts,
  getViewerReactionTypesByTargetId,
} from './lib/reactions'

const viewerBootstrapStatusValidator = v.union(
  v.literal('unauthenticated'),
  v.literal('missingViewer'),
  v.literal('ready'),
)

const serializedViewerValidator = v.object({
  _id: v.id('users'),
  email: v.string(),
  github: v.object({
    id: v.union(v.number(), v.null()),
    username: v.string(),
  }),
  profile: v.object({
    displayName: v.string(),
    fullName: optionalStringValidator,
    avatarUrl: v.string(),
    bio: v.string(),
    cityId: cityReferenceValidator,
    buildStatus: buildStatusValidator,
    primaryLanguages: v.array(v.string()),
    socialLinks: socialLinksValidator,
  }),
  stats: v.object({
    followersCount: v.number(),
    followingCount: v.number(),
    projectsCount: v.number(),
    postsCount: v.optional(v.number()),
    contributionsCount: v.number(),
    commentsCount: v.number(),
    likedCount: v.number(),
  }),
  exploreConfig: v.object({
    cityIds: v.array(v.id('cities')),
    stackPrefs: v.array(v.string()),
  }),
  privacy: v.object({
    profileVisibility: profileVisibilityValidator,
    followGraphVisibility: tabVisibilityValidator,
    commentHistoryVisibility: tabVisibilityValidator,
    likedProjectsVisibility: tabVisibilityValidator,
    contributionsVisibility: v.optional(tabVisibilityValidator),
    cityVisibility: cityVisibilityValidator,
    appearInPulse: v.boolean(),
  }),
  notificationPrefs: v.object({
    projectLikes: v.boolean(),
    updateLikes: v.boolean(),
    comments: v.boolean(),
    commentReplies: v.boolean(),
    newFollowers: v.boolean(),
    dms: v.boolean(),
    weeklyDigest: v.boolean(),
    contributorRecognized: v.boolean(),
  }),
  onboardingSelectedOwnedProjectIds: v.array(v.id('projects')),
  pinnedProfileProjectIds: v.array(v.id('projects')),
  unreadMessagesCount: v.number(),
  onboardingCompletedAt: optionalTimestampValidator,
  appearInExplore: v.boolean(),
  githubContributions: v.union(
    v.object({
      totalContributions: v.number(),
      weeks: v.array(
        v.object({
          days: v.array(
            v.object({
              date: v.string(),
              count: v.number(),
            }),
          ),
        }),
      ),
      syncedAt: v.number(),
    }),
    v.null(),
  ),
  deactivatedAt: optionalTimestampValidator,
  deletedAt: optionalTimestampValidator,
})

const profileCommentPreviewValidator = v.object({
  _id: v.id('comments'),
  targetType: v.union(v.literal('project'), v.literal('post')),
  targetId: v.string(),
  targetPostId: v.union(v.string(), v.null()),
  rootCommentId: v.string(),
  ancestorCommentIds: v.array(v.string()),
  content: v.string(),
  replyCount: v.number(),
  likesCount: v.number(),
  reactionCounts: v.record(v.string(), v.number()),
  viewerHasLiked: v.boolean(),
  viewerReactionTypes: v.array(v.string()),
  createdAt: v.number(),
  projectFullName: v.union(v.string(), v.null()),
  projectOwner: v.union(v.string(), v.null()),
  projectRepo: v.union(v.string(), v.null()),
  targetLabel: v.string(),
  targetAvailability: v.union(
    v.literal('available'),
    v.literal('hidden'),
    v.literal('deleted'),
  ),
})

const viewerBootstrapValidator = v.object({
  isAuthenticated: v.boolean(),
  needsOnboarding: v.boolean(),
  status: viewerBootstrapStatusValidator,
  viewer: v.union(serializedViewerValidator, v.null()),
})

const PROFILE_POSTS_LIMIT = 50
const MAX_USER_GITHUB_ID_BACKFILL_BATCH = 50

const profilePostPreviewValidator = v.object({
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
  viewerReactionTypes: v.array(v.string()),
})

const projectCardPreviewValidator = v.object({
  projectId: v.id('projects'),
  ownerUserId: v.id('users'),
  fullName: v.string(),
  owner: v.string(),
  repo: v.string(),
  description: v.union(v.string(), v.null()),
  primaryLanguage: v.union(v.string(), v.null()),
  languages: v.array(
    v.object({
      name: v.string(),
      bytes: v.number(),
    }),
  ),
  githubStars: v.number(),
  locaticLikes: v.number(),
  reactionCounts: v.record(v.string(), v.number()),
  commentsCount: v.number(),
  postsCount: v.number(),
  topics: v.array(v.string()),
  lastCommitAt: v.number(),
  updatedAt: v.number(),
  authorName: v.string(),
  authorHandle: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  cityLabel: v.union(v.string(), v.null()),
  cityVisibilityState: v.union(
    v.literal('exact_city'),
    v.literal('region_only'),
    v.literal('hidden'),
    v.literal('unset'),
  ),
})

const profileContributionPreviewValidator = v.object({
  project: projectCardPreviewValidator,
  commitCount: v.number(),
})

function serializeViewer(
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerFromAuth>>>,
) {
  return {
    _id: viewer._id,
    email: viewer.email,
    github: viewer.github,
    profile: viewer.profile,
    stats: viewer.stats,
    exploreConfig: viewer.exploreConfig,
    privacy: viewer.privacy,
    notificationPrefs: viewer.notificationPrefs,
    onboardingSelectedOwnedProjectIds: viewer.onboardingSelectedOwnedProjectIds,
    pinnedProfileProjectIds: viewer.pinnedProfileProjectIds,
    unreadMessagesCount: viewer.unreadMessagesCount,
    onboardingCompletedAt: viewer.onboardingCompletedAt,
    appearInExplore: viewer.appearInExplore,
    githubContributions: viewer.githubContributions ?? null,
    deactivatedAt: viewer.deactivatedAt ?? null,
    deletedAt: viewer.deletedAt ?? null,
  }
}

async function getViewerCityName(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerFromAuth>>>,
) {
  if (!viewer.profile.cityId) {
    return null
  }

  const city = await ctx.db.get(viewer.profile.cityId)
  return city?.displayName ?? null
}

async function syncOwnedProjectOwnerState(
  ctx: MutationCtx,
  user: Doc<'users'>,
) {
  const ownedProjects = await ctx.db
    .query('projects')
    .withIndex('by_owner', (query) => query.eq('ownerId', user._id))
    .collect()

  if (ownedProjects.length === 0) {
    return
  }

  const ownerSnapshot = await buildOwnerSnapshot(ctx.db, user)

  await Promise.all(
    ownedProjects.map((project) =>
      ctx.db.patch(project._id, {
        ownerSnapshot,
        exploreOwner: buildProjectExploreOwner(user, project.locatic.isVisible),
      }),
    ),
  )
}

async function requestAccountDeletion(ctx: MutationCtx, user: Doc<'users'>) {
  const now = Date.now()
  const { deletedAt, deactivatedAt, purgeAfter } = getAccountDeletionWindow(
    user,
    now,
  )

  await ctx.db.patch(user._id, {
    deletedAt,
    deactivatedAt,
    purgeAfter,
    appearInExplore: false,
    updatedAt: now,
  })

  await syncOwnedProjectOwnerState(ctx, {
    ...user,
    deletedAt,
    deactivatedAt,
    purgeAfter,
    appearInExplore: false,
  })

  await ctx.scheduler.runAfter(
    Math.max(0, purgeAfter - now),
    internal.users.purgeDeletedAccountIfDue,
    {
      userId: user._id,
    },
  )
}

async function mapFollowUserPreview(
  ctx: QueryCtx,
  userId: Doc<'users'>['_id'],
): Promise<{
  userId: Doc<'users'>['_id']
  githubUsername: string
  displayName: string
  avatarUrl: string | null
  cityName: string | null
} | null> {
  const user = await ctx.db.get(userId)
  if (!user || user.deletedAt || user.deactivatedAt) {
    return null
  }

  const city = user.profile.cityId
    ? await ctx.db.get(user.profile.cityId)
    : null

  return {
    userId: user._id,
    githubUsername: user.github.username,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityName: city?.displayName ?? null,
  }
}

async function listFollowPreviewPage(
  ctx: QueryCtx,
  args: {
    userId: Doc<'users'>['_id']
    kind: 'followers' | 'following'
    paginationOpts: {
      cursor: string | null
      numItems: number
      endCursor?: string | null
      maximumRowsRead?: number
      maximumBytesRead?: number
    }
  },
) {
  const followsPage =
    args.kind === 'followers'
      ? await ctx.db
          .query('follows')
          .withIndex('by_following', (query) =>
            query.eq('followingId', args.userId),
          )
          .order('desc')
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('follows')
          .withIndex('by_follower', (query) =>
            query.eq('followerId', args.userId),
          )
          .order('desc')
          .paginate(args.paginationOpts)

  const previews = await Promise.all(
    followsPage.page.map((follow) =>
      mapFollowUserPreview(
        ctx,
        args.kind === 'followers' ? follow.followerId : follow.followingId,
      ),
    ),
  )

  return {
    ...followsPage,
    page: previews.filter(Boolean) as Array<{
      userId: Doc<'users'>['_id']
      githubUsername: string
      displayName: string
      avatarUrl: string | null
      cityName: string | null
    }>,
  }
}

async function listContributedProjects(
  ctx: QueryCtx,
  userId: Doc<'users'>['_id'],
  audience: 'private' | 'public',
  limit = 24,
) {
  const itemLimit = Math.min(limit, 50)
  const projects: Array<{
    project: Awaited<ReturnType<typeof buildProjectCardPreview>>
    commitCount: number
  }> = []
  let cursor: string | null = null

  while (projects.length < itemLimit) {
    const page = await ctx.db
      .query('project_contributors')
      .withIndex('by_user_active_confirmed', (query) =>
        query.eq('userId', userId).eq('isActive', true),
      )
      .order('desc')
      .paginate({
        cursor,
        numItems: itemLimit - projects.length,
      })

    for (const row of page.page) {
      const project = await ctx.db.get(row.projectId)
      if (!project || !project.locatic.isVisible) {
        continue
      }

      projects.push({
        project: await buildProjectCardPreview(ctx.db, project, {
          audience,
        }),
        commitCount: row.commitCount,
      })
    }

    if (page.isDone || page.page.length === 0) {
      break
    }
    cursor = page.continueCursor
  }

  return projects
}

async function listFollowPreviewSlice(
  ctx: QueryCtx,
  args: {
    userId: Doc<'users'>['_id']
    kind: 'followers' | 'following'
    limit?: number
  },
) {
  const follows =
    args.kind === 'followers'
      ? await ctx.db
          .query('follows')
          .withIndex('by_following', (query) =>
            query.eq('followingId', args.userId),
          )
          .order('desc')
          .take(Math.min(args.limit ?? 12, 50))
      : await ctx.db
          .query('follows')
          .withIndex('by_follower', (query) =>
            query.eq('followerId', args.userId),
          )
          .order('desc')
          .take(Math.min(args.limit ?? 12, 50))

  const previews = await Promise.all(
    follows.map((follow) =>
      mapFollowUserPreview(
        ctx,
        args.kind === 'followers' ? follow.followerId : follow.followingId,
      ),
    ),
  )

  return previews.filter(Boolean) as Array<{
    userId: Doc<'users'>['_id']
    githubUsername: string
    displayName: string
    avatarUrl: string | null
    cityName: string | null
  }>
}

async function listPrivateProfileProjects(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerFromAuth>>>,
) {
  const pinnedProjectIds = new Set(viewer.pinnedProfileProjectIds.map(String))
  const rawProjects = await ctx.db
    .query('projects')
    .withIndex('by_owner_visible', (query) =>
      query.eq('ownerId', viewer._id).eq('locatic.isVisible', true),
    )
    .collect()

  const sortedProjects = [...rawProjects].sort((left, right) => {
    const leftPinned = pinnedProjectIds.has(String(left._id)) ? 1 : 0
    const rightPinned = pinnedProjectIds.has(String(right._id)) ? 1 : 0
    if (leftPinned !== rightPinned) {
      return rightPinned - leftPinned
    }
    return right.updatedAt - left.updatedAt
  })

  return await Promise.all(
    sortedProjects.map((project) =>
      buildProjectCardPreview(ctx.db, project, {
        audience: 'private',
        owner: viewer,
      }),
    ),
  )
}

async function listPublicProfileProjects(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
) {
  const pinnedProjectIds = new Set(viewer.pinnedProfileProjectIds.map(String))
  const rawProjects = await ctx.db
    .query('projects')
    .withIndex('by_owner_visible', (query) =>
      query.eq('ownerId', viewer._id).eq('locatic.isVisible', true),
    )
    .collect()

  const sortedProjects = [...rawProjects].sort((left, right) => {
    const leftPinned = pinnedProjectIds.has(String(left._id)) ? 1 : 0
    const rightPinned = pinnedProjectIds.has(String(right._id)) ? 1 : 0
    if (leftPinned !== rightPinned) {
      return rightPinned - leftPinned
    }
    return right.updatedAt - left.updatedAt
  })

  return await Promise.all(
    sortedProjects.map((project) =>
      buildProjectCardPreview(ctx.db, project, {
        audience: 'public',
        owner: viewer,
      }),
    ),
  )
}

async function buildProfileCommentPreview(
  ctx: QueryCtx,
  comment: Doc<'comments'>,
) {
  let projectFullName = comment.targetSnapshot.projectFullName
  let projectOwner = comment.targetSnapshot.projectOwner
  let projectRepo = comment.targetSnapshot.projectRepo
  let targetLabel = comment.targetSnapshot.targetLabel
  let targetAvailability: 'available' | 'hidden' | 'deleted' = 'deleted'
  let targetPostId: string | null = null
  const ancestorCommentIds: string[] = []
  let rootCommentId = String(comment._id)

  let parentId = comment.parentId
  const seenParentIds = new Set<string>()
  while (parentId && seenParentIds.size < 20) {
    const parentKey = String(parentId)
    if (seenParentIds.has(parentKey)) {
      break
    }

    seenParentIds.add(parentKey)
    const parent = await ctx.db.get(parentId)
    if (!parent) {
      break
    }

    ancestorCommentIds.unshift(parentKey)
    rootCommentId = parentKey
    parentId = parent.parentId
  }

  if (comment.targetType === 'project') {
    const projectId = ctx.db.normalizeId('projects', comment.targetId)
    const project = projectId ? await ctx.db.get(projectId) : null
    if (project) {
      projectFullName = project.github.fullName
      projectOwner = resolveProjectOwnerLogin(project)
      projectRepo = project.github.name
      targetLabel = project.github.fullName
      targetAvailability = (await isProjectPubliclyInteractable(ctx, project))
        ? 'available'
        : 'hidden'
    }
  } else {
    targetPostId = comment.targetId
    const postId = ctx.db.normalizeId('posts', comment.targetId)
    const post = postId ? await ctx.db.get(postId) : null
    if (post && post.deletedAt === null) {
      const project = await ctx.db.get(post.projectId)
      if (project) {
        projectFullName = project.github.fullName
        projectOwner = resolveProjectOwnerLogin(project)
        projectRepo = project.github.name
        targetLabel = `${project.github.fullName} post`
        targetAvailability = (await getVisiblePostProject(ctx, post))
          ? 'available'
          : 'hidden'
      } else {
        targetAvailability = 'hidden'
      }
    }
  }

  return {
    _id: comment._id,
    targetType: comment.targetType,
    targetId: comment.targetId,
    targetPostId,
    rootCommentId,
    ancestorCommentIds,
    content: comment.content,
    replyCount: comment.replyCount,
    likesCount: comment.likesCount,
    createdAt: comment.createdAt,
    projectFullName,
    projectOwner,
    projectRepo,
    targetLabel,
    targetAvailability,
  }
}

async function listPrivateProfileComments(ctx: QueryCtx, viewer: Doc<'users'>) {
  const comments = await ctx.db
    .query('comments')
    .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
    .collect()
  return await buildProfileCommentPreviews(ctx, comments, viewer)
}

async function listPublicProfileComments(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
  requester: Doc<'users'> | null,
) {
  if (viewer.privacy.commentHistoryVisibility !== 'public') {
    return []
  }

  const comments = await ctx.db
    .query('comments')
    .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
    .collect()

  return await buildProfileCommentPreviews(ctx, comments, requester)
}

async function buildProfileCommentPreviews(
  ctx: QueryCtx,
  comments: Array<Doc<'comments'>>,
  requester: Doc<'users'> | null,
) {
  const visibleComments = comments.filter((comment) => !comment.isDeleted)
  const viewerReactionTypesByTargetId = await getViewerReactionTypesByTargetId(
    ctx,
    requester,
    {
      targetIds: visibleComments.map((comment) => String(comment._id)),
      targetType: 'comment',
    },
  )
  const previews = await Promise.all(
    visibleComments.map((comment) => buildProfileCommentPreview(ctx, comment)),
  )

  return previews.map((preview, index) => {
    const comment = visibleComments[index]
    const viewerReactionTypes =
      viewerReactionTypesByTargetId.get(String(comment._id)) ?? []
    return {
      ...preview,
      reactionCounts: getCommentReactionCounts(comment),
      viewerHasLiked: viewerReactionTypes.includes('like'),
      viewerReactionTypes,
    }
  })
}

async function listPrivateLikedProjects(
  ctx: QueryCtx,
  userId: Doc<'users'>['_id'],
) {
  const likedReactions = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_type', (query) =>
      query
        .eq('userId', userId)
        .eq('targetType', 'project')
        .eq('reactionType', 'like'),
    )
    .collect()

  const likedProjects = await Promise.all(
    likedReactions.map(async (reaction) => {
      const projectId = ctx.db.normalizeId('projects', reaction.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null

      if (!project) {
        return null
      }

      return {
        reactionId: reaction._id,
        projectId,
        likedAt: reaction.createdAt,
        project: await buildProjectCardPreview(ctx.db, project, {
          audience: 'private',
        }),
      }
    }),
  )

  return likedProjects.filter(
    (
      likedProject,
    ): likedProject is {
      reactionId: Id<'reactions'>
      projectId: Id<'projects'>
      likedAt: number
      project: Awaited<ReturnType<typeof buildProjectCardPreview>>
    } =>
      Boolean(likedProject && likedProject.projectId && likedProject.project),
  )
}

async function listPublicLikedProjects(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
) {
  if (viewer.privacy.likedProjectsVisibility !== 'public') {
    return []
  }

  const reactions = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_type', (query) =>
      query
        .eq('userId', viewer._id)
        .eq('targetType', 'project')
        .eq('reactionType', 'like'),
    )
    .collect()

  const likedProjects = await Promise.all(
    reactions.map(async (reaction) => {
      const projectId = ctx.db.normalizeId('projects', reaction.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      if (!project || !project.locatic.isVisible) {
        return null
      }

      return {
        reactionId: reaction._id,
        projectId,
        likedAt: reaction.createdAt,
        project: await buildProjectCardPreview(ctx.db, project, {
          audience: 'public',
        }),
      }
    }),
  )

  return likedProjects.filter(
    (
      project,
    ): project is {
      reactionId: Id<'reactions'>
      projectId: Id<'projects'>
      likedAt: number
      project: Awaited<ReturnType<typeof buildProjectCardPreview>>
    } => Boolean(project),
  )
}

async function listProfilePosts(
  ctx: QueryCtx,
  args: {
    audience: 'private' | 'public'
    requester: Doc<'users'> | null
    userId: Doc<'users'>['_id']
  },
) {
  const posts = await ctx.db
    .query('posts')
    .withIndex('by_owner_deleted_created', (query) =>
      query.eq('ownerId', args.userId).eq('deletedAt', null),
    )
    .order('desc')
    .take(PROFILE_POSTS_LIMIT)
  const visiblePosts =
    args.audience === 'public' ? await filterVisiblePosts(ctx, posts) : posts
  const viewerReactionTypesByTargetId = await getViewerReactionTypesByTargetId(
    ctx,
    args.requester,
    {
      targetIds: visiblePosts.map((post) => String(post._id)),
      targetType: 'post',
    },
  )

  return visiblePosts.map((post) => {
    const viewerReactionTypes =
      viewerReactionTypesByTargetId.get(String(post._id)) ?? []

    return {
      ...post,
      viewerHasLiked: viewerReactionTypes.includes('like'),
      viewerReactionTypes,
    }
  })
}

function emptyFollowPreviewPage(cursor: string | null = null) {
  return {
    continueCursor: cursor ?? '',
    isDone: true,
    page: [] as Array<{
      userId: Doc<'users'>['_id']
      githubUsername: string
      displayName: string
      avatarUrl: string | null
      cityName: string | null
    }>,
    pageStatus: null,
    splitCursor: null,
  }
}

async function getAccessiblePublicProfileViewer(
  ctx: QueryCtx,
  username: string,
) {
  const requesterIdentity = await ctx.auth.getUserIdentity()
  const requester = requesterIdentity
    ? await getViewerByClerkId(ctx, requesterIdentity.subject)
    : null
  const viewer = await ctx.db
    .query('users')
    .withIndex('by_github_username', (query) =>
      query.eq('github.username', username),
    )
    .unique()

  if (!viewer || viewer.deletedAt || viewer.deactivatedAt) {
    return {
      requester,
      requesterIdentity,
      viewer: null,
    }
  }

  if (viewer.privacy.profileVisibility !== 'public' && !requesterIdentity) {
    return {
      requester,
      requesterIdentity,
      viewer: null,
    }
  }

  return {
    requester,
    requesterIdentity,
    viewer,
  }
}

async function getPublicProfilePayload(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
  requester: Doc<'users'> | null = null,
) {
  const city = viewer.profile.cityId
    ? await ctx.db.get(viewer.profile.cityId)
    : null
  const contributionsArePublic = isContributionsVisibleOnPublicProfile(
    viewer.privacy,
  )
  const [
    projects,
    posts,
    comments,
    likedProjects,
    contributions,
    followers,
    following,
  ] = await Promise.all([
    listPublicProfileProjects(ctx, viewer),
    listProfilePosts(ctx, {
      audience: 'public',
      requester,
      userId: viewer._id,
    }),
    listPublicProfileComments(ctx, viewer, requester),
    listPublicLikedProjects(ctx, viewer),
    contributionsArePublic
      ? listContributedProjects(ctx, viewer._id, 'public')
      : [],
    viewer.privacy.followGraphVisibility === 'public'
      ? listFollowPreviewSlice(ctx, {
          userId: viewer._id,
          kind: 'followers',
          limit: 12,
        })
      : [],
    viewer.privacy.followGraphVisibility === 'public'
      ? listFollowPreviewSlice(ctx, {
          userId: viewer._id,
          kind: 'following',
          limit: 12,
        })
      : [],
  ])

  return {
    githubUsername: viewer.github.username,
    profile: {
      displayName: viewer.profile.displayName,
      bio: viewer.profile.bio,
      avatarUrl: viewer.profile.avatarUrl,
      buildStatus: viewer.profile.buildStatus,
      socialLinks: viewer.profile.socialLinks,
      city: resolvePublicCityLabel(viewer, city?.displayName ?? null),
    },
    stats: viewer.stats,
    githubContributions: viewer.githubContributions ?? null,
    projects,
    posts,
    comments,
    contributions,
    followers,
    likedProjects,
    following,
    privacy: viewer.privacy,
  }
}

export const viewerBootstrap = query({
  args: {},
  returns: viewerBootstrapValidator,
  handler: async (ctx) => {
    const viewerState = await getViewerAuthState(ctx)
    if (viewerState.kind === 'unauthenticated') {
      return {
        isAuthenticated: false,
        needsOnboarding: false,
        status: 'unauthenticated' as const,
        viewer: null,
      }
    }

    if (viewerState.kind === 'missingViewer') {
      return {
        isAuthenticated: true,
        needsOnboarding: true,
        status: 'missingViewer' as const,
        viewer: null,
      }
    }

    return {
      isAuthenticated: true,
      needsOnboarding: viewerState.viewer.onboardingCompletedAt === null,
      status: 'ready' as const,
      viewer: serializeViewer(viewerState.viewer),
    }
  },
})

export const privateProfile = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const [
      city,
      projects,
      posts,
      comments,
      contributions,
      followers,
      likedProjects,
      following,
    ] = await Promise.all([
      viewer.profile.cityId ? ctx.db.get(viewer.profile.cityId) : null,
      listPrivateProfileProjects(ctx, viewer),
      listProfilePosts(ctx, {
        audience: 'private',
        requester: viewer,
        userId: viewer._id,
      }),
      listPrivateProfileComments(ctx, viewer),
      listContributedProjects(ctx, viewer._id, 'private'),
      listFollowPreviewSlice(ctx, {
        userId: viewer._id,
        kind: 'followers',
        limit: 12,
      }),
      listPrivateLikedProjects(ctx, viewer._id),
      listFollowPreviewSlice(ctx, {
        userId: viewer._id,
        kind: 'following',
        limit: 12,
      }),
    ])

    return {
      viewer: serializeViewer(viewer),
      cityName: city?.displayName ?? null,
      projects,
      posts,
      comments,
      contributions,
      followers,
      likedProjects,
      following,
    }
  },
})

export const privateProfileOverview = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const city = viewer.profile.cityId
      ? await ctx.db.get(viewer.profile.cityId)
      : null

    return {
      viewer: serializeViewer(viewer),
      cityName: city?.displayName ?? null,
    }
  },
})

export const privateProfileProjects = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listPrivateProfileProjects(ctx, viewer)
  },
})

export const privateProfilePosts = query({
  args: {},
  returns: v.array(profilePostPreviewValidator),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listProfilePosts(ctx, {
      audience: 'private',
      requester: viewer,
      userId: viewer._id,
    })
  },
})

export const privateProfileContributions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listContributedProjects(ctx, viewer._id, 'private')
  },
})

export const privateProfileComments = query({
  args: {},
  returns: v.array(profileCommentPreviewValidator),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listPrivateProfileComments(ctx, viewer)
  },
})

export const privateProfileLikedProjects = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listPrivateLikedProjects(ctx, viewer._id)
  },
})

export const privateFollowGraphPage = query({
  args: {
    kind: v.union(v.literal('followers'), v.literal('following')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)

    return await listFollowPreviewPage(ctx, {
      userId: viewer._id,
      kind: args.kind,
      paginationOpts: args.paginationOpts,
    })
  },
})

export const publicFollowGraphPage = query({
  args: {
    username: v.string(),
    kind: v.union(v.literal('followers'), v.literal('following')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_github_username', (query) =>
        query.eq('github.username', args.username),
      )
      .unique()

    if (!viewer || viewer.deletedAt || viewer.deactivatedAt) {
      return emptyFollowPreviewPage(args.paginationOpts.cursor)
    }

    if (viewer.privacy.followGraphVisibility !== 'public') {
      return emptyFollowPreviewPage(args.paginationOpts.cursor)
    }

    return await listFollowPreviewPage(ctx, {
      userId: viewer._id,
      kind: args.kind,
      paginationOpts: args.paginationOpts,
    })
  },
})

export const viewerSummary = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)

    return {
      viewerId: viewer._id,
      displayName: viewer.profile.displayName,
      avatarUrl: viewer.profile.avatarUrl,
    }
  },
})

export const viewerLikedProjectIds = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const likedReactions = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    return {
      viewerId: viewer._id,
      likedProjectIds: likedReactions.flatMap((reaction) => {
        const projectId = ctx.db.normalizeId('projects', reaction.targetId)
        return projectId ? [projectId] : []
      }),
    }
  },
})

export const viewerExplorePrefs = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)

    return {
      viewerId: viewer._id,
      appearInExplore: viewer.appearInExplore,
      cityId: viewer.profile.cityId,
      cityName: await getViewerCityName(ctx, viewer),
      exploreConfig: viewer.exploreConfig,
    }
  },
})

export const viewerInboxSummary = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)

    return {
      viewerId: viewer._id,
      unreadMessages: viewer.unreadMessagesCount,
    }
  },
})

export const publicProfile = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )

    if (!viewer) {
      return null
    }

    const followRecord = requester
      ? await ctx.db
          .query('follows')
          .withIndex('by_pair', (query) =>
            query.eq('followerId', requester._id).eq('followingId', viewer._id),
          )
          .unique()
      : null

    return {
      userId: viewer._id,
      viewerFollowsProfile: Boolean(followRecord),
      ...(await getPublicProfilePayload(ctx, viewer, requester)),
    }
  },
})

export const publicProfileOverview = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )

    if (!viewer) {
      return null
    }

    const city = viewer.profile.cityId
      ? await ctx.db.get(viewer.profile.cityId)
      : null
    const followRecord = requester
      ? await ctx.db
          .query('follows')
          .withIndex('by_pair', (query) =>
            query.eq('followerId', requester._id).eq('followingId', viewer._id),
          )
          .unique()
      : null

    return {
      userId: viewer._id,
      viewerFollowsProfile: Boolean(followRecord),
      githubUsername: viewer.github.username,
      profile: {
        displayName: viewer.profile.displayName,
        bio: viewer.profile.bio,
        avatarUrl: viewer.profile.avatarUrl,
        buildStatus: viewer.profile.buildStatus,
        socialLinks: viewer.profile.socialLinks,
        city: resolvePublicCityLabel(viewer, city?.displayName ?? null),
      },
      stats: viewer.stats,
      githubContributions: viewer.githubContributions ?? null,
      privacy: viewer.privacy,
    }
  },
})

export const publicProfileProjects = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const { viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    return await listPublicProfileProjects(ctx, viewer)
  },
})

export const publicProfilePosts = query({
  args: {
    username: v.string(),
  },
  returns: v.union(v.array(profilePostPreviewValidator), v.null()),
  handler: async (ctx, args) => {
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    return await listProfilePosts(ctx, {
      audience: 'public',
      requester,
      userId: viewer._id,
    })
  },
})

export const publicProfileContributions = query({
  args: {
    username: v.string(),
  },
  returns: v.union(v.array(profileContributionPreviewValidator), v.null()),
  handler: async (ctx, args) => {
    const { viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    if (!isContributionsVisibleOnPublicProfile(viewer.privacy)) {
      return []
    }

    return await listContributedProjects(ctx, viewer._id, 'public')
  },
})

export const publicProfileComments = query({
  args: {
    username: v.string(),
  },
  returns: v.union(v.array(profileCommentPreviewValidator), v.null()),
  handler: async (ctx, args) => {
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    return await listPublicProfileComments(ctx, viewer, requester)
  },
})

export const publicProfileLikedProjects = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const { viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    return await listPublicLikedProjects(ctx, viewer)
  },
})

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    bio: v.string(),
    cityId: v.union(v.id('cities'), v.null()),
    buildStatus: v.union(
      v.literal('building_solo'),
      v.literal('looking_for_cofounder'),
      v.literal('open_to_collab'),
      v.literal('hiring'),
      v.literal('just_exploring'),
    ),
    socialLinks: v.object({
      github: v.string(),
      x: v.union(v.string(), v.null()),
      linkedin: v.union(v.string(), v.null()),
      bluesky: v.union(v.string(), v.null()),
      website: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const nextExploreCityIds = getExploreCityIdsAfterProfileCityChange({
      previousExploreCityIds: viewer.exploreConfig.cityIds,
      previousProfileCityId: viewer.profile.cityId,
      nextProfileCityId: args.cityId,
    })
    const nextExploreConfig = {
      ...viewer.exploreConfig,
      cityIds: nextExploreCityIds,
    }

    const updatedViewer = {
      ...viewer,
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      exploreConfig: nextExploreConfig,
    }

    await ctx.db.patch(viewer._id, {
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      discoverability: {
        searchText: buildDiscoverabilitySearchText(
          viewer.github.username,
          args.displayName,
          args.displayName,
        ),
      },
      exploreConfig: nextExploreConfig,
      updatedAt: Date.now(),
    })
    await syncOwnedProjectOwnerState(ctx, updatedViewer)

    return await ctx.db.get(viewer._id)
  },
})

export const updatePrivacy = mutation({
  args: {
    profileVisibility: v.union(v.literal('public'), v.literal('locatic_only')),
    followGraphVisibility: v.union(v.literal('public'), v.literal('private')),
    commentHistoryVisibility: v.union(
      v.literal('public'),
      v.literal('private'),
    ),
    likedProjectsVisibility: v.union(v.literal('public'), v.literal('private')),
    contributionsVisibility: v.optional(
      v.union(v.literal('public'), v.literal('private')),
    ),
    cityVisibility: v.union(
      v.literal('exact_city'),
      v.literal('region_only'),
      v.literal('hidden'),
    ),
    appearInPulse: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    await ctx.db.patch(viewer._id, {
      privacy: {
        ...viewer.privacy,
        ...args,
        contributionsVisibility:
          args.contributionsVisibility ??
          viewer.privacy.contributionsVisibility ??
          'public',
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const updateNotificationPrefs = mutation({
  args: {
    projectLikes: v.boolean(),
    updateLikes: v.boolean(),
    comments: v.boolean(),
    commentReplies: v.boolean(),
    newFollowers: v.boolean(),
    dms: v.boolean(),
    weeklyDigest: v.boolean(),
    contributorRecognized: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    await ctx.db.patch(viewer._id, {
      notificationPrefs: args,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const updateExploreConfig = mutation({
  args: {
    cityIds: v.array(v.id('cities')),
    stackPrefs: v.array(v.string()),
    appearInExplore: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    await ctx.db.patch(viewer._id, {
      exploreConfig: {
        cityIds: args.cityIds,
        stackPrefs: args.stackPrefs,
      },
      appearInExplore: args.appearInExplore,
      updatedAt: Date.now(),
    })

    await syncOwnedProjectOwnerState(ctx, {
      ...viewer,
      appearInExplore: args.appearInExplore,
    })

    return null
  },
})

export const completeOnboarding = mutation({
  args: {
    displayName: v.string(),
    bio: v.string(),
    cityId: v.id('cities'),
    buildStatus: v.union(
      v.literal('building_solo'),
      v.literal('looking_for_cofounder'),
      v.literal('open_to_collab'),
      v.literal('hiring'),
      v.literal('just_exploring'),
    ),
    socialLinks: v.object({
      github: v.string(),
      x: v.union(v.string(), v.null()),
      linkedin: v.union(v.string(), v.null()),
      bluesky: v.union(v.string(), v.null()),
      website: v.union(v.string(), v.null()),
    }),
    onboardingSelectedOwnedProjectIds: v.array(v.id('projects')),
    exploreCityIds: v.array(v.id('cities')),
    stackPrefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    for (const projectId of args.onboardingSelectedOwnedProjectIds) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== viewer._id) {
        throw new ConvexError(
          'Selected projects must belong to the current viewer',
        )
      }
    }

    const updatedViewer = {
      ...viewer,
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      onboardingSelectedOwnedProjectIds: args.onboardingSelectedOwnedProjectIds,
      exploreConfig: {
        cityIds: args.exploreCityIds,
        stackPrefs: args.stackPrefs,
      },
      onboardingCompletedAt: Date.now(),
    }

    await ctx.db.patch(viewer._id, {
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      discoverability: {
        searchText: buildDiscoverabilitySearchText(
          viewer.github.username,
          args.displayName,
          args.displayName,
        ),
      },
      onboardingSelectedOwnedProjectIds: args.onboardingSelectedOwnedProjectIds,
      exploreConfig: {
        cityIds: args.exploreCityIds,
        stackPrefs: args.stackPrefs,
      },
      onboardingCompletedAt: Date.now(),
      updatedAt: Date.now(),
    })
    await syncOwnedProjectOwnerState(ctx, updatedViewer)

    return await ctx.db.get(viewer._id)
  },
})

export const deactivateAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const now = Date.now()

    await ctx.db.patch(viewer._id, {
      deactivatedAt: now,
      appearInExplore: false,
      updatedAt: now,
    })

    await syncOwnedProjectOwnerState(ctx, {
      ...viewer,
      deactivatedAt: now,
      appearInExplore: false,
    })

    return null
  },
})

export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    await requestAccountDeletion(ctx, viewer)

    return null
  },
})

export const backfillUserPostCounts = internalMutation({
  args: {
    afterCreatedAt: optionalTimestampValidator,
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scannedCount: v.number(),
    patchedCount: v.number(),
    nextAfterCreatedAt: optionalTimestampValidator,
    scheduledContinuation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100)
    const afterCreatedAt = args.afterCreatedAt ?? null
    const users = await ctx.db
      .query('users')
      .withIndex('by_created_at', (query) =>
        afterCreatedAt === null ? query : query.gt('createdAt', afterCreatedAt),
      )
      .take(limit)
    let patchedCount = 0

    for (const user of users) {
      const posts = await ctx.db
        .query('posts')
        .withIndex('by_owner_deleted_created', (query) =>
          query.eq('ownerId', user._id).eq('deletedAt', null),
        )
        .collect()
      const postsCount = posts.length

      if (shouldPatchUserPostsCount(user.stats.postsCount, postsCount)) {
        patchedCount += 1
        await ctx.db.patch(user._id, {
          stats: {
            ...user.stats,
            postsCount,
          },
          updatedAt: Date.now(),
        })
      }
    }

    const nextAfterCreatedAt = getNextUserPostsCountBackfillCursor(users, limit)
    const scheduledContinuation = nextAfterCreatedAt !== null
    if (scheduledContinuation) {
      await ctx.scheduler.runAfter(0, internal.users.backfillUserPostCounts, {
        afterCreatedAt: nextAfterCreatedAt,
        limit,
      })
    }

    return {
      scannedCount: users.length,
      patchedCount,
      nextAfterCreatedAt,
      scheduledContinuation,
    }
  },
})

export const finalizeDeletedAccount = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.users.scrubDeletedAccount, {
      userId: args.userId,
    })
    return null
  },
})

export const purgeDeletedAccountIfDue = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.deletedAccountPurgeState, {
      userId: args.userId,
    })
    if (!user || !shouldPurgeDeletedAccount(user, Date.now())) {
      return null
    }

    await ctx.runMutation(internal.users.scrubDeletedAccount, {
      userId: args.userId,
    })

    return null
  },
})

export const deletedAccountPurgeState = internalQuery({
  args: {
    userId: v.id('users'),
  },
  returns: v.union(
    v.object({
      deletedAt: optionalTimestampValidator,
      purgeAfter: optionalTimestampValidator,
      purgedAt: optionalTimestampValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) {
      return null
    }

    return {
      deletedAt: user.deletedAt ?? null,
      purgeAfter: user.purgeAfter ?? null,
      purgedAt: user.purgedAt ?? null,
    }
  },
})

export const scrubDeletedAccount = internalMutation({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) {
      return null
    }
    if (user.purgedAt) {
      return null
    }

    const [
      ownedProjects,
      ownedPosts,
      comments,
      reactions,
      followsAsFollower,
      followsAsFollowing,
      notificationsAsRecipient,
      notificationsAsActor,
      conversationsAsLow,
      conversationsAsHigh,
      sentMessages,
      activityEvents,
      homeFeedItemsAsUser,
      homeFeedItemsAsActor,
      contributorRows,
      reports,
    ] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_owner', (query) => query.eq('ownerId', args.userId))
        .collect(),
      ctx.db
        .query('posts')
        .withIndex('by_owner_deleted_created', (query) =>
          query.eq('ownerId', args.userId).eq('deletedAt', null),
        )
        .collect(),
      ctx.db
        .query('comments')
        .withIndex('by_author', (query) => query.eq('authorId', args.userId))
        .collect(),
      ctx.db
        .query('reactions')
        .withIndex('by_user', (query) => query.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('follows')
        .withIndex('by_follower', (query) =>
          query.eq('followerId', args.userId),
        )
        .collect(),
      ctx.db
        .query('follows')
        .withIndex('by_following', (query) =>
          query.eq('followingId', args.userId),
        )
        .collect(),
      ctx.db
        .query('notifications')
        .withIndex('by_recipient_created', (query) =>
          query.eq('recipientId', args.userId),
        )
        .collect(),
      ctx.db
        .query('notifications')
        .withIndex('by_actor_created', (query) =>
          query.eq('actorId', args.userId),
        )
        .collect(),
      ctx.db
        .query('conversations')
        .withIndex('by_participant_low_updated', (query) =>
          query.eq('participantLowId', args.userId),
        )
        .collect(),
      ctx.db
        .query('conversations')
        .withIndex('by_participant_high_updated', (query) =>
          query.eq('participantHighId', args.userId),
        )
        .collect(),
      ctx.db
        .query('messages')
        .withIndex('by_sender_created', (query) =>
          query.eq('senderId', args.userId),
        )
        .collect(),
      ctx.db
        .query('activity_events')
        .withIndex('by_actor', (query) => query.eq('actorId', args.userId))
        .collect(),
      ctx.db
        .query('home_feed_items')
        .withIndex('by_user_created', (query) =>
          query.eq('userId', args.userId),
        )
        .collect(),
      ctx.db
        .query('home_feed_items')
        .withIndex('by_actor_created', (query) =>
          query.eq('actorId', args.userId),
        )
        .collect(),
      ctx.db
        .query('project_contributors')
        .withIndex('by_user', (query) => query.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('reports')
        .withIndex('by_reporter', (query) =>
          query.eq('reporterId', args.userId),
        )
        .collect(),
    ])

    const follows = [...followsAsFollower, ...followsAsFollowing]
    const notifications = [...notificationsAsRecipient, ...notificationsAsActor]
    const conversations = [...conversationsAsLow, ...conversationsAsHigh]
    const homeFeedItems = [...homeFeedItemsAsUser, ...homeFeedItemsAsActor]

    for (const follow of followsAsFollower) {
      const targetUser = await ctx.db.get(follow.followingId)
      if (targetUser) {
        await ctx.db.patch(targetUser._id, {
          stats: {
            ...targetUser.stats,
            followersCount: Math.max(0, targetUser.stats.followersCount - 1),
          },
          updatedAt: Date.now(),
        })
      }
    }

    for (const follow of followsAsFollowing) {
      const follower = await ctx.db.get(follow.followerId)
      if (follower) {
        await ctx.db.patch(follower._id, {
          stats: {
            ...follower.stats,
            followingCount: Math.max(0, follower.stats.followingCount - 1),
          },
          updatedAt: Date.now(),
        })
      }
    }

    for (const reaction of reactions) {
      if (reaction.targetType === 'project') {
        const projectId = ctx.db.normalizeId('projects', reaction.targetId)
        const project = projectId ? await ctx.db.get(projectId) : null
        if (project) {
          await ctx.db.patch(project._id, {
            locatic: {
              ...project.locatic,
              likesCount: Math.max(0, project.locatic.likesCount - 1),
            },
            updatedAt: Date.now(),
          })
        }
      }

      if (reaction.targetType === 'comment') {
        const commentId = ctx.db.normalizeId('comments', reaction.targetId)
        const comment = commentId ? await ctx.db.get(commentId) : null
        if (comment) {
          await ctx.db.patch(comment._id, {
            likesCount: Math.max(0, comment.likesCount - 1),
          })
        }
      }
    }

    for (const comment of comments) {
      if (comment.isDeleted) {
        continue
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
      }

      await ctx.db.patch(comment._id, {
        content: '[deleted]',
        isDeleted: true,
      })
    }

    for (const project of ownedProjects) {
      await ctx.db.patch(project._id, {
        locatic: {
          ...project.locatic,
          isVisible: false,
        },
        exploreOwner: buildProjectExploreOwner(user, false),
        updatedAt: Date.now(),
      })
    }

    for (const post of ownedPosts) {
      const project = await ctx.db.get(post.projectId)
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            postsCount: Math.max(0, (project.locatic.postsCount ?? 0) - 1),
          },
          updatedAt: Date.now(),
        })
      }

      await ctx.db.patch(post._id, {
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    for (const conversation of conversations) {
      const conversationMessages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (query) =>
          query.eq('conversationId', conversation._id),
        )
        .collect()

      await Promise.all(
        conversationMessages.map((message) => ctx.db.delete(message._id)),
      )
    }

    await Promise.all([
      ...[
        ...new Map(
          follows.map((follow) => [String(follow._id), follow]),
        ).values(),
      ].map((follow) => ctx.db.delete(follow._id)),
      ...[
        ...new Map(
          notifications.map((notification) => [
            String(notification._id),
            notification,
          ]),
        ).values(),
      ].map((notification) => ctx.db.delete(notification._id)),
      ...[
        ...new Map(
          sentMessages.map((message) => [String(message._id), message]),
        ).values(),
      ].map((message) => ctx.db.delete(message._id)),
      ...[
        ...new Map(
          conversations.map((conversation) => [
            String(conversation._id),
            conversation,
          ]),
        ).values(),
      ].map((conversation) => ctx.db.delete(conversation._id)),
      ...[
        ...new Map(
          homeFeedItems.map((item) => [String(item._id), item]),
        ).values(),
      ].map((item) => ctx.db.delete(item._id)),
      ...activityEvents.map((event) => ctx.db.delete(event._id)),
      ...contributorRows.map((row) => ctx.db.delete(row._id)),
      ...reports.map((report) => ctx.db.delete(report._id)),
      ...reactions.map((reaction) => ctx.db.delete(reaction._id)),
    ])

    await ctx.db.patch(user._id, {
      email: `deleted+${String(user._id)}@locatic.invalid`,
      profile: {
        ...user.profile,
        displayName: 'Deleted User',
        fullName: null,
        bio: '',
        socialLinks: {
          github: 'https://github.com',
          x: null,
          linkedin: null,
          bluesky: null,
          website: null,
        },
      },
      discoverability: {
        searchText: '',
      },
      stats: {
        ...user.stats,
        postsCount: 0,
        commentsCount: 0,
        likedCount: 0,
      },
      purgeAfter: null,
      purgedAt: Date.now(),
      updatedAt: Date.now(),
    })

    return null
  },
})

export const upsertFromClerkWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    githubId: v.union(v.number(), v.null()),
    githubUsername: v.string(),
    githubUrl: v.string(),
    displayName: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existingViewer = await getViewerByClerkId(ctx, args.clerkId)
    const now = Date.now()
    await assertGithubUsernameAvailable(ctx, args.githubUsername, {
      exceptUserId: existingViewer?._id,
    })

    if (!existingViewer) {
      const userId = await ctx.db.insert(
        'users',
        createDefaultViewerProfile({
          clerkId: args.clerkId,
          email: args.email,
          githubId: args.githubId,
          githubUsername: args.githubUsername,
          githubUrl: args.githubUrl,
          avatarUrl: args.avatarUrl,
          displayName: args.displayName,
        }),
      )

      return await ctx.db.get(userId)
    }

    if (existingViewer.deletedAt) {
      return existingViewer
    }

    const nextGithubId = resolveStoredGithubId(
      existingViewer.github.id,
      args.githubId,
    )

    await ctx.db.patch(existingViewer._id, {
      email: args.email,
      github: {
        id: nextGithubId,
        username: args.githubUsername,
      },
      profile: {
        ...existingViewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        avatarUrl: args.avatarUrl,
        socialLinks: {
          ...existingViewer.profile.socialLinks,
          github: args.githubUrl,
        },
      },
      discoverability: {
        searchText: buildDiscoverabilitySearchText(
          args.githubUsername,
          args.displayName,
          args.displayName,
        ),
      },
      updatedAt: now,
    })

    await syncOwnedProjectOwnerState(ctx, {
      ...existingViewer,
      email: args.email,
      github: {
        id: nextGithubId,
        username: args.githubUsername,
      },
      profile: {
        ...existingViewer.profile,
        displayName: args.displayName,
        fullName: args.displayName,
        avatarUrl: args.avatarUrl,
        socialLinks: {
          ...existingViewer.profile.socialLinks,
          github: args.githubUrl,
        },
      },
    })

    return await ctx.db.get(existingViewer._id)
  },
})

const userGithubIdBackfillTargetValidator = v.object({
  userId: v.id('users'),
  username: v.string(),
})

export const listUsersMissingGithubIds = internalQuery({
  args: {
    limit: v.optional(v.number()),
    username: v.optional(v.string()),
  },
  returns: v.array(userGithubIdBackfillTargetValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? 25), 1),
      MAX_USER_GITHUB_ID_BACKFILL_BATCH,
    )
    const username = args.username?.trim()

    if (username) {
      const user = await ctx.db
        .query('users')
        .withIndex('by_github_username', (query) =>
          query.eq('github.username', username),
        )
        .unique()

      return user && user.github.id === null
        ? [{ userId: user._id, username: user.github.username }]
        : []
    }

    const targets: Array<{
      userId: Id<'users'>
      username: string
    }> = []
    let cursor: string | null = null

    while (targets.length < limit) {
      const page = await ctx.db
        .query('users')
        .withIndex('by_github_id', (query) => query.eq('github.id', null))
        .paginate({
          cursor,
          numItems: limit - targets.length,
        })

      for (const user of page.page) {
        const backfillUsername = user.github.username.trim()
        if (backfillUsername.length > 0) {
          targets.push({
            userId: user._id,
            username: backfillUsername,
          })
        }
      }

      if (page.isDone || page.page.length === 0) {
        break
      }
      cursor = page.continueCursor
    }

    return targets
  },
})

export const patchGithubIdFromBackfill = internalMutation({
  args: {
    userId: v.id('users'),
    githubId: v.number(),
  },
  returns: v.object({
    status: v.union(
      v.literal('updated'),
      v.literal('already_set'),
      v.literal('missing_user'),
      v.literal('skipped_existing_id'),
      v.literal('skipped_conflict'),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) {
      return { status: 'missing_user' as const }
    }

    if (user.github.id === args.githubId) {
      return { status: 'already_set' as const }
    }

    if (user.github.id !== null) {
      return { status: 'skipped_existing_id' as const }
    }

    const conflictingUser = await ctx.db
      .query('users')
      .withIndex('by_github_id', (query) =>
        query.eq('github.id', args.githubId),
      )
      .unique()

    if (conflictingUser && conflictingUser._id !== user._id) {
      return { status: 'skipped_conflict' as const }
    }

    await ctx.db.patch(user._id, {
      github: {
        ...user.github,
        id: args.githubId,
      },
      updatedAt: Date.now(),
    })

    return { status: 'updated' as const }
  },
})

export const deleteFromClerkWebhook = internalMutation({
  args: {
    clerkId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerByClerkId(ctx, args.clerkId)
    if (!viewer) {
      return null
    }

    await requestAccountDeletion(ctx, viewer)

    return null
  },
})

export const markClerkWebhookEventProcessing = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
  },
  returns: v.object({
    shouldProcess: v.boolean(),
    status: v.union(
      v.literal('processing'),
      v.literal('processed'),
      v.literal('ignored'),
      v.literal('failed'),
    ),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingEvents = await ctx.db
      .query('webhook_events')
      .withIndex('by_source_event', (query) =>
        query.eq('source', 'clerk').eq('eventId', args.eventId),
      )
      .collect()
    const decision = getWebhookProcessingDecision(existingEvents, now)

    if (!decision.shouldProcess) {
      return {
        shouldProcess: false,
        status: decision.status,
      }
    }

    if (existingEvents.length > 0) {
      await Promise.all(
        existingEvents.map((event) =>
          ctx.db.patch(event._id, {
            eventType: args.eventType,
            status: 'processing',
            error: null,
            receivedAt: now,
            processedAt: null,
          }),
        ),
      )
    } else {
      await ctx.db.insert('webhook_events', {
        source: 'clerk',
        eventId: args.eventId,
        eventType: args.eventType,
        status: 'processing',
        receivedAt: now,
        processedAt: null,
        error: null,
      })
    }

    return {
      shouldProcess: true,
      status: 'processing' as const,
    }
  },
})

export const markClerkWebhookEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    status: v.union(v.literal('processed'), v.literal('ignored')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('webhook_events')
      .withIndex('by_source_event', (query) =>
        query.eq('source', 'clerk').eq('eventId', args.eventId),
      )
      .collect()
    if (events.length === 0) {
      return null
    }

    const now = Date.now()
    await Promise.all(
      events.map((event) =>
        ctx.db.patch(event._id, {
          status: args.status,
          processedAt: now,
          error: null,
        }),
      ),
    )

    return null
  },
})

export const markClerkWebhookEventFailed = internalMutation({
  args: {
    eventId: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('webhook_events')
      .withIndex('by_source_event', (query) =>
        query.eq('source', 'clerk').eq('eventId', args.eventId),
      )
      .collect()
    if (events.length === 0) {
      return null
    }

    const now = Date.now()
    await Promise.all(
      events.map((event) =>
        ctx.db.patch(event._id, {
          status: 'failed',
          processedAt: now,
          error: compactWebhookError(args.error),
        }),
      ),
    )

    return null
  },
})

export const bootstrapActorSnapshot = action({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runQuery(internal.users.viewerByClerkId, {
      clerkId: identity.subject,
    })

    if (!viewer) {
      return null
    }

    return await ctx.runQuery(internal.users.actorSnapshotById, {
      userId: viewer._id,
    })
  },
})

export const viewerByClerkId = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getViewerByClerkId(ctx, args.clerkId)
  },
})

export const ensureViewerFromIdentity = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    githubUsername: v.string(),
    githubUrl: v.string(),
    avatarUrl: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const existingViewer = await getViewerByClerkId(ctx, args.clerkId)
    if (existingViewer) {
      const nextSearchText = buildDiscoverabilitySearchText(
        existingViewer.github.username,
        existingViewer.profile.displayName,
        existingViewer.profile.fullName ?? existingViewer.profile.displayName,
      )
      if (existingViewer.discoverability.searchText !== nextSearchText) {
        await ctx.db.patch(existingViewer._id, {
          discoverability: {
            searchText: nextSearchText,
          },
          updatedAt: Date.now(),
        })
      }
      return existingViewer
    }

    await assertGithubUsernameAvailable(ctx, args.githubUsername)

    const viewerId = await ctx.db.insert(
      'users',
      createDefaultViewerProfile({
        clerkId: args.clerkId,
        email: args.email,
        githubId: null,
        githubUsername: args.githubUsername,
        githubUrl: args.githubUrl,
        avatarUrl: args.avatarUrl,
        displayName: args.displayName,
      }),
    )

    const viewer = await ctx.db.get(viewerId)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    return viewer
  },
})

export const actorSnapshotById = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db.get(args.userId)
    if (!viewer) {
      return null
    }

    return await buildActorSnapshot(ctx.db, viewer)
  },
})

export const userById = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId)
  },
})

export const patchContributions = internalMutation({
  args: {
    userId: v.id('users'),
    contributions: v.object({
      totalContributions: v.number(),
      weeks: v.array(
        v.object({
          days: v.array(v.object({ date: v.string(), count: v.number() })),
        }),
      ),
      syncedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      githubContributions: args.contributions,
      updatedAt: Date.now(),
    })
  },
})
