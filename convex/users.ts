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
import { assertProfileTextLimits } from './lib/content_limits'
import { enforceRateLimit } from './lib/rate_limits'
import { resolveProjectOwnerLogin } from './lib/project_route'
import {
  buildProjectCardPreview,
  projectCardPreviewValidator,
  resolvePublicCityLabel,
} from './lib/project_previews'
import { filterVisiblePosts, getVisiblePostProject } from './lib/posts'
import { isProjectPubliclyInteractable } from './lib/project_access'
import {
  getAccountDeletionWindow,
  shouldPurgeDeletedAccount,
} from './lib/account_deletion'
import {
  getExploreCityIdsAfterProfileCityChange,
  isNewBuilderAccount,
} from './lib/explore'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  getPostCityId,
} from './lib/snapshots'
import { createDefaultViewerProfile } from './lib/viewer'
import { normalizeEmailAddress } from './lib/email_address'
import { isEmailAdminViewer } from './lib/email_admin'
import { isSubscribed } from './lib/email_audience'
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
import {
  isContributionsVisibleOnPublicProfile,
  isProfileGone,
  isProfileOpenToSignedOutVisitors,
} from './lib/privacy'
import {
  getRegionLabel,
  isCityMember,
  toPublicIdentity,
} from './lib/visibility'
import { createCityStatsChanges, getBuilderCityId } from './lib/cityStats'
import {
  computeLastPublicActivityAt,
  recomputeProjectPublicActivity,
  withLastPublicActivity,
} from './lib/activity'
import {
  buildStatusValidator,
  cityReferenceValidator,
  cityVisibilityValidator,
  optionalStringValidator,
  optionalTimestampValidator,
  locationDisclosureValidator,
  profileVisibilityValidator,
  publicIdentityFields,
  socialLinksValidator,
  tabVisibilityValidator,
} from './lib/validators'
import {
  getCommentReactionCounts,
  getNextCommentReactionState,
  getNextPostReactionCounts,
  getNextProjectReactionLocatic,
  getViewerReactionTypesByTargetId,
} from './lib/reactions'

const viewerBootstrapStatusValidator = v.union(
  v.literal('unauthenticated'),
  v.literal('missingViewer'),
  v.literal('ready'),
)

const githubContributionsValidator = v.union(
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
    productUpdates: v.optional(v.boolean()),
  }),
  onboardingSelectedOwnedProjectIds: v.array(v.id('projects')),
  pinnedProfileProjectIds: v.array(v.id('projects')),
  unreadMessagesCount: v.number(),
  onboardingCompletedAt: optionalTimestampValidator,
  appearInExplore: v.boolean(),
  githubContributions: githubContributionsValidator,
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
  // UI hint only; every email admin function checks again.
  isEmailAdmin: v.boolean(),
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

const profileContributionPreviewValidator = v.object({
  project: projectCardPreviewValidator,
  commitCount: v.number(),
})

// Pinned projects and recent work on the public profile (plan item C6).
const PROFILE_RECENT_WORK_LIMIT = 5
// The pin cap enforced by `projects.pinOwnedProject`.
const PROFILE_PIN_LIMIT = 3

/** Tab visibility a visitor needs to render the profile; no other settings. */
const publicProfilePrivacyValidator = v.object({
  followGraphVisibility: tabVisibilityValidator,
  commentHistoryVisibility: tabVisibilityValidator,
  likedProjectsVisibility: tabVisibilityValidator,
  contributionsVisibility: tabVisibilityValidator,
})

/**
 * Profile counters. Followers, following, projects and posts are always
 * returned; a count behind a private tab (contributions, comments, likes) is
 * null, not disclosed.
 */
const publicProfileStatsValidator = v.object({
  followersCount: v.number(),
  followingCount: v.number(),
  projectsCount: v.number(),
  postsCount: v.number(),
  contributionsCount: v.union(v.number(), v.null()),
  commentsCount: v.union(v.number(), v.null()),
  likedCount: v.union(v.number(), v.null()),
})

/**
 * `publicProfileOverview`: the reviewed field set for a profile page. Identity
 * comes from `toPublicIdentity`; `profile.city` is the legacy label for the
 * same disclosure, kept for the repository manager's optimistic previews.
 * `viewerFollowsProfile` is present only for a signed-in requester.
 */
const publicProfileOverviewValidator = v.object({
  userId: v.id('users'),
  githubUsername: v.string(),
  profile: v.object({
    displayName: v.string(),
    bio: v.string(),
    avatarUrl: v.string(),
    buildStatus: buildStatusValidator,
    socialLinks: socialLinksValidator,
    location: locationDisclosureValidator,
    city: v.union(v.string(), v.null()),
  }),
  stats: publicProfileStatsValidator,
  privacy: publicProfilePrivacyValidator,
  githubContributions: githubContributionsValidator,
  pinnedProjects: v.array(projectCardPreviewValidator),
  recentProjects: v.array(projectCardPreviewValidator),
  recentPosts: v.array(profilePostPreviewValidator),
  viewerFollowsProfile: v.optional(v.boolean()),
})

