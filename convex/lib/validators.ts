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
  v.literal('project_liked'),
  v.literal('project_commented'),
  v.literal('post_commented'),
  v.literal('followed'),
  v.literal('contributor_matched'),
)

export const feedReasonValidator = v.union(
  v.literal('following'),
  v.literal('liked_project_update'),
)

export const notificationTypeValidator = v.union(
  v.literal('project_liked'),
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
  v.literal('post'),
  v.literal('comment'),
)

export const commentTargetTypeValidator = v.union(
  v.literal('project'),
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
  v.literal('metadata'),
  v.literal('readme'),
  v.literal('contributors'),
  v.literal('releases'),
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

export const emailCategoryValidator = v.union(
  v.literal('product_updates'),
  v.literal('weekly_digest'),
)

export const emailPreferenceSourceValidator = v.union(
  v.literal('settings'),
  v.literal('unsubscribe_link'),
  v.literal('one_click'),
  v.literal('complaint'),
  v.literal('backfill'),
  v.literal('signup_default'),
)

export const emailCampaignStateValidator = v.union(
  v.literal('draft'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('cancelled'),
)

export const emailSendStatusValidator = v.union(
  v.literal('queued'),
  v.literal('sent'),
  v.literal('delivered'),
  v.literal('bounced'),
  v.literal('complained'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const emailProjectSelectionValidator = v.object({
  projectId: v.id('projects'),
  name: v.string(),
  fullName: v.string(),
  description: optionalStringValidator,
  url: v.string(),
  activityAt: v.number(),
  activityLabel: v.string(),
})

export const emailDiscussionSelectionValidator = v.object({
  commentId: v.id('comments'),
  title: v.string(),
  url: v.string(),
  summary: v.string(),
})

export const emailCtaValidator = v.union(
  v.object({ label: v.string(), url: v.string() }),
  v.null(),
)

export const emailCampaignContentValidator = v.union(
  v.object({
    kind: v.literal('announcement'),
    body: v.string(),
    cta: emailCtaValidator,
  }),
  v.object({
    kind: v.literal('digest'),
    body: v.string(),
    cta: emailCtaValidator,
    periodKey: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    projects: v.array(emailProjectSelectionValidator),
    discussions: v.array(emailDiscussionSelectionValidator),
  }),
)

export const emailCampaignSentValidator = v.object({
  revision: v.number(),
  html: v.string(),
  text: v.string(),
  startedAt: v.number(),
  startedBy: v.id('users'),
  cursor: v.union(v.string(), v.null()),
  lastBatchAt: v.number(),
  enqueuedAt: v.optional(v.number()),
})

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

/** Public location disclosure (see `convex/lib/visibility.ts`). */
export const locationDisclosureValidator = v.union(
  v.object({
    kind: v.literal('city'),
    cityId: v.id('cities'),
    cityName: v.string(),
    regionLabel: optionalStringValidator,
  }),
  v.object({
    kind: v.literal('region'),
    regionLabel: v.string(),
  }),
  v.object({
    kind: v.literal('none'),
  }),
)

/** Fields of `toPublicIdentity` in `convex/lib/visibility.ts`. */
export const publicIdentityFields = {
  userId: v.id('users'),
  displayName: v.string(),
  avatarUrl: optionalStringValidator,
  githubUsername: v.string(),
  buildStatus: buildStatusValidator,
  location: locationDisclosureValidator,
}

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
  ownerLogin: v.string(),
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

export const postSnapshotValidator = v.union(
  v.object({
    body: v.string(),
    reactionCounts: v.record(v.string(), v.number()),
    commentsCount: v.number(),
  }),
  v.null(),
)

export const homeFeedRowKindValidator = v.union(
  v.literal('single_event'),
  v.literal('event_group'),
)

export const homeFeedGroupKindValidator = v.union(
  v.literal('project_posted'),
  v.literal('post_created'),
  v.literal('project_liked'),
  v.literal('project_commented'),
  v.literal('post_commented'),
  v.literal('followed'),
  v.literal('contributor_matched'),
)

export const profileTargetSnapshotValidator = v.object({
  userId: v.id('users'),
  githubUsername: v.string(),
  displayName: v.string(),
  avatarUrl: optionalStringValidator,
  cityName: optionalStringValidator,
})

export const homeFeedTargetValidator = v.union(
  v.object({
    kind: v.literal('project'),
    projectId: v.id('projects'),
    projectSnapshot: projectSnapshotValidator,
  }),
  v.object({
    kind: v.literal('post'),
    projectId: v.id('projects'),
    postId: v.id('posts'),
    projectSnapshot: projectSnapshotValidator,
    postSnapshot: postSnapshotValidator,
  }),
  v.object({
    kind: v.literal('comment'),
    projectId: v.id('projects'),
    postId: v.union(v.id('posts'), v.null()),
    commentId: v.id('comments'),
    rootCommentId: v.optional(v.id('comments')),
    ancestorCommentIds: v.optional(v.array(v.id('comments'))),
    targetType: commentTargetTypeValidator,
    content: v.string(),
    targetLabel: v.string(),
    projectSnapshot: projectSnapshotValidator,
    postSnapshot: v.optional(postSnapshotValidator),
  }),
  v.object({
    kind: v.literal('profile'),
    profile: profileTargetSnapshotValidator,
  }),
  v.object({
    kind: v.literal('pull_request'),
    projectId: v.id('projects'),
    projectSnapshot: projectSnapshotValidator,
    title: v.string(),
    number: v.number(),
    url: optionalStringValidator,
    mergedAt: optionalTimestampValidator,
  }),
)

export const notificationTargetValidator = v.object({
  kind: notificationTargetKindValidator,
  username: optionalStringValidator,
  projectFullName: optionalStringValidator,
  projectOwner: v.optional(optionalStringValidator),
  projectRepo: v.optional(optionalStringValidator),
  conversationId: v.union(v.id('conversations'), v.null()),
  inboxTab: v.optional(v.union(inboxTabValidator, v.null())),
  commentId: v.union(v.id('comments'), v.null()),
})
