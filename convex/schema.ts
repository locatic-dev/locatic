import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  actorSnapshotValidator,
  buildStatusValidator,
  cityReferenceValidator,
  commentTargetSnapshotValidator,
  commentTargetTypeValidator,
  commitFrequencyValidator,
  contributorSyncCadenceValidator,
  eventTypeValidator,
  feedReasonValidator,
  githubSyncStatusValidator,
  githubSyncTypeValidator,
  githubTokenStatusValidator,
  notificationTypeValidator,
  notificationTargetValidator,
  optionalStringValidator,
  optionalTimestampValidator,
  ownerSnapshotValidator,
  postAuthorRoleValidator,
  postSnapshotValidator,
  profileVisibilityValidator,
  projectSnapshotValidator,
  pulseScopeTypeValidator,
  pulseSortValidator,
  pulseTimeWindowValidator,
  reactionTargetTypeValidator,
  reportReasonValidator,
  reportStatusValidator,
  socialLinksValidator,
  tabVisibilityValidator,
  cityVisibilityValidator,
  updateSnapshotValidator,
} from './lib/validators'

export default defineSchema({
  github_tokens: defineTable({
    userId: v.id('users'),
    tokenStatus: githubTokenStatusValidator,
    scopes: v.array(v.string()),
    lastUsedAt: optionalTimestampValidator,
    lastValidatedAt: optionalTimestampValidator,
    lastError: optionalStringValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user_id', ['userId']),

  cities: defineTable({
    slug: v.string(),
    name: v.string(),
    displayName: v.string(),
    normalizedName: v.string(),
    region: optionalStringValidator,
    country: v.string(),
    countryCode: v.string(),
    location: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    address: optionalStringValidator,
    aliases: v.array(v.string()),
    timezone: optionalStringValidator,
    searchText: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_name', ['name'])
    .index('by_country_name', ['countryCode', 'name'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['isActive', 'countryCode'],
    }),

  users: defineTable({
    clerkId: v.string(),
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
    pinnedProfileProjectIds: v.array(v.id('projects')),
    onboardingSelectedOwnedProjectIds: v.array(v.id('projects')),
    syncGithubStarsOnLike: v.boolean(),
    unreadMessagesCount: v.number(),
    stats: v.object({
      followersCount: v.number(),
      followingCount: v.number(),
      projectsCount: v.number(),
      contributionsCount: v.number(),
      commentsCount: v.number(),
      likedCount: v.number(),
    }),
    exploreConfig: v.object({
      cityIds: v.array(v.id('cities')),
      stackPrefs: v.array(v.string()),
    }),
    appearInExplore: v.boolean(),
    discoverability: v.object({
      searchText: v.string(),
    }),
    privacy: v.object({
      profileVisibility: profileVisibilityValidator,
      followGraphVisibility: tabVisibilityValidator,
      commentHistoryVisibility: tabVisibilityValidator,
      likedProjectsVisibility: tabVisibilityValidator,
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
    githubContributions: v.optional(
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
    ),
    githubLastSyncedAt: optionalTimestampValidator,
    onboardingCompletedAt: optionalTimestampValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    deactivatedAt: optionalTimestampValidator,
    deletedAt: optionalTimestampValidator,
  })
    .index('by_clerk_id', ['clerkId'])
    .index('by_github_id', ['github.id'])
    .index('by_github_username', ['github.username'])
    .index('by_city_id', ['profile.cityId'])
    .index('by_city_explore_rank', [
      'profile.cityId',
      'appearInExplore',
      'deletedAt',
      'deactivatedAt',
      'stats.followersCount',
    ])
    .index('by_explore_rank', [
      'appearInExplore',
      'deletedAt',
      'deactivatedAt',
      'stats.followersCount',
    ])
    .index('by_created_at', ['createdAt'])
    .searchIndex('search_identity', {
      searchField: 'discoverability.searchText',
      filterFields: ['appearInExplore', 'deletedAt', 'deactivatedAt'],
    }),

  projects: defineTable({
    ownerId: v.id('users'),
    github: v.object({
      repoId: v.number(),
      fullName: v.string(),
      name: v.string(),
      description: optionalStringValidator,
      githubUrl: v.string(),
      projectUrl: optionalStringValidator,
      primaryLanguage: optionalStringValidator,
      languages: v.array(
        v.object({
          name: v.string(),
          bytes: v.number(),
        }),
      ),
      topics: v.array(v.string()),
      stargazersCount: v.number(),
      lastCommitAt: v.number(),
      lastMetadataSyncedAt: optionalTimestampValidator,
      commitFrequency: commitFrequencyValidator,
      readmePreview: optionalStringValidator,
    }),
    locatic: v.object({
      isVisible: v.boolean(),
      tags: v.array(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      updatesCount: v.number(),
      postsCount: v.optional(v.number()),
      topicsEditedAt: v.optional(v.number()),
    }),
    exploreOwner: v.object({
      cityId: cityReferenceValidator,
      appearInExplore: v.boolean(),
      isActive: v.boolean(),
      isEligible: v.boolean(),
    }),
    ownerSnapshot: ownerSnapshotValidator,
    topContributorsSnapshot: v.array(
      v.object({
        userId: v.id('users'),
        displayName: v.string(),
        avatarUrl: v.string(),
        commitCount: v.number(),
      }),
    ),
    contributorStats: v.object({
      matchedCount: v.number(),
      lastSyncedAt: optionalTimestampValidator,
      syncCadence: contributorSyncCadenceValidator,
    }),
    addedToLocaticAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_github_repo_id', ['github.repoId'])
    .index('by_full_name', ['github.fullName'])
    .index('by_owner', ['ownerId'])
    .index('by_owner_visible', ['ownerId', 'locatic.isVisible'])
    .index('by_explore_eligible_added', [
      'exploreOwner.isEligible',
      'addedToLocaticAt',
    ])
    .index('by_explore_eligible_last_commit', [
      'exploreOwner.isEligible',
      'github.lastCommitAt',
    ])
    .index('by_explore_eligible_likes', [
      'exploreOwner.isEligible',
      'locatic.likesCount',
    ])
    .index('by_explore_eligible_comments', [
      'exploreOwner.isEligible',
      'locatic.commentsCount',
    ])
    .index('by_explore_eligible_stars', [
      'exploreOwner.isEligible',
      'github.stargazersCount',
    ])
    .index('by_explore_city_added', [
      'exploreOwner.cityId',
      'exploreOwner.isEligible',
      'addedToLocaticAt',
    ])
    .index('by_explore_city_last_commit', [
      'exploreOwner.cityId',
      'exploreOwner.isEligible',
      'github.lastCommitAt',
    ])
    .index('by_explore_city_likes', [
      'exploreOwner.cityId',
      'exploreOwner.isEligible',
      'locatic.likesCount',
    ])
    .index('by_explore_city_comments', [
      'exploreOwner.cityId',
      'exploreOwner.isEligible',
      'locatic.commentsCount',
    ])
    .index('by_explore_city_stars', [
      'exploreOwner.cityId',
      'exploreOwner.isEligible',
      'github.stargazersCount',
    ])
    .index('by_city_likes', ['ownerSnapshot.cityId', 'locatic.likesCount'])
    .index('by_city_comments', [
      'ownerSnapshot.cityId',
      'locatic.commentsCount',
    ])
    .index('by_city_added', ['ownerSnapshot.cityId', 'addedToLocaticAt'])
    .index('by_city_last_commit', [
      'ownerSnapshot.cityId',
      'github.lastCommitAt',
    ])
    .index('by_sync_due', [
      'contributorStats.syncCadence',
      'contributorStats.lastSyncedAt',
    ]),

  project_contributors: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    githubId: v.number(),
    githubUsername: v.string(),
    commitCount: v.number(),
    role: v.literal('contributor'),
    isActive: v.boolean(),
    firstMatchedAt: v.number(),
    lastConfirmedAt: v.number(),
    userSnapshot: v.object({
      displayName: v.string(),
      avatarUrl: v.string(),
    }),
  })
    .index('by_project', ['projectId'])
    .index('by_user', ['userId'])
    .index('by_project_user', ['projectId', 'userId'])
    .index('by_github_id', ['githubId']),

  updates: defineTable({
    projectId: v.id('projects'),
    ownerId: v.id('users'),
    versionTag: optionalStringValidator,
    title: optionalStringValidator,
    description: v.string(),
    additionalDetail: optionalStringValidator,
    reactionCounts: v.record(v.string(), v.number()),
    commentsCount: v.number(),
    ownerSnapshot: ownerSnapshotValidator,
    projectSnapshot: v.object({
      name: v.string(),
      fullName: v.string(),
      primaryLanguage: optionalStringValidator,
      languages: v.array(
        v.object({
          name: v.string(),
          bytes: v.number(),
        }),
      ),
    }),
    createdAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_owner', ['ownerId'])
    .index('by_created_at', ['createdAt']),

  posts: defineTable({
    projectId: v.id('projects'),
    ownerId: v.id('users'),
    actorId: v.id('users'),
    authorRole: postAuthorRoleValidator,
    body: v.string(),
    searchText: v.optional(v.string()),
    reactionCounts: v.record(v.string(), v.number()),
    commentsCount: v.number(),
    projectCityId: cityReferenceValidator,
    projectTopics: v.array(v.string()),
    actorSnapshot: actorSnapshotValidator,
    projectSnapshot: v.object({
      name: v.string(),
      fullName: v.string(),
      primaryLanguage: optionalStringValidator,
      languages: v.array(
        v.object({
          name: v.string(),
          bytes: v.number(),
        }),
      ),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: optionalTimestampValidator,
  })
    .index('by_project_deleted_created', [
      'projectId',
      'deletedAt',
      'createdAt',
    ])
    .index('by_actor_deleted_created', ['actorId', 'deletedAt', 'createdAt'])
    .index('by_owner_deleted_created', ['ownerId', 'deletedAt', 'createdAt'])
    .index('by_city_deleted_created', [
      'projectCityId',
      'deletedAt',
      'createdAt',
    ])
    .index('by_deleted_created', ['deletedAt', 'createdAt'])
    .searchIndex('search_body', {
      searchField: 'body',
      filterFields: ['deletedAt', 'projectCityId'],
    })
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['deletedAt', 'projectCityId'],
    }),

  reaction_config: defineTable({
    key: v.optional(v.string()),
    label: v.string(),
    emoji: v.string(),
    icon: v.optional(v.string()),
    targetTypes: v.array(reactionTargetTypeValidator),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_sort_order', ['sortOrder']),

  reactions: defineTable({
    userId: v.id('users'),
    targetType: reactionTargetTypeValidator,
    targetId: v.string(),
    reactionType: v.string(),
    createdAt: v.number(),
  })
    .index('by_target', ['targetType', 'targetId'])
    .index('by_target_reaction_created', [
      'targetType',
      'targetId',
      'reactionType',
      'createdAt',
    ])
    .index('by_user', ['userId'])
    .index('by_user_target_type', ['userId', 'targetType', 'reactionType'])
    .index('by_user_target_type_id_reaction', [
      'userId',
      'targetType',
      'targetId',
      'reactionType',
    ])
    .index('by_user_target_reaction', ['userId', 'targetId', 'reactionType']),

  comments: defineTable({
    targetType: commentTargetTypeValidator,
    targetId: v.string(),
    authorId: v.id('users'),
    parentId: v.union(v.id('comments'), v.null()),
    content: v.string(),
    replyCount: v.number(),
    likesCount: v.number(),
    isDeleted: v.boolean(),
    authorSnapshot: actorSnapshotValidator,
    targetSnapshot: commentTargetSnapshotValidator,
    createdAt: v.number(),
  })
    .index('by_target_parent', ['targetId', 'parentId'])
    .index('by_target_parent_created', ['targetId', 'parentId', 'createdAt'])
    .index('by_target_type_parent_created', [
      'targetType',
      'targetId',
      'parentId',
      'createdAt',
    ])
    .index('by_target_type_parent_likes', [
      'targetType',
      'targetId',
      'parentId',
      'likesCount',
    ])
    .index('by_target_created', ['targetId', 'createdAt'])
    .index('by_target_likes', ['targetId', 'likesCount'])
    .index('by_author', ['authorId'])
    .index('by_created_at', ['createdAt']),

  follows: defineTable({
    followerId: v.id('users'),
    followingId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_follower', ['followerId'])
    .index('by_following', ['followingId'])
    .index('by_pair', ['followerId', 'followingId']),

  activity_events: defineTable({
    actorId: v.id('users'),
    eventType: eventTypeValidator,
    projectId: v.id('projects'),
    updateId: v.union(v.id('updates'), v.null()),
    postId: v.optional(v.union(v.id('posts'), v.null())),
    commentId: v.union(v.id('comments'), v.null()),
    actorSnapshot: actorSnapshotValidator,
    projectSnapshot: projectSnapshotValidator,
    updateSnapshot: updateSnapshotValidator,
    postSnapshot: v.optional(postSnapshotValidator),
    createdAt: v.number(),
  })
    .index('by_actor', ['actorId'])
    .index('by_project_event', ['projectId', 'eventType'])
    .index('by_created_at', ['createdAt']),

  home_feed_items: defineTable({
    userId: v.id('users'),
    sourceEventId: v.id('activity_events'),
    dedupeKey: v.string(),
    reason: feedReasonValidator,
    priority: v.union(v.literal(1), v.literal(2), v.literal(3)),
    actorId: v.id('users'),
    eventType: eventTypeValidator,
    projectId: v.id('projects'),
    updateId: v.union(v.id('updates'), v.null()),
    postId: v.optional(v.union(v.id('posts'), v.null())),
    actorSnapshot: actorSnapshotValidator,
    projectSnapshot: projectSnapshotValidator,
    updateSnapshot: updateSnapshotValidator,
    postSnapshot: v.optional(postSnapshotValidator),
    createdAt: v.number(),
  })
    .index('by_user_priority', ['userId', 'priority'])
    .index('by_user_created', ['userId', 'createdAt'])
    .index('by_created_at', ['createdAt'])
    .index('by_actor_created', ['actorId', 'createdAt'])
    .index('by_user_dedupe', ['userId', 'dedupeKey']),

  conversations: defineTable({
    conversationKey: v.string(),
    participantLowId: v.id('users'),
    participantHighId: v.id('users'),
    lastMessage: v.object({
      content: v.string(),
      senderId: v.id('users'),
      sentAt: v.number(),
    }),
    unreadCounts: v.record(v.string(), v.number()),
    isRequest: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_conversation_key', ['conversationKey'])
    .index('by_participant_low_updated', ['participantLowId', 'updatedAt'])
    .index('by_participant_high_updated', ['participantHighId', 'updatedAt']),

  messages: defineTable({
    conversationId: v.id('conversations'),
    senderId: v.id('users'),
    content: v.string(),
    readAt: optionalTimestampValidator,
    createdAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_created', ['conversationId', 'createdAt'])
    .index('by_sender_created', ['senderId', 'createdAt']),

  notifications: defineTable({
    recipientId: v.id('users'),
    actorId: v.id('users'),
    type: notificationTypeValidator,
    projectId: v.union(v.id('projects'), v.null()),
    updateId: v.union(v.id('updates'), v.null()),
    postId: v.optional(v.union(v.id('posts'), v.null())),
    commentId: v.union(v.id('comments'), v.null()),
    actorSnapshot: v.object({
      displayName: v.string(),
      avatarUrl: v.string(),
    }),
    projectName: optionalStringValidator,
    target: v.optional(notificationTargetValidator),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_recipient_read', ['recipientId', 'isRead'])
    .index('by_recipient_created', ['recipientId', 'createdAt'])
    .index('by_actor_created', ['actorId', 'createdAt'])
    .index('by_read_created', ['isRead', 'createdAt'])
    .index('by_created_at', ['createdAt']),

  github_sync_log: defineTable({
    userId: v.id('users'),
    syncType: githubSyncTypeValidator,
    reposFetched: v.number(),
    reposNew: v.number(),
    reposUpdated: v.number(),
    status: githubSyncStatusValidator,
    error: optionalStringValidator,
    githubRateLimitRemaining: v.union(v.number(), v.null()),
    syncedAt: v.number(),
  }).index('by_user_synced_at', ['userId', 'syncedAt']),

  contributor_sync_config: defineTable({
    cadences: v.object({
      dailyIntervalHours: v.number(),
      weeklyIntervalHours: v.number(),
      monthlyIntervalHours: v.number(),
    }),
    maxContributorsFetched: v.number(),
    maxTopContributorsStored: v.number(),
    lastRunAt: optionalTimestampValidator,
    updatedAt: v.number(),
  }),

  explore_history: defineTable({
    userId: v.id('users'),
    projectId: v.id('projects'),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    dismissedAt: optionalTimestampValidator,
    likedAt: optionalTimestampValidator,
  })
    .index('by_user_project', ['userId', 'projectId'])
    .index('by_user_last_seen', ['userId', 'lastSeenAt'])
    .index('by_user_dismissed', ['userId', 'dismissedAt']),

  pulse_snapshots: defineTable({
    scopeType: pulseScopeTypeValidator,
    scopeId: optionalStringValidator,
    timeWindow: pulseTimeWindowValidator,
    sort: pulseSortValidator,
    rank: v.number(),
    score: v.number(),
    projectId: v.string(),
    projectSnapshot: projectSnapshotValidator,
    computedAt: v.number(),
  })
    .index('by_scope_window_sort_rank', [
      'scopeType',
      'scopeId',
      'timeWindow',
      'sort',
      'rank',
    ])
    .index('by_computed_at', ['computedAt']),

  reports: defineTable({
    reporterId: v.id('users'),
    targetType: v.literal('comment'),
    targetId: v.id('comments'),
    reason: reportReasonValidator,
    details: optionalStringValidator,
    status: reportStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_target', ['targetType', 'targetId'])
    .index('by_reporter', ['reporterId'])
    .index('by_status', ['status']),
})