function serializeViewer(
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerFromAuth>>>,
) {
  const {
    followersCount,
    followingCount,
    projectsCount,
    postsCount,
    contributionsCount,
    commentsCount,
    likedCount,
  } = viewer.stats

  return {
    _id: viewer._id,
    email: viewer.email,
    github: viewer.github,
    profile: viewer.profile,
    stats: {
      followersCount,
      followingCount,
      projectsCount,
      postsCount,
      contributionsCount,
      commentsCount,
      likedCount,
    },
    exploreConfig: viewer.exploreConfig,
    privacy: viewer.privacy,
    notificationPrefs: {
      ...viewer.notificationPrefs,
      productUpdates: viewer.notificationPrefs.productUpdates ?? true,
    },
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

/**
 * Re-derives the user's denormalised owner and actor fields after a change to
 * their profile, city, city visibility or discovery participation, so the
 * visibility policy (convex/lib/visibility.ts) holds for maintained data:
 * `projects.exploreOwner` / `projects.ownerSnapshot` on their projects,
 * `posts.projectCityId` (`getPostCityId`: member city while discoverable) on
 * posts about their projects, `actorSnapshot` on
 * their own live posts, and the city counters (convex/lib/cityStats.ts) for
 * the user as a builder and for each of their projects. `previous` is the
 * user document before the change (pass `user` itself when only re-deriving);
 * project transitions are read from the stored rows. Reads are bounded by the
 * user's own rows via the owner and actor indexes.
 */
async function syncOwnedProjectOwnerState(
  ctx: MutationCtx,
  previous: Doc<'users'>,
  user: Doc<'users'>,
) {
  const cityStats = createCityStatsChanges()
  cityStats.moveBuilder(getBuilderCityId(previous), getBuilderCityId(user))

  const [ownedProjects, ownedPosts, authoredPosts] = await Promise.all([
    ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', user._id))
      .collect(),
    ctx.db
      .query('posts')
      .withIndex('by_owner_deleted_created', (query) =>
        query.eq('ownerId', user._id),
      )
      .collect(),
    ctx.db
      .query('posts')
      .withIndex('by_actor_deleted_created', (query) =>
        query.eq('actorId', user._id).eq('deletedAt', null),
      )
      .collect(),
  ])

  if (
    ownedProjects.length === 0 &&
    ownedPosts.length === 0 &&
    authoredPosts.length === 0
  ) {
    await cityStats.apply(ctx.db)
    return
  }

  const [ownerSnapshot, actorSnapshot] = await Promise.all([
    buildOwnerSnapshot(ctx.db, user),
    buildActorSnapshot(ctx.db, user),
  ])
  const projectCityId = getPostCityId(user)

  await Promise.all([
    ...ownedProjects.map(async (project) => {
      const exploreOwner = buildProjectExploreOwner(
        user,
        project.locatic.isVisible,
      )
      await cityStats.moveProject(ctx.db, project, project, { exploreOwner })
      await ctx.db.patch(project._id, { ownerSnapshot, exploreOwner })
    }),
    ...ownedPosts
      .filter((post) => post.projectCityId !== projectCityId)
      .map((post) => ctx.db.patch(post._id, { projectCityId })),
    ...authoredPosts
      .filter(
        (post) =>
          post.actorSnapshot.displayName !== actorSnapshot.displayName ||
          post.actorSnapshot.avatarUrl !== actorSnapshot.avatarUrl ||
          post.actorSnapshot.cityId !== actorSnapshot.cityId ||
          post.actorSnapshot.cityName !== actorSnapshot.cityName,
      )
      .map((post) => ctx.db.patch(post._id, { actorSnapshot })),
  ])
  await cityStats.apply(ctx.db)
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

  await syncOwnedProjectOwnerState(ctx, user, {
    ...user,
    deletedAt,
    deactivatedAt,
    purgeAfter,
    appearInExplore: false,
  })

  await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
    userId: user._id,
    before: now,
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
    cityName: resolvePublicCityLabel(user, city),
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
  viewerId: Id<'users'> | null,
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
          signals: { viewerId },
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
        signals: { viewerId: viewer._id },
      }),
    ),
  )
}

