import { v } from 'convex/values'

export const buildStatusValidator = v.union(
  v.literal('building_solo'),
  v.literal('looking_for_cofounder'),
  v.literal('open_to_collab'),
  v.literal('hiring'),
  v.literal('just_exploring'),
)

export const commitFrequencyValidator = v.union(
  v.literal('active'),
  v.literal('slow'),
  v.literal('dormant'),
)

export const contributorSyncCadenceValidator = v.union(
  v.literal('daily'),
  v.literal('weekly'),
  v.literal('monthly'),
)

export const eventTypeValidator = v.union(
  v.literal('project_posted'),
  v.literal('post_created'),
  v.literal('update_broadcast'),
  v.literal('project_liked'),
  v.literal('project_commented'),
  v.literal('post_commented'),
  v.literal('contributor_matched'),
)

export const feedReasonValidator = v.union(
  v.literal('following'),
  v.literal('liked_project_update'),
)

export const notificationTypeValidator = v.union(
  v.literal('project_liked'),
  v.literal('update_reacted'),
  v.literal('post_reacted'),
  v.literal('project_commented'),
  v.literal('post_commented'),
  v.literal('comment_replied'),
  v.literal('followed'),
  v.literal('dm_received'),
  v.literal('contributor_recognized'),
)

export const notificationTargetKindValidator = v.union(
  v.literal('profile'),
  v.literal('project'),
  v.literal('conversation'),
)

export const inboxTabValidator = v.union(
  v.literal('inbox'),
  v.literal('requests'),
)

export const profileVisibilityValidator = v.union(
  v.literal('public'),
  v.literal('locatic_only'),
)

export const tabVisibilityValidator = v.union(
  v.literal('public'),
  v.literal('private'),
)

export const cityVisibilityValidator = v.union(
  v.literal('exact_city'),
  v.literal('region_only'),
  v.literal('hidden'),
)

export const reactionTargetTypeValidator = v.union(
  v.literal('project'),
  v.literal('update'),
  v.literal('post'),
  v.literal('comment'),
)

export const commentTargetTypeValidator = v.union(
  v.literal('project'),
  v.literal('update'),
  v.literal('post'),
)

export const postAuthorRoleValidator = v.union(
  v.literal('owner'),
  v.literal('collaborator'),
  v.literal('contributor'),
)

export const pulseScopeTypeValidator = v.union(
  v.literal('city'),
  v.literal('global'),
)

export const pulseTimeWindowValidator = v.union(
  v.literal('day'),
  v.literal('week'),
  v.literal('month'),
)

export const pulseSortValidator = v.union(
  v.literal('locatic_likes'),
  v.literal('comments'),
  v.literal('github_stars'),
)

export const githubTokenStatusValidator = v.union(
  v.literal('active'),
  v.literal('revoked'),
  v.literal('needs_reauth'),
)

export const githubSyncTypeValidator = v.union(
  v.literal('initial'),
  v.literal('manual'),
  v.literal('scheduled'),
)

export const githubSyncStatusValidator = v.union(
  v.literal('success'),
  v.literal('failed'),
  v.literal('token_revoked'),
)

export const reportReasonValidator = v.union(
  v.literal('spam'),
  v.literal('abuse'),
  v.literal('harassment'),
  v.literal('other'),
)

export const reportStatusValidator = v.union(
  v.literal('open'),
  v.literal('reviewed'),
  v.literal('resolved'),
)

export const optionalTimestampValidator = v.union(v.number(), v.null())
export const optionalStringValidator = v.union(v.string(), v.null())

export const cityReferenceValidator = v.union(v.id('cities'), v.null())

export const socialLinksValidator = v.object({
  github: v.string(),
  x: optionalStringValidator,
  linkedin: optionalStringValidator,
  bluesky: optionalStringValidator,
  website: optionalStringValidator,
})

export const ownerSnapshotValidator = v.object({
  displayName: v.string(),
  avatarUrl: v.string(),
  cityId: cityReferenceValidator,
  cityName: optionalStringValidator,
  buildStatus: buildStatusValidator,
})

export const actorSnapshotValidator = v.object({
  displayName: v.string(),
  avatarUrl: v.string(),
  cityId: cityReferenceValidator,
  cityName: optionalStringValidator,
})

export const commentTargetSnapshotValidator = v.object({
  projectFullName: v.string(),
  projectOwner: v.string(),
  projectRepo: v.string(),
  targetLabel: v.string(),
  updateTitle: optionalStringValidator,
})

export const projectSnapshotValidator = v.object({
  name: v.string(),
  fullName: v.string(),
  description: optionalStringValidator,
  primaryLanguage: optionalStringValidator,
  languages: v.array(
    v.object({
      name: v.string(),
      bytes: v.number(),
    }),
  ),
  likesCount: v.number(),
  commentsCount: v.number(),
  stargazersCount: v.number(),
  ownerId: v.id('users'),
  ownerDisplayName: v.string(),
  ownerAvatarUrl: v.string(),
  cityId: cityReferenceValidator,
  cityName: optionalStringValidator,
})

export const updateSnapshotValidator = v.union(
  v.object({
    versionTag: optionalStringValidator,
    title: optionalStringValidator,
    description: v.string(),
    reactionCounts: v.record(v.string(), v.number()),
    commentsCount: v.number(),
  }),
  v.null(),
)

export const postSnapshotValidator = v.union(
  v.object({
    body: v.string(),
    reactionCounts: v.record(v.string(), v.number()),
    commentsCount: v.number(),
  }),
  v.null(),
)

export const notificationTargetValidator = v.object({
  kind: notificationTargetKindValidator,
  username: optionalStringValidator,
  projectFullName: optionalStringValidator,
  conversationId: v.union(v.id('conversations'), v.null()),
  inboxTab: v.optional(v.union(inboxTabValidator, v.null())),
  commentId: v.union(v.id('comments'), v.null()),
})
