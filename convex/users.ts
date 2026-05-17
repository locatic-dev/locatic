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
import { createDefaultViewerProfile } from './lib/viewer'

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
      ? (
          await ctx.db
            .query('comments')
            .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
            .collect()
        )
          .filter((comment) => !comment.isDeleted)
          .map((comment) => ({
            _id: comment._id,
            targetType: comment.targetType,
            targetId: comment.targetId,
            content: comment.content,
            replyCount: comment.replyCount,
            likesCount: comment.likesCount,
            createdAt: comment.createdAt,
          }))
      : []

  const likedProjects = []
  if (viewer.privacy.likedProjectsVisibility === 'public') {
    const likes = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    for (const like of likes) {
      const projectId = ctx.db.normalizeId('projects', like.targetId)
      if (!projectId) {
        continue
      }

      const project = await ctx.db.get(projectId)
      if (!project || !project.locatic.isVisible) {
        continue
      }

      likedProjects.push({
        reactionId: like._id,
        projectId: project._id,
        fullName: project.github.fullName,
        name: project.github.name,
        likedAt: like.createdAt,
      })
    }
  }

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
    const city = viewer.profile.cityId
      ? await ctx.db.get(viewer.profile.cityId)
      : null
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
      .collect()
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_author', (query) => query.eq('authorId', viewer._id))
      .collect()
    const likedReactions = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    const likedProjects = await Promise.all(
      likedReactions.map(async (reaction) => {
        const projectId = ctx.db.normalizeId('projects', reaction.targetId)
        const project = projectId ? await ctx.db.get(projectId) : null

        return {
          reactionId: reaction._id,
          projectId,
          likedAt: reaction.createdAt,
          project,
        }
      }),
    )

    return {
      viewer: serializeViewer(viewer),
      cityName: city?.displayName ?? null,
      projects,
      comments,
      likedProjects: likedProjects.filter(
        (
          likedProject,
        ): likedProject is {
          reactionId: typeof likedProject.reactionId
          projectId: NonNullable<typeof likedProject.projectId>
          likedAt: number
          project: NonNullable<typeof likedProject.project>
        } => Boolean(likedProject.projectId && likedProject.project),
      ),
    }
  },
})

export const publicProfile = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const requesterIdentity = await ctx.auth.getUserIdentity()
    const requester = requesterIdentity
      ? await getViewerByClerkId(ctx, requesterIdentity.subject)
      : null
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_github_username', (query) =>
        query.eq('github.username', args.username),
      )
      .unique()

    if (!viewer || viewer.deletedAt || viewer.deactivatedAt) {
      return null
    }

    if (viewer.privacy.profileVisibility !== 'public' && !requesterIdentity) {
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
      ...(await getPublicProfilePayload(ctx, viewer)),
    }
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

    const [
      ownedProjects,
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

      if (reaction.targetType === 'update') {
        const updateId = ctx.db.normalizeId('updates', reaction.targetId)
        const update = updateId ? await ctx.db.get(updateId) : null
        if (update) {
          await ctx.db.patch(update._id, {
            reactionCounts: {
              ...update.reactionCounts,
              [reaction.reactionType]: Math.max(
                0,
                (update.reactionCounts[reaction.reactionType] ?? 0) - 1,
              ),
            },
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

      if (comment.targetType === 'update') {
        const updateId = ctx.db.normalizeId('updates', comment.targetId)
        const update = updateId ? await ctx.db.get(updateId) : null
        if (update) {
          await ctx.db.patch(update._id, {
            commentsCount: Math.max(0, update.commentsCount - 1),
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
      stats: {
        ...user.stats,
        commentsCount: 0,
        likedCount: 0,
      },
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

export const deleteFromClerkWebhook = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
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
      return existingViewer
    }

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