async function listPublicProfileProjects(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
  requesterId: Id<'users'> | null,
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
        signals: { viewerId: requesterId },
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
        // Liked projects belong to other people, so their owners' location
        // goes through the public disclosure policy.
        project: await buildProjectCardPreview(ctx.db, project, {
          audience: 'public',
          signals: { viewerId: userId },
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
  requesterId: Id<'users'> | null,
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
          signals: { viewerId: requesterId },
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
    limit?: number
  },
) {
  const posts = await ctx.db
    .query('posts')
    .withIndex('by_owner_deleted_created', (query) =>
      query.eq('ownerId', args.userId).eq('deletedAt', null),
    )
    .order('desc')
    .take(args.limit ?? PROFILE_POSTS_LIMIT)
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

  if (!viewer || isProfileGone(viewer)) {
    return {
      requester,
      requesterIdentity,
      viewer: null,
    }
  }

  if (!isProfileOpenToSignedOutVisitors(viewer) && !requesterIdentity) {
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

function toPublicProfilePrivacy(privacy: Doc<'users'>['privacy']) {
  return {
    followGraphVisibility: privacy.followGraphVisibility,
    commentHistoryVisibility: privacy.commentHistoryVisibility,
    likedProjectsVisibility: privacy.likedProjectsVisibility,
    contributionsVisibility: isContributionsVisibleOnPublicProfile(privacy)
      ? ('public' as const)
      : ('private' as const),
  }
}

function toPublicProfileStats(user: Doc<'users'>) {
  const privacy = toPublicProfilePrivacy(user.privacy)
  return {
    followersCount: user.stats.followersCount,
    followingCount: user.stats.followingCount,
    projectsCount: user.stats.projectsCount,
    postsCount: user.stats.postsCount ?? 0,
    contributionsCount:
      privacy.contributionsVisibility === 'public'
        ? user.stats.contributionsCount
        : null,
    commentsCount:
      privacy.commentHistoryVisibility === 'public'
        ? user.stats.commentsCount
        : null,
    likedCount:
      privacy.likedProjectsVisibility === 'public'
        ? user.stats.likedCount
        : null,
  }
}

/**
 * Pinned projects in pin order, then the latest visible projects that are not
 * pinned. Bounded: at most `PROFILE_PIN_LIMIT` gets plus one indexed read of
 * `PROFILE_RECENT_WORK_LIMIT + PROFILE_PIN_LIMIT` rows.
 */
async function listPublicProfileShowcase(
  ctx: QueryCtx,
  user: Doc<'users'>,
  requesterId: Id<'users'> | null,
) {
  const pinnedIds = user.pinnedProfileProjectIds.slice(0, PROFILE_PIN_LIMIT)
  const pinnedIdSet = new Set(pinnedIds.map(String))
  const [pinnedRows, latestRows] = await Promise.all([
    Promise.all(pinnedIds.map((projectId) => ctx.db.get(projectId))),
    ctx.db
      .query('projects')
      .withIndex('by_owner_visible', (query) =>
        query.eq('ownerId', user._id).eq('locatic.isVisible', true),
      )
      .order('desc')
      .take(PROFILE_RECENT_WORK_LIMIT + PROFILE_PIN_LIMIT),
  ])
  const pinned = pinnedRows.filter(
    (project): project is Doc<'projects'> =>
      project !== null &&
      project.ownerId === user._id &&
      project.locatic.isVisible,
  )
  const recent = latestRows
    .filter((project) => !pinnedIdSet.has(String(project._id)))
    .slice(0, PROFILE_RECENT_WORK_LIMIT)
  const toPreview = (project: Doc<'projects'>) =>
    buildProjectCardPreview(ctx.db, project, {
      audience: 'public',
      owner: user,
      signals: { viewerId: requesterId },
    })

  const [pinnedProjects, recentProjects] = await Promise.all([
    Promise.all(pinned.map(toPreview)),
    Promise.all(recent.map(toPreview)),
  ])

  return { pinnedProjects, recentProjects }
}

// Shipping log on the profile (plan item D6).
const SHIPPING_LOG_LIMIT = 10
/** Visible projects read to find the ones whose releases are listed. */
const SHIPPING_LOG_PROJECT_SCAN_LIMIT = 24
/** Most recently committed projects whose releases are read. */
const SHIPPING_LOG_PROJECT_LIMIT = 8
const SHIPPING_LOG_RELEASES_PER_PROJECT = 3
const SHIPPING_LOG_EXCERPT_LENGTH = 140

const shippingLogProjectValidator = v.object({
  owner: v.string(),
  repo: v.string(),
  fullName: v.string(),
})

const shippingLogEntryValidator = v.union(
  v.object({
    kind: v.literal('release'),
    id: v.string(),
    at: v.number(),
    project: shippingLogProjectValidator,
    title: v.string(),
    tagName: v.string(),
    url: v.string(),
  }),
  v.object({
    kind: v.literal('post'),
    id: v.string(),
    at: v.number(),
    project: shippingLogProjectValidator,
    excerpt: v.string(),
  }),
)

function toShippingLogExcerpt(body: string) {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > SHIPPING_LOG_EXCERPT_LENGTH
    ? `${text.slice(0, SHIPPING_LOG_EXCERPT_LENGTH - 1).trimEnd()}…`
    : text
}

/**
 * Dated releases and posts across the builder's visible projects, newest
 * first, at most `SHIPPING_LOG_LIMIT`. Bounded reads: one read of the
 * `SHIPPING_LOG_PROJECT_SCAN_LIMIT` most recently added visible projects
 * (`by_owner_visible`, descending; the index is not ordered by commit time),
 * `take(SHIPPING_LOG_RELEASES_PER_PROJECT)` releases for each of the
 * `SHIPPING_LOG_PROJECT_LIMIT` most recently committed among them
 * (`by_project_published`), and one `take(SHIPPING_LOG_LIMIT)` of live posts
 * (`by_owner_deleted_created`) filtered by the public post visibility check.
 * Drafts and unpublished releases are never listed.
 */
async function listProfileShippingLog(ctx: QueryCtx, user: Doc<'users'>) {
  const [projects, posts] = await Promise.all([
    ctx.db
      .query('projects')
      .withIndex('by_owner_visible', (query) =>
        query.eq('ownerId', user._id).eq('locatic.isVisible', true),
      )
      .order('desc')
      .take(SHIPPING_LOG_PROJECT_SCAN_LIMIT),
    ctx.db
      .query('posts')
      .withIndex('by_owner_deleted_created', (query) =>
        query.eq('ownerId', user._id).eq('deletedAt', null),
      )
      .order('desc')
      .take(SHIPPING_LOG_LIMIT),
  ])
  const releaseProjects = [...projects]
    .sort((left, right) => right.github.lastCommitAt - left.github.lastCommitAt)
    .slice(0, SHIPPING_LOG_PROJECT_LIMIT)
  const [releasesByProject, visiblePosts] = await Promise.all([
    Promise.all(
      releaseProjects.map((project) =>
        ctx.db
          .query('project_releases')
          .withIndex('by_project_published', (query) =>
            query.eq('projectId', project._id),
          )
          .order('desc')
          .take(SHIPPING_LOG_RELEASES_PER_PROJECT),
      ),
    ),
    filterVisiblePosts(ctx, posts),
  ])

  const releaseEntries = releaseProjects.flatMap((project, index) => {
    const projectRef = {
      owner: resolveProjectOwnerLogin(project),
      repo: project.github.name,
      fullName: project.github.fullName,
    }
    return releasesByProject[index].flatMap((release) =>
      release.isDraft || release.publishedAt === null
        ? []
        : [
            {
              kind: 'release' as const,
              id: String(release._id),
              at: release.publishedAt,
              project: projectRef,
              title: release.name?.trim() || release.tagName,
              tagName: release.tagName,
              url: release.htmlUrl,
            },
          ],
    )
  })
  const postEntries = visiblePosts.map((post) => ({
    kind: 'post' as const,
    id: String(post._id),
    at: post.createdAt,
    project: {
      owner: post.projectSnapshot.ownerLogin,
      repo: post.projectSnapshot.name,
      fullName: post.projectSnapshot.fullName,
    },
    excerpt: toShippingLogExcerpt(post.body),
  }))

  return [...releaseEntries, ...postEntries]
    .sort((left, right) => right.at - left.at)
    .slice(0, SHIPPING_LOG_LIMIT)
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
    listPublicProfileProjects(ctx, viewer, requester?._id ?? null),
    listProfilePosts(ctx, {
      audience: 'public',
      requester,
      userId: viewer._id,
    }),
    listPublicProfileComments(ctx, viewer, requester),
    listPublicLikedProjects(ctx, viewer, requester?._id ?? null),
    contributionsArePublic
      ? listContributedProjects(
          ctx,
          viewer._id,
          'public',
          requester?._id ?? null,
        )
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
      city: resolvePublicCityLabel(viewer, city),
    },
    stats: toPublicProfileStats(viewer),
    githubContributions: viewer.githubContributions ?? null,
    projects,
    posts,
    comments,
    contributions,
    followers,
    likedProjects,
    following,
    privacy: toPublicProfilePrivacy(viewer.privacy),
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
        isEmailAdmin: false,
        status: 'unauthenticated' as const,
        viewer: null,
      }
    }

    if (viewerState.kind === 'missingViewer') {
      return {
        isAuthenticated: true,
        needsOnboarding: true,
        isEmailAdmin: false,
        status: 'missingViewer' as const,
        viewer: null,
      }
    }

    return {
      isAuthenticated: true,
      needsOnboarding: viewerState.viewer.onboardingCompletedAt === null,
      isEmailAdmin: isEmailAdminViewer(
        viewerState.identity.subject,
        viewerState.viewer,
      ),
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
      listContributedProjects(ctx, viewer._id, 'private', viewer._id),
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
      // What a region-only disclosure shows, for the settings copy (D8).
      regionLabel: city ? getRegionLabel(city) : null,
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
    return await listContributedProjects(ctx, viewer._id, 'private', viewer._id)
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
  returns: v.union(publicProfileOverviewValidator, v.null()),
  handler: async (ctx, args) => {
    const { requester, viewer: user } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )

    if (!user) {
      return null
    }

    const city = user.profile.cityId
      ? await ctx.db.get(user.profile.cityId)
      : null
    const identity = toPublicIdentity(
      user,
      new Map(city ? [[String(city._id), city]] : []),
    )
    const [showcase, recentPosts, followRecord] = await Promise.all([
      listPublicProfileShowcase(ctx, user, requester?._id ?? null),
      listProfilePosts(ctx, {
        audience: 'public',
        requester,
        userId: user._id,
        limit: PROFILE_RECENT_WORK_LIMIT,
      }),
      requester
        ? ctx.db
            .query('follows')
            .withIndex('by_pair', (query) =>
              query.eq('followerId', requester._id).eq('followingId', user._id),
            )
            .unique()
        : null,
    ])

    return {
      userId: identity.userId,
      githubUsername: identity.githubUsername,
      profile: {
        displayName: identity.displayName,
        bio: user.profile.bio,
        avatarUrl: identity.avatarUrl ?? '',
        buildStatus: identity.buildStatus,
        socialLinks: user.profile.socialLinks,
        location: identity.location,
        city: resolvePublicCityLabel(user, city),
      },
      stats: toPublicProfileStats(user),
      privacy: toPublicProfilePrivacy(user.privacy),
      githubContributions: user.githubContributions ?? null,
      pinnedProjects: showcase.pinnedProjects,
      recentProjects: showcase.recentProjects,
      recentPosts,
      ...(requester ? { viewerFollowsProfile: Boolean(followRecord) } : {}),
    }
  },
})

