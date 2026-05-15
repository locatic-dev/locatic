import { ConvexError, v } from 'convex/values'

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import {
  getOrCreateViewer,
  getViewerByClerkId,
  getViewerFromAuth,
  getViewerOrThrow,
  requireIdentity,
} from './lib/auth'
import { buildActorSnapshot } from './lib/snapshots'

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
    pinnedOwnedProjectIds: viewer.pinnedOwnedProjectIds,
    onboardingCompletedAt: viewer.onboardingCompletedAt,
    appearInExplore: viewer.appearInExplore,
    deactivatedAt: viewer.deactivatedAt,
    deletedAt: viewer.deletedAt,
  }
}

function resolvePublicCityLabel(
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerFromAuth>>>,
  cityName: string | null,
) {
  switch (viewer.privacy.cityVisibility) {
    case 'hidden':
      return null
    case 'region_only':
      return cityName?.split(',').slice(1).join(',').trim() || null
    case 'exact_city':
    default:
      return cityName
  }
}

async function getPublicProfilePayload(
  ctx: QueryCtx,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewerByClerkId>>>,
) {
  const city = viewer.profile.cityId
    ? await ctx.db.get(viewer.profile.cityId)
    : null
  const projects = await ctx.db
    .query('projects')
    .withIndex('by_owner_visible', (query) =>
      query.eq('ownerId', viewer._id).eq('locatic.isVisible', true),
    )
    .collect()

  const comments =
    viewer.privacy.commentHistoryVisibility === 'public'
      ? await ctx.db
          .query('comments')
          .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
          .collect()
      : []

  const likedProjects =
    viewer.privacy.likedProjectsVisibility === 'public'
      ? await ctx.db
          .query('reactions')
          .withIndex('by_user_target_type', (query) =>
            query
              .eq('userId', viewer._id)
              .eq('targetType', 'project')
              .eq('reactionType', 'like'),
          )
          .collect()
      : []

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
    projects,
    comments,
    likedProjects,
    privacy: viewer.privacy,
  }
}

export const viewerBootstrap = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        isAuthenticated: false,
        needsOnboarding: false,
        viewer: null,
      }
    }

    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return {
        isAuthenticated: true,
        needsOnboarding: true,
        viewer: null,
      }
    }

    return {
      isAuthenticated: true,
      needsOnboarding: viewer.onboardingCompletedAt === null,
      viewer: serializeViewer(viewer),
    }
  },
})

export const privateProfile = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
      .collect()
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
      .collect()
    const likedProjects = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    return {
      viewer: serializeViewer(viewer),
      projects,
      comments,
      likedProjects,
    }
  },
})

export const publicProfile = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_github_username', (query) =>
        query.eq('github.username', args.username),
      )
      .unique()

    if (!viewer || viewer.deletedAt || viewer.deactivatedAt) {
      return null
    }

    return await getPublicProfilePayload(ctx, viewer)
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

    await ctx.db.patch(viewer._id, {
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      updatedAt: Date.now(),
    })

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
    cityVisibility: v.union(
      v.literal('exact_city'),
      v.literal('region_only'),
      v.literal('hidden'),
    ),
    appearInPulse: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    await ctx.db.patch(viewer._id, {
      privacy: args,
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
    pinnedOwnedProjectIds: v.array(v.id('projects')),
    exploreCityIds: v.array(v.id('cities')),
    stackPrefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.pinnedOwnedProjectIds.length > 3) {
      throw new ConvexError('You can pin at most three projects')
    }

    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    for (const projectId of args.pinnedOwnedProjectIds) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== viewer._id) {
        throw new ConvexError(
          'Pinned projects must belong to the current viewer',
        )
      }
    }

    await ctx.db.patch(viewer._id, {
      profile: {
        ...viewer.profile,
        displayName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        buildStatus: args.buildStatus,
        socialLinks: args.socialLinks,
      },
      pinnedOwnedProjectIds: args.pinnedOwnedProjectIds,
      exploreConfig: {
        cityIds: args.exploreCityIds,
        stackPrefs: args.stackPrefs,
      },
      onboardingCompletedAt: Date.now(),
      updatedAt: Date.now(),
    })

    return await ctx.db.get(viewer._id)
  },
})

