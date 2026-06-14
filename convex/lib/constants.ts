export const BUILD_STATUS_VALUES = [
  'building_solo',
  'looking_for_cofounder',
  'open_to_collab',
  'hiring',
  'just_exploring',
] as const

export const COMMIT_FREQUENCY_VALUES = ['active', 'slow', 'dormant'] as const

export const CONTRIBUTOR_SYNC_CADENCE_VALUES = [
  'daily',
  'weekly',
  'monthly',
] as const

export const EVENT_TYPE_VALUES = [
  'project_posted',
  'project_liked',
  'project_commented',
  'contributor_matched',
] as const

export const FEED_REASON_VALUES = ['following', 'liked_project_update'] as const

export const NOTIFICATION_TYPE_VALUES = [
  'project_liked',
  'project_commented',
  'comment_replied',
  'followed',
  'dm_received',
  'contributor_recognized',
] as const

export const PROFILE_VISIBILITY_VALUES = ['public', 'locatic_only'] as const
export const FOLLOW_GRAPH_VISIBILITY_VALUES = ['public', 'private'] as const
export const TAB_VISIBILITY_VALUES = ['public', 'private'] as const
export const CITY_VISIBILITY_VALUES = [
  'exact_city',
  'region_only',
  'hidden',
] as const

export const REACTION_TARGET_TYPE_VALUES = [
  'project',
  'post',
  'comment',
] as const

export const COMMENT_TARGET_TYPE_VALUES = ['project', 'post'] as const

export const PULSE_SCOPE_TYPE_VALUES = ['city', 'global'] as const
export const PULSE_TIME_WINDOW_VALUES = ['day', 'week', 'month'] as const
export const PULSE_SORT_VALUES = [
  'locatic_likes',
  'comments',
  'github_stars',
] as const

export const GITHUB_TOKEN_STATUS_VALUES = [
  'active',
  'revoked',
  'needs_reauth',
] as const

export const GITHUB_SYNC_TYPE_VALUES = [
  'initial',
  'manual',
  'scheduled',
] as const

export const GITHUB_SYNC_STATUS_VALUES = [
  'success',
  'failed',
  'token_revoked',
] as const

export const REPORT_REASON_VALUES = [
  'spam',
  'abuse',
  'harassment',
  'other',
] as const

export const REPORT_STATUS_VALUES = ['open', 'reviewed', 'resolved'] as const

export const DEFAULT_PAGE_SIZE = 20