/**
 * The profile's shipping log (plan item D6): public releases and posts,
 * newest first. Same access rule as the overview; null for a profile the
 * requester cannot see, an empty array when there is nothing to list.
 */
export const publicProfileShippingLog = query({
  args: {
    username: v.string(),
  },
  returns: v.union(v.array(shippingLogEntryValidator), v.null()),
  handler: async (ctx, args) => {
    const { viewer: user } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!user) {
      return null
    }

    return await listProfileShippingLog(ctx, user)
  },
})

export const publicProfileProjects = query({
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

    return await listPublicProfileProjects(ctx, viewer, requester?._id ?? null)
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
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    if (!isContributionsVisibleOnPublicProfile(viewer.privacy)) {
      return []
    }

    return await listContributedProjects(
      ctx,
      viewer._id,
      'public',
      requester?._id ?? null,
    )
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
    const { requester, viewer } = await getAccessiblePublicProfileViewer(
      ctx,
      args.username,
    )
    if (!viewer) {
      return null
    }

    return await listPublicLikedProjects(ctx, viewer, requester?._id ?? null)
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
    assertProfileTextLimits(args)
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }
    await enforceRateLimit(ctx, 'profileUpdate', String(viewer._id))

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
    await syncOwnedProjectOwnerState(ctx, viewer, updatedViewer)

    return await ctx.db.get(viewer._id)
  },
})