export const deactivateAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const now = Date.now()

    await ctx.db.patch(viewer._id, {
      deactivatedAt: now,
      appearInExplore: false,
      updatedAt: now,
    })

    return null
  },
})

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const now = Date.now()

    await ctx.db.patch(viewer._id, {
      deletedAt: now,
      deactivatedAt: now,
      appearInExplore: false,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(0, internal.users.finalizeDeletedAccount, {
      userId: viewer._id,
    })

    return null
  },
})

export const finalizeDeletedAccount = internalAction({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.github_actions.cleanupDeletedAccountStars, {
      userId: args.userId,
    })
    await ctx.runMutation(internal.users.scrubDeletedAccount, {
      userId: args.userId,
    })
  },
})

export const scrubDeletedAccount = internalMutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) {
      return null
    }

    const follows = await ctx.db.query('follows').collect()
    const notifications = await ctx.db.query('notifications').collect()
    const messages = await ctx.db.query('messages').collect()
    const homeFeedItems = await ctx.db.query('home_feed_items').collect()

    await Promise.all([
      ...follows
        .filter(
          (follow) =>
            follow.followerId === args.userId ||
            follow.followingId === args.userId,
        )
        .map((follow) => ctx.db.delete(follow._id)),
      ...notifications
        .filter(
          (notification) =>
            notification.recipientId === args.userId ||
            notification.actorId === args.userId,
        )
        .map((notification) => ctx.db.delete(notification._id)),
      ...messages
        .filter((message) => message.senderId === args.userId)
        .map((message) => ctx.db.delete(message._id)),
      ...homeFeedItems
        .filter(
          (item) => item.userId === args.userId || item.actorId === args.userId,
        )
        .map((item) => ctx.db.delete(item._id)),
    ])

    return null
  },
})

export const upsertFromClerkWebhook = mutation({
  args: {
    secret: v.string(),
    clerkId: v.string(),
    email: v.string(),
    githubId: v.union(v.number(), v.null()),
    githubUsername: v.string(),
    githubUrl: v.string(),
    displayName: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.CLERK_WEBHOOK_SHARED_SECRET) {
      throw new ConvexError('Invalid webhook secret')
    }

    const existingViewer = await getViewerByClerkId(ctx, args.clerkId)
    const now = Date.now()

    if (!existingViewer) {
      const userId = await ctx.db.insert('users', {
        clerkId: args.clerkId,
        email: args.email,
        github: {
          id: args.githubId,
          username: args.githubUsername,
        },
        profile: {
          displayName: args.displayName,
          fullName: args.displayName,
          avatarUrl: args.avatarUrl,
          bio: '',
          cityId: null,
          buildStatus: 'just_exploring',
          primaryLanguages: [],
          socialLinks: {
            github: args.githubUrl,
            x: null,
            linkedin: null,
            bluesky: null,
            website: null,
          },
        },
        pinnedOwnedProjectIds: [],
        stats: {
          followersCount: 0,
          followingCount: 0,
          projectsCount: 0,
          contributionsCount: 0,
          commentsCount: 0,
          likedCount: 0,
        },
        exploreConfig: {
          cityIds: [],
          stackPrefs: [],
        },
        appearInExplore: true,
        privacy: {
          profileVisibility: 'public',
          followGraphVisibility: 'public',
          commentHistoryVisibility: 'public',
          likedProjectsVisibility: 'public',
          cityVisibility: 'exact_city',
          appearInPulse: true,
        },
        notificationPrefs: {
          projectLikes: true,
          updateLikes: true,
          comments: true,
          commentReplies: true,
          newFollowers: true,
          dms: true,
          weeklyDigest: false,
          contributorRecognized: true,
        },
        githubLastSyncedAt: null,
        onboardingCompletedAt: null,
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
        deletedAt: null,
      })

      return await ctx.db.get(userId)
    }

    await ctx.db.patch(existingViewer._id, {
      email: args.email,
      github: {
        id: args.githubId,
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
      updatedAt: now,
    })

    return await ctx.db.get(existingViewer._id)
  },
})

export const deleteFromClerkWebhook = mutation({
  args: {
    secret: v.string(),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.CLERK_WEBHOOK_SHARED_SECRET) {
      throw new ConvexError('Invalid webhook secret')
    }

    const viewer = await getViewerByClerkId(ctx, args.clerkId)
    if (!viewer) {
      return null
    }

    await ctx.db.patch(viewer._id, {
      deletedAt: Date.now(),
      deactivatedAt: Date.now(),
      updatedAt: Date.now(),
    })

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