/**
 * Updates the viewer's privacy settings. Every field is optional: the given
 * fields are merged over the stored settings, so a client can save one
 * control (for example `{ cityVisibility }`) without resending, and possibly
 * overwriting, the others. A full object still works. A city visibility
 * change re-derives the owner state and city counters in the same mutation.
 */
export const updatePrivacy = mutation({
  args: {
    profileVisibility: v.optional(
      v.union(v.literal('public'), v.literal('locatic_only')),
    ),
    followGraphVisibility: v.optional(
      v.union(v.literal('public'), v.literal('private')),
    ),
    commentHistoryVisibility: v.optional(
      v.union(v.literal('public'), v.literal('private')),
    ),
    likedProjectsVisibility: v.optional(
      v.union(v.literal('public'), v.literal('private')),
    ),
    contributionsVisibility: v.optional(
      v.union(v.literal('public'), v.literal('private')),
    ),
    cityVisibility: v.optional(
      v.union(
        v.literal('exact_city'),
        v.literal('region_only'),
        v.literal('hidden'),
      ),
    ),
    appearInPulse: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const changes = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    ) as Partial<Doc<'users'>['privacy']>
    const privacy: Doc<'users'>['privacy'] = {
      ...viewer.privacy,
      ...changes,
      contributionsVisibility:
        changes.contributionsVisibility ??
        viewer.privacy.contributionsVisibility ??
        'public',
    }

    await ctx.db.patch(viewer._id, {
      privacy,
      updatedAt: Date.now(),
    })

    if (privacy.cityVisibility !== viewer.privacy.cityVisibility) {
      await syncOwnedProjectOwnerState(ctx, viewer, { ...viewer, privacy })
    }

    return null
  },
})

// In-app notification keys only. Email preferences go through
// emailPreferences.updateEmailPreference (the single writer, with consent log).
const inAppNotificationKeyValidator = v.union(
  v.literal('projectLikes'),
  v.literal('updateLikes'),
  v.literal('comments'),
  v.literal('commentReplies'),
  v.literal('newFollowers'),
  v.literal('dms'),
  v.literal('contributorRecognized'),
)

// One key per call, so a stale settings tab cannot restore old values.
export const updateNotificationPref = mutation({
  args: { key: inAppNotificationKeyValidator, value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    await ctx.db.patch(viewer._id, {
      notificationPrefs: {
        ...viewer.notificationPrefs,
        [args.key]: args.value,
      },
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

    await syncOwnedProjectOwnerState(ctx, viewer, {
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
    // Null when the user picked "can't find my city" (plan U5); they keep
    // global discovery and can set a city later in settings.
    cityId: cityReferenceValidator,
    // Omitted when the status step was skipped; the sign-up default stays.
    buildStatus: v.optional(buildStatusValidator),
    // Omitted by the minimal onboarding flow; existing links stay.
    socialLinks: v.optional(
      v.object({
        github: v.string(),
        x: v.union(v.string(), v.null()),
        linkedin: v.union(v.string(), v.null()),
        bluesky: v.union(v.string(), v.null()),
        website: v.union(v.string(), v.null()),
      }),
    ),
    onboardingSelectedOwnedProjectIds: v.array(v.id('projects')),
    exploreCityIds: v.array(v.id('cities')),
    stackPrefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    assertProfileTextLimits(args)
    await enforceRateLimit(ctx, 'profileUpdate', String(viewer._id))
    if (args.cityId && !(await ctx.db.get(args.cityId))) {
      throw new ConvexError('City not found')
    }

    for (const projectId of args.onboardingSelectedOwnedProjectIds) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== viewer._id) {
        throw new ConvexError(
          'Selected projects must belong to the current viewer',
        )
      }
    }

    const profile = {
      ...viewer.profile,
      displayName: args.displayName,
      fullName: args.displayName,
      bio: args.bio,
      cityId: args.cityId,
      buildStatus: args.buildStatus ?? viewer.profile.buildStatus,
      socialLinks: args.socialLinks ?? viewer.profile.socialLinks,
    }

    const updatedViewer = {
      ...viewer,
      profile,
      onboardingSelectedOwnedProjectIds: args.onboardingSelectedOwnedProjectIds,
      exploreConfig: {
        cityIds: args.exploreCityIds,
        stackPrefs: args.stackPrefs,
      },
      onboardingCompletedAt: Date.now(),
    }

    await ctx.db.patch(viewer._id, {
      profile,
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
    await syncOwnedProjectOwnerState(ctx, viewer, updatedViewer)

    // New members are told about update emails on the last step and start
    // subscribed; the consent log records that default once.
    const priorPreference = await ctx.db
      .query('email_preference_changes')
      .withIndex('by_user_and_changed_at', (q) => q.eq('userId', viewer._id))
      .first()
    if (!priorPreference && isSubscribed(viewer, 'product_updates')) {
      await ctx.db.insert('email_preference_changes', {
        userId: viewer._id,
        category: 'product_updates',
        subscribed: true,
        source: 'signup_default',
        changedAt: Date.now(),
      })
    }

    return await ctx.db.get(viewer._id)
  },
})

/** Most builders the optional onboarding follow step shows (plan D7). */
const ONBOARDING_SUGGESTION_LIMIT = 5
// Region-only, hidden, deleted and deactivated users share the index prefix and
// are dropped after the read, so read a little more than is shown. Bounded
// either way: one indexed range read plus one follow lookup per shown builder.
const ONBOARDING_SUGGESTION_SCAN_LIMIT = 25

/**
 * Builders in the city chosen during onboarding, for the optional follow step
 * (plan D7) and Home's "builders near you". Exact-city members only (D8),
 * never the viewer, public identity only. An empty array means the step is
 * skipped. Builders the viewer already follows stay in the list, marked by
 * `viewerIsFollowing`, so a row never disappears under the viewer's own click.
 *
 * Order (plan item D4), as in Explore's builders mode and city pages: most
 * recent public work first, from one descending read of
 * `by_city_public_activity`. Convex sorts a missing field before every number,
 * so builders without `stats.lastPublicActivityAt` come after every active
 * builder, newest account first (index ties fall back to insertion order).
 */
export const suggestOnboardingBuilders = query({
  args: {
    cityId: v.id('cities'),
  },
  returns: v.array(
    v.object({
      ...publicIdentityFields,
      projectsCount: v.number(),
      isNewBuilder: v.boolean(),
      viewerIsFollowing: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const city = await ctx.db.get(args.cityId)
    if (!city) {
      return []
    }

    const candidates = await ctx.db
      .query('users')
      .withIndex('by_city_public_activity', (query) =>
        query.eq('appearInExplore', true).eq('profile.cityId', city._id),
      )
      .order('desc')
      .take(ONBOARDING_SUGGESTION_SCAN_LIMIT)

    const builders = candidates
      .filter(
        (user) =>
          user._id !== viewer._id &&
          user.deletedAt === null &&
          user.deactivatedAt === null &&
          isCityMember(user, city._id),
      )
      .slice(0, ONBOARDING_SUGGESTION_LIMIT)
    const cityById = new Map([[String(city._id), city]])
    const now = Date.now()

    return await Promise.all(
      builders.map(async (user) => {
        const follow = await ctx.db
          .query('follows')
          .withIndex('by_pair', (query) =>
            query.eq('followerId', viewer._id).eq('followingId', user._id),
          )
          .unique()

        return {
          ...toPublicIdentity(user, cityById),
          projectsCount: user.stats.projectsCount,
          isNewBuilder: isNewBuilderAccount(user.createdAt, now),
          viewerIsFollowing: follow !== null,
        }
      }),
    )
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

    await syncOwnedProjectOwnerState(ctx, viewer, {
      ...viewer,
      deactivatedAt: now,
      appearInExplore: false,
    })

    await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
      userId: viewer._id,
      before: now,
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

// Projects or users per backfill run. A project costs two indexed activity
// reads; after migration, a user costs one indexed project read.
const LAST_PUBLIC_ACTIVITY_BACKFILL_BATCH = 5
const MAX_LAST_PUBLIC_ACTIVITY_BACKFILL_BATCH = 10

/**
 * Fills exact project activity, then recomputes every user's
 * `stats.lastPublicActivityAt` from the project activity index (plan item D4).
 * Both phases page and schedule themselves from one human-run entry point:
 *
 *   npx convex run users:backfillLastPublicActivity '{}'
 *
 * The final scheduled page logs a structured `complete` record with totals.
 * Finish this backfill before deploying the frontend that relies on exact
 * activity ordering.
 */
export const backfillLastPublicActivity = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    phase: v.optional(v.union(v.literal('projects'), v.literal('users'))),
    scannedTotal: v.optional(v.number()),
    patchedTotal: v.optional(v.number()),
  },
  returns: v.object({
    phase: v.union(v.literal('projects'), v.literal('users')),
    scanned: v.number(),
    patched: v.number(),
    scannedTotal: v.number(),
    patchedTotal: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(
      Math.max(
        Math.floor(args.batchSize ?? LAST_PUBLIC_ACTIVITY_BACKFILL_BATCH),
        1,
      ),
      MAX_LAST_PUBLIC_ACTIVITY_BACKFILL_BATCH,
    )
    const phase = args.phase ?? 'projects'
    if (phase === 'projects') {
      const page = await ctx.db
        .query('projects')
        .paginate({ cursor: args.cursor ?? null, numItems: batchSize })
      let patched = 0
      for (const project of page.page) {
        const before = project.locatic.lastPublicActivityAt
        const activityAt = await recomputeProjectPublicActivity(
          ctx.db,
          project._id,
        )
        if (before !== activityAt) patched += 1
      }

      const scannedTotal = (args.scannedTotal ?? 0) + page.page.length
      const patchedTotal = (args.patchedTotal ?? 0) + patched
      await ctx.scheduler.runAfter(
        0,
        internal.users.backfillLastPublicActivity,
        page.isDone
          ? {
              cursor: null,
              batchSize,
              phase: 'users',
              scannedTotal,
              patchedTotal,
            }
          : {
              cursor: page.continueCursor,
              batchSize,
              phase,
              scannedTotal,
              patchedTotal,
            },
      )
      return {
        phase,
        scanned: page.page.length,
        patched,
        scannedTotal,
        patchedTotal,
        isDone: false,
        continueCursor: page.continueCursor,
      }
    }

    const page = await ctx.db
      .query('users')
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize })
    let patched = 0
    for (const user of page.page) {
      const activityAt = await computeLastPublicActivityAt(ctx.db, user._id)
      if ((user.stats.lastPublicActivityAt ?? null) === activityAt) continue
      await ctx.db.patch(user._id, {
        stats: withLastPublicActivity(user.stats, activityAt),
      })
      patched += 1
    }
    const scannedTotal = (args.scannedTotal ?? 0) + page.page.length
    const patchedTotal = (args.patchedTotal ?? 0) + patched
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.users.backfillLastPublicActivity,
        {
          cursor: page.continueCursor,
          batchSize,
          phase,
          scannedTotal,
          patchedTotal,
        },
      )
    } else {
      console.info(
        JSON.stringify({
          job: 'backfillLastPublicActivity',
          status: 'complete',
          scannedTotal,
          patchedTotal,
        }),
      )
    }

    return {
      phase,
      scanned: page.page.length,
      patched,
      scannedTotal,
      patchedTotal,
      isDone: phase === 'users' && page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

/**
 * One-off re-derivation of every user's owner/actor snapshots, project
 * `exploreOwner` fields and city counter contributions under the visibility
 * policy (plan items A2, A4), via `syncOwnedProjectOwnerState`. Not run on
 * deploy; a person runs it once, before `internal.cities.recountStats`:
 *
 *   npx convex run users:backfillOwnerState '{}'            # dev deployment
 *   npx convex run --prod users:backfillOwnerState '{}'     # production
 *
 * It schedules itself page by page over the users table. Idempotent: a user
 * whose stored fields already match writes nothing new to the counters.
 */
export const backfillOwnerState = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processedCount: v.number(),
    scheduledContinuation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 25, 1), 100)
    const page = await ctx.db
      .query('users')
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize })

    for (const user of page.page) {
      await syncOwnedProjectOwnerState(ctx, user, user)
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.users.backfillOwnerState, {
        cursor: page.continueCursor,
        batchSize,
      })
    }

    return {
      processedCount: page.page.length,
      scheduledContinuation: !page.isDone,
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

    // Send records (with the address each went to) and the consent log go
    // with the account, in bounded pages.
    await ctx.scheduler.runAfter(0, internal.emailSends.purgeUserEmailRecords, {
      userId: user._id,
    })

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
      savedProjects,
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
      // The user's own saves only: one index range, like the reads above.
      ctx.db
        .query('saved_projects')
        .withIndex('by_user_created', (query) =>
          query.eq('userId', args.userId),
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

    const reactionsByTarget = new Map<string, typeof reactions>()
    for (const reaction of reactions) {
      const targetKey = `${reaction.targetType}:${reaction.targetId}`
      const targetReactions = reactionsByTarget.get(targetKey) ?? []
      targetReactions.push(reaction)
      reactionsByTarget.set(targetKey, targetReactions)
    }

    const reactionCleanupAt = Date.now()
    for (const targetReactions of reactionsByTarget.values()) {
      const [firstReaction] = targetReactions
      if (!firstReaction) continue

      if (firstReaction.targetType === 'project') {
        const projectId = ctx.db.normalizeId('projects', firstReaction.targetId)
        const project = projectId ? await ctx.db.get(projectId) : null
        if (project) {
          const locatic = targetReactions.reduce(
            (current, reaction) =>
              getNextProjectReactionLocatic(
                { locatic: current },
                reaction.reactionType,
                -1,
              ),
            project.locatic,
          )
          await ctx.db.patch(project._id, {
            locatic,
            updatedAt: reactionCleanupAt,
          })
        }
        continue
      }

      if (firstReaction.targetType === 'post') {
        const postId = ctx.db.normalizeId('posts', firstReaction.targetId)
        const post = postId ? await ctx.db.get(postId) : null
        if (post) {
          const reactionCounts = targetReactions.reduce(
            (current, reaction) =>
              getNextPostReactionCounts(
                { reactionCounts: current },
                reaction.reactionType,
                -1,
              ),
            post.reactionCounts,
          )
          await ctx.db.patch(post._id, {
            reactionCounts,
            updatedAt: reactionCleanupAt,
          })
        }
        continue
      }

      const commentId = ctx.db.normalizeId('comments', firstReaction.targetId)
      const comment = commentId ? await ctx.db.get(commentId) : null
      if (comment) {
        const reactionState = targetReactions.reduce(
          (current, reaction) =>
            getNextCommentReactionState(current, reaction.reactionType, -1),
          {
            likesCount: comment.likesCount,
            reactionCounts: comment.reactionCounts,
          },
        )
        await ctx.db.patch(comment._id, reactionState)
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

    // Deletion already removed these projects from city counts; recording
    // the transition keeps the counters right if a row was still counted.
    const cityStats = createCityStatsChanges()
    for (const project of ownedProjects) {
      const exploreOwner = buildProjectExploreOwner(user, false)
      await cityStats.moveProject(ctx.db, project, project, { exploreOwner })
      await ctx.db.patch(project._id, {
        locatic: {
          ...project.locatic,
          isVisible: false,
        },
        exploreOwner,
        updatedAt: Date.now(),
      })
    }
    await cityStats.apply(ctx.db)

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
      ...savedProjects.map((saved) => ctx.db.delete(saved._id)),
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
      // Every project is hidden and every post deleted above, so no public
      // work is left for the activity signal (plan item D4).
      stats: withLastPublicActivity(
        {
          ...user.stats,
          postsCount: 0,
          commentsCount: 0,
          likedCount: 0,
        },
        null,
      ),
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
    emailVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existingViewer = await getViewerByClerkId(ctx, args.clerkId)
    const now = Date.now()
    await assertGithubUsernameAvailable(ctx, args.githubUsername, {
      exceptUserId: existingViewer?._id,
    })

    if (!existingViewer) {
      const userId = await ctx.db.insert('users', {
        ...createDefaultViewerProfile({
          clerkId: args.clerkId,
          email: args.email,
          githubId: args.githubId,
          githubUsername: args.githubUsername,
          githubUrl: args.githubUrl,
          avatarUrl: args.avatarUrl,
          displayName: args.displayName,
        }),
        emailVerified: args.emailVerified,
      })

      return await ctx.db.get(userId)
    }

    if (existingViewer.deletedAt) {
      return existingViewer
    }

    const nextGithubId = resolveStoredGithubId(
      existingViewer.github.id,
      args.githubId,
    )

    const emailChanged =
      normalizeEmailAddress(args.email) !==
      normalizeEmailAddress(existingViewer.email)

    await ctx.db.patch(existingViewer._id, {
      email: args.email,
      emailVerified: args.emailVerified,
      ...(emailChanged ? { emailChangedAt: now } : {}),
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

    await syncOwnedProjectOwnerState(ctx, existingViewer, {
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

    // Emails still waiting were addressed to the old (or now unverified)
    // address; batches re-check eligibility for everyone else.
    if (
      emailChanged ||
      (existingViewer.emailVerified === true && !args.emailVerified)
    ) {
      await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
        userId: existingViewer._id,
        before: now,
      })
    }

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
